import { describe, it, expect, vi } from 'vitest';
import { createDemoRuntime } from '../state/DemoContext';
import { createSeedState } from '../domain/seed';
import type { FulfillmentStatus } from '../domain/types';

const fresh = () => createDemoRuntime({ initialState: createSeedState() });
describe('complete release flows', () => {
  it('routes untouched fallback once and settles normal shipment once', async () => {
    const runtime = fresh();
    expect((await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-fallback' })).ok).toBe(true);
    const fallbackState = runtime.getSnapshot().state;
    expect(fallbackState.orders.find(o => o.id === 'order-fallback')?.assignedWarehouseId).toBe('wh-kazan');
    await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-fallback' });
    expect(runtime.getSnapshot().state).toBe(fallbackState);
    const before = runtime.getSnapshot().state;
    await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-normal' });
    const task = runtime.getSnapshot().state.tasks.find(t => t.idempotencyKey === 'outbound:order-normal')!;
    expect(task.labelReference).toContain('data:application/pdf');
    for (const status of ['picking', 'packed', 'shipped', 'pending-ozon-sync', 'completed'] as FulfillmentStatus[]) {
      expect((await runtime.runCommand({ type: 'SET_ORDER_STATUS', orderId: 'order-normal', status })).ok).toBe(true);
    }
    const state = runtime.getSnapshot().state;
    for (const item of task.reservation!) {
      const original = before.inventory.find(r => r.id === item.inventoryId)!;
      expect(state.inventory.find(r => r.id === item.inventoryId)).toMatchObject({ onHand: original.onHand - item.quantity, reserved: original.reserved, available: original.available - item.quantity });
    }
    expect(state.orders.find(o => o.id === 'order-normal')?.platformStatus).toBe('delivered');
    expect(state.tasks.find(t => t.id === task.id)?.status).toBe('succeeded');
    expect((await runtime.runCommand({ type: 'SET_ORDER_STATUS', orderId: 'order-normal', status: 'cancelled' })).ok).toBe(false);
    expect(runtime.getSnapshot().state).toBe(state);
  });
  it('releases only dispatch-owned stock when cancelled before shipment', async () => {
    const runtime = fresh(); const before = runtime.getSnapshot().state;
    await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-normal' });
    await runtime.runCommand({ type: 'SET_ORDER_STATUS', orderId: 'order-normal', status: 'cancelled' });
    expect(runtime.getSnapshot().state.inventory.map(({ updatedAt, ...r }) => r)).toEqual(before.inventory.map(({ updatedAt, ...r }) => r));
    expect(runtime.getSnapshot().state.tasks.find(t => t.idempotencyKey === 'outbound:order-normal')?.status).toBe('cancelled');
  });
  it('resolves mapping failure then dispatches and completes one return receipt', async () => {
    const runtime = fresh(); const seed = runtime.getSnapshot().state;
    const order = seed.orders.find(o => o.id === 'order-unmapped')!;
    const mapping = seed.skuMappings.find(m => m.storeId === order.storeId && m.ozonSku === order.items[0].ozonSku)!;
    await runtime.runCommand({ type: 'REPAIR_SKU_MAPPING', mappingId: mapping.id, warehouseId: 'wh-moscow', warehouseSku: 'CW-9008' });
    expect(runtime.getSnapshot().state.tasks.find(t => t.id === 'task-sync-unmapped')?.status).toBe('succeeded');
    expect((await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: order.id })).ok).toBe(true);
    const ret = seed.returns.find(r => r.id === 'return-01')!;
    const original = seed.inventory.find(r => r.productId === ret.productId && r.warehouseId === 'wh-moscow')!;
    await runtime.runCommand({ type: 'DECIDE_RETURN', returnCaseId: ret.id, decision: 'approved', warehouseId: 'wh-moscow' });
    await runtime.runCommand({ type: 'RECEIVE_RETURN', returnCaseId: ret.id });
    await runtime.runCommand({ type: 'INSPECT_RETURN', returnCaseId: ret.id, condition: 'sellable' });
    const done = runtime.getSnapshot().state;
    expect(done.inventory.find(r => r.id === original.id)?.onHand).toBe(original.onHand + 1);
    await runtime.runCommand({ type: 'INSPECT_RETURN', returnCaseId: ret.id, condition: 'sellable' });
    expect(runtime.getSnapshot().state).toBe(done);
  });
  it('stops before warehouse and stock reservation when label fails', async () => {
    const createOutbound = vi.fn();
    const runtime = createDemoRuntime({ initialState: createSeedState(), warehouse: { createOutbound }, ozon: { getLabel: async () => { throw new Error('label failed'); } } });
    const before = runtime.getSnapshot().state;
    expect((await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-normal' })).ok).toBe(false);
    expect(createOutbound).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().state).toBe(before);
  });
  it('continues pulled order to dispatch and rejects warehouse inventory mutations', async () => {
    const runtime = fresh(); const order = runtime.getSnapshot().state.orders.find(o => o.status === 'pulled')!;
    for (const status of ['pending-validation', 'pending-routing'] as FulfillmentStatus[]) await runtime.runCommand({ type: 'SET_ORDER_STATUS', orderId: order.id, status });
    expect((await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: order.id })).ok).toBe(true);
    runtime.setRole('warehouse'); const before = runtime.getSnapshot().state;
    const action = { type: 'SET_SAFETY_STOCK' as const, inventoryId: before.inventory[0].id, safetyStock: 99 };
    expect((await runtime.runCommand(action)).ok).toBe(false); runtime.dispatch(action);
    expect(runtime.getSnapshot().state).toBe(before);
  });
});
