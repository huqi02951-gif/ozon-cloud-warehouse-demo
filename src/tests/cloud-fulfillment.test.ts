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
