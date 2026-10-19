import { describe, expect, it } from 'vitest';
import { demoReducer } from '../domain/reducer';
import { createSeedState } from '../domain/seed';
import type { DemoState, WarehouseEvent } from '../domain/types';
import { nextSimulatedEvent } from '../realtime/eventSource';
import { createDemoRuntime } from '../state/DemoContext';

const at = (m: number) => `2026-09-07T10:${String(m).padStart(2, '0')}:00+03:00`;
function ev(type: WarehouseEvent['type'], id: string, extra: Partial<WarehouseEvent> = {}): WarehouseEvent {
  return { eventId: id, type, orderId: 'order-normal', warehouseId: 'wh-moscow', occurredAt: at(1), ...extra };
}
function dispatched(): DemoState {
  return demoReducer(createSeedState(), { type: 'DISPATCH_ORDER', orderId: 'order-normal' });
}
const inv = (s: DemoState) => s.inventory.find((r) => r.productId === 'product-01' && r.warehouseId === 'wh-moscow')!;

describe('云仓回传 → Ozon 回写 闭环', () => {
  it('拣货/称重/打包/运单/出库依次回传后进入待回写 Ozon，并只结算一次库存', () => {
    let s = dispatched();
    const before = inv(s);
    const pkg = { packageNo: 'P1', items: [{ ozonSku: 'OZ-DEMO-0001', quantity: 2 }] };
    s = demoReducer(s, { type: 'APPLY_WAREHOUSE_EVENT', event: ev('picked', 'e1') });
    expect(s.orders.find((o) => o.id === 'order-normal')!.status).toBe('picking');
    s = demoReducer(s, { type: 'APPLY_WAREHOUSE_EVENT', event: ev('weighed', 'e2', { package: { ...pkg, weightGrams: 1250 } }) });
    s = demoReducer(s, { type: 'APPLY_WAREHOUSE_EVENT', event: ev('packed', 'e3', { package: pkg }) });
    s = demoReducer(s, { type: 'APPLY_WAREHOUSE_EVENT', event: ev('waybill', 'e4', { package: { ...pkg, waybillNo: 'RU123', carrier: 'СДЭК' } }) });
    s = demoReducer(s, { type: 'APPLY_WAREHOUSE_EVENT', event: ev('shipped', 'e5', { package: pkg }) });
    const order = s.orders.find((o) => o.id === 'order-normal')!;
    expect(order.status).toBe('pending-ozon-sync');
    expect(order.packages).toEqual([{ ...pkg, weightGrams: 1250, waybillNo: 'RU123', carrier: 'СДЭК' }]);
    expect(inv(s).onHand).toBe(before.onHand - 2);
    expect(inv(s).reserved).toBe(before.reserved - 2);
    expect(s.liveEvents!.length).toBe(5);
  });

  it('重复 eventId 幂等，乱序事件不会让状态回退', () => {
    let s = dispatched();
    s = demoReducer(s, { type: 'APPLY_WAREHOUSE_EVENT', event: ev('shipped', 'x1') });
    const afterShip = s;
    expect(demoReducer(s, { type: 'APPLY_WAREHOUSE_EVENT', event: ev('shipped', 'x1') })).toBe(afterShip);
    s = demoReducer(s, { type: 'APPLY_WAREHOUSE_EVENT', event: ev('picked', 'x2') });
    expect(s.orders.find((o) => o.id === 'order-normal')!.status).toBe('pending-ozon-sync');
    expect(inv(s).onHand).toBe(inv(afterShip).onHand);
  });

  it('忽略非指派云仓的回传，拒单转为异常', () => {
    const s = dispatched();
    expect(demoReducer(s, { type: 'APPLY_WAREHOUSE_EVENT', event: ev('picked', 'w1', { warehouseId: 'wh-kazan' }) })).toBe(s);
    const rejected = demoReducer(s, { type: 'APPLY_WAREHOUSE_EVENT', event: ev('rejected', 'r1', { reason: '超尺寸' }) });
    expect(rejected.orders.find((o) => o.id === 'order-normal')!.status).toBe('exception');
    expect(rejected.tasks.find((t) => t.idempotencyKey === 'outbound:order-normal')!.failureCode).toBe('warehouse-refused');
  });

  it('回写 Ozon 成功后订单完成并记录运单；失败进入可重试异常', async () => {
    let s = dispatched();
    s = demoReducer(s, { type: 'APPLY_WAREHOUSE_EVENT', event: ev('waybill', 'y1', { package: { packageNo: 'P', items: [], waybillNo: 'RU9' } }) });
    s = demoReducer(s, { type: 'APPLY_WAREHOUSE_EVENT', event: ev('shipped', 'y2') });
    const runtime = createDemoRuntime({ initialState: s, storage: undefined });
    const failed = await runtime.runCommand({ type: 'SYNC_TO_OZON', orderId: 'order-normal', fail: true });
    expect(failed.ok).toBe(false);
    expect(runtime.getSnapshot().state.tasks.find((t) => t.idempotencyKey === 'ozon-sync:order-normal')).toMatchObject({ status: 'failed', retryable: true });
    const ok = await runtime.runCommand({ type: 'SYNC_TO_OZON', orderId: 'order-normal' });
    expect(ok.ok).toBe(true);
    const order = runtime.getSnapshot().state.orders.find((o) => o.id === 'order-normal')!;
    expect(order).toMatchObject({ status: 'completed', trackingNumber: 'RU9' });
    expect(runtime.getSnapshot().state.tasks.filter((t) => t.idempotencyKey === 'ozon-sync:order-normal')).toHaveLength(1);
  });

  it('模拟事件源只为云仓作业中的订单生成事件', () => {
    expect(nextSimulatedEvent({ ...createSeedState(), orders: [] }, at(0))).toBeUndefined();
    const event = nextSimulatedEvent(dispatched(), at(0), () => 0);
    expect(event).toMatchObject({ type: 'picked' });
  });
});

describe('Ozon 新订单与取消（模拟 Push）', () => {
  const posting = (no: string, offer = 'CN-DEMO-001') => ({
    posting_number: no, status: 'awaiting_packaging' as const, in_process_at: at(0), shipment_date: '2026-09-07T20:00:00+03:00',
    products: [{ sku: 1, offer_id: offer, name: 'x', quantity: 1, price: '790.00' }],
    customer: { address: { city: '莫斯科', region: '莫斯科市' } },
  });

  it('按 offer_id 映射商品创建订单，重复 posting 幂等，未知货号不建单', () => {
    let s = demoReducer(createSeedState(), { type: 'INGEST_OZON_POSTING', posting: posting('111-1'), storeId: 'store-polaris', at: at(0) });
    const order = s.orders.find((o) => o.postingNumber === '111-1')!;
    expect(order).toMatchObject({ id: 'ozon-111-1', status: 'pending-routing', totalRub: 790, fulfillmentType: 'FBS' });
    expect(order.items[0].productId).toBe('product-01');
    expect(demoReducer(s, { type: 'INGEST_OZON_POSTING', posting: posting('111-1'), storeId: 'store-polaris' })).toBe(s);
    const count = s.orders.length;
    s = demoReducer(s, { type: 'INGEST_OZON_POSTING', posting: posting('222-1', 'NOPE'), storeId: 'store-polaris', at: at(1) });
    expect(s.orders).toHaveLength(count);
    expect(s.liveEvents![0].tone).toBe('danger');
  });

  it('新订单可走完整闭环：下发 → 云仓回传 → 回写 Ozon', async () => {
    const s = demoReducer(createSeedState(), { type: 'INGEST_OZON_POSTING', posting: posting('333-1'), storeId: 'store-polaris', at: at(0) });
    const runtime = createDemoRuntime({ initialState: s, storage: undefined });
    expect((await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'ozon-333-1' })).ok).toBe(true);
    const wh = runtime.getSnapshot().state.orders.find((o) => o.id === 'ozon-333-1')!.assignedWarehouseId!;
    for (const [i, type] of (['picked', 'packed', 'waybill', 'shipped'] as const).entries()) {
      runtime.dispatch({ type: 'APPLY_WAREHOUSE_EVENT', event: { eventId: `n${i}`, type, orderId: 'ozon-333-1', warehouseId: wh, occurredAt: at(i + 1), package: { packageNo: 'P', items: [], waybillNo: type === 'waybill' ? 'RU7' : undefined } } });
    }
    expect((await runtime.runCommand({ type: 'SYNC_TO_OZON', orderId: 'ozon-333-1' })).ok).toBe(true);
    expect(runtime.getSnapshot().state.orders.find((o) => o.id === 'ozon-333-1')).toMatchObject({ status: 'completed', trackingNumber: 'RU7' });
  });

  it('未出库前取消释放预占库存；已出库后取消只标记需拦截', () => {
    let s = demoReducer(createSeedState(), { type: 'INGEST_OZON_POSTING', posting: posting('444-1'), storeId: 'store-polaris', at: at(0) });
    const before = inv(s);
    s = demoReducer(s, { type: 'DISPATCH_ORDER', orderId: 'ozon-444-1' });
    expect(inv(s).reserved).toBe(before.reserved + 1);
    s = demoReducer(s, { type: 'OZON_POSTING_CANCELLED', postingNumber: '444-1', at: at(2) });
    expect(s.orders.find((o) => o.id === 'ozon-444-1')!.status).toBe('cancelled');
    expect(inv(s)).toMatchObject({ reserved: before.reserved, available: before.available });

    let t = demoReducer(createSeedState(), { type: 'INGEST_OZON_POSTING', posting: posting('555-1'), storeId: 'store-polaris', at: at(0) });
    t = demoReducer(t, { type: 'DISPATCH_ORDER', orderId: 'ozon-555-1' });
    t = demoReducer(t, { type: 'APPLY_WAREHOUSE_EVENT', event: { eventId: 's1', type: 'shipped', orderId: 'ozon-555-1', warehouseId: 'wh-moscow', occurredAt: at(3) } });
    t = demoReducer(t, { type: 'OZON_POSTING_CANCELLED', postingNumber: '555-1', at: at(4) });
    expect(t.orders.find((o) => o.id === 'ozon-555-1')).toMatchObject({ status: 'pending-ozon-sync', platformStatus: 'cancelled' });
  });
});
