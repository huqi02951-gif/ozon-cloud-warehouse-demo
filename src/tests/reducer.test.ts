import { describe, expect, it } from 'vitest';
import { demoReducer } from '../domain/reducer';
import { createSeedState } from '../domain/seed';
import { selectDashboardMetrics } from '../domain/selectors';

describe('demoReducer', () => {
  it('does not create two active outbound tasks for repeated dispatch', () => {
    const state = createSeedState();
    const once = demoReducer(state, { type: 'DISPATCH_ORDER', orderId: 'order-normal' });
    const twice = demoReducer(once, { type: 'DISPATCH_ORDER', orderId: 'order-normal' });

    expect(twice.tasks.filter((task) => task.orderId === 'order-normal' && task.kind === 'outbound')).toHaveLength(1);
    expect(twice.auditLogs).toHaveLength(once.auditLogs.length);
  });

  it('reuses the idempotency record after the first outbound task succeeds', () => {
    const state = createSeedState();
    const once = demoReducer(state, { type: 'DISPATCH_ORDER', orderId: 'order-normal' });
    const completedTask = {
      ...once,
      tasks: once.tasks.map((task) => task.idempotencyKey === 'outbound:order-normal'
        ? { ...task, status: 'succeeded' as const }
        : task),
    };

    const repeated = demoReducer(completedTask, { type: 'DISPATCH_ORDER', orderId: 'order-normal' });

    expect(repeated.tasks.filter((task) => task.idempotencyKey === 'outbound:order-normal')).toHaveLength(1);
    expect(repeated.inventory).toBe(completedTask.inventory);
  });

  it('dispatches to a valid warehouse, reserves stock, updates status, and audits the action', () => {
    const state = createSeedState();
    const before = state.inventory.find((record) => record.productId === 'product-01' && record.warehouseId === 'wh-moscow')!;

    const next = demoReducer(state, { type: 'DISPATCH_ORDER', orderId: 'order-normal' });
    const order = next.orders.find((item) => item.id === 'order-normal')!;
    const inventory = next.inventory.find((record) => record.id === before.id)!;

    expect(order).toMatchObject({ status: 'warehouse-accepted', assignedWarehouseId: 'wh-moscow' });
    expect(inventory).toMatchObject({ available: before.available - 2, reserved: before.reserved + 2 });
    expect(next.auditLogs.at(-1)).toMatchObject({ entityId: 'order-normal', action: 'ORDER_DISPATCHED' });
  });

  it('ignores an unmarked caller warehouse and uses the automatic route', () => {
    const state = createSeedState();

    const next = demoReducer(state, {
      type: 'DISPATCH_ORDER',
      orderId: 'order-normal',
      warehouseId: 'wh-kazan',
    });

    expect(next.orders.find((order) => order.id === 'order-normal')?.assignedWarehouseId).toBe('wh-moscow');
    expect(next.tasks.find((task) => task.idempotencyKey === 'outbound:order-normal')?.warehouseId).toBe('wh-moscow');
  });

  it('honors and audits a valid explicit manual warehouse override', () => {
    const state = createSeedState();

    const next = demoReducer(state, {
      type: 'DISPATCH_ORDER',
      orderId: 'order-normal',
      warehouseId: 'wh-kazan',
      manualOverride: true,
      actor: '运营员',
    });

    expect(next.orders.find((order) => order.id === 'order-normal')?.assignedWarehouseId).toBe('wh-kazan');
    expect(next.tasks.find((task) => task.idempotencyKey === 'outbound:order-normal')?.warehouseId).toBe('wh-kazan');
    expect(next.auditLogs.at(-1)).toMatchObject({
      entityId: 'order-normal',
      action: 'ORDER_DISPATCHED_MANUAL_OVERRIDE',
      actor: '运营员',
    });
  });

  it('reserves the sum of duplicate product lines', () => {
    const state = createSeedState();
    const order = state.orders.find((item) => item.id === 'order-normal')!;
    const item = order.items[0];
    const withDuplicateLines = {
      ...state,
      orders: state.orders.map((candidate) => candidate.id === order.id
        ? { ...candidate, items: [{ ...item, quantity: 1 }, { ...item, quantity: 2 }] }
        : candidate),
    };
    const before = state.inventory.find((record) => record.productId === item.productId && record.warehouseId === 'wh-moscow')!;

    const next = demoReducer(withDuplicateLines, { type: 'DISPATCH_ORDER', orderId: order.id });

    expect(next.inventory.find((record) => record.id === before.id)?.reserved).toBe(before.reserved + 3);
  });

  it('does not dispatch terminal orders', () => {
    const state = createSeedState();

    expect(demoReducer(state, { type: 'DISPATCH_ORDER', orderId: 'order-return' })).toBe(state);
  });

  it('blocks dispatch when the order has an unmapped SKU', () => {
    const state = createSeedState();

    const next = demoReducer(state, { type: 'DISPATCH_ORDER', orderId: 'order-unmapped' });

    expect(next.orders.find((order) => order.id === 'order-unmapped')?.status).toBe('exception');
    expect(next.tasks.filter((task) => task.orderId === 'order-unmapped' && task.kind === 'outbound')).toHaveLength(0);
    expect(next.auditLogs.at(-1)).toMatchObject({ action: 'DISPATCH_BLOCKED_MAPPING' });
  });

  it('repairs a mapping and returns affected orders to routing', () => {
    const state = createSeedState();
    const mapping = state.skuMappings.find((item) => item.status === 'unmapped')!;

    const next = demoReducer(state, {
      type: 'REPAIR_MAPPING',
      mappingId: mapping.id,
      warehouseSku: 'CW-9008',
      warehouseId: 'wh-kazan',
    });

    expect(next.skuMappings.find((item) => item.id === mapping.id)).toMatchObject({
      status: 'mapped',
      warehouseSku: 'CW-9008',
      warehouseId: 'wh-kazan',
    });
    expect(next.orders.find((order) => order.id === 'order-unmapped')?.status).toBe('pending-routing');
    expect(next.auditLogs.at(-1)).toMatchObject({ entityType: 'mapping', action: 'MAPPING_REPAIRED' });
  });

  it('keeps a multi-SKU mapping exception until every order item is mapped', () => {
    const state = createSeedState();
    const order = state.orders.find((item) => item.id === 'order-unmapped')!;
    const secondItem = state.orders.find((item) => item.id === 'order-normal')!.items[0];
    const secondMapping = state.skuMappings.find((mapping) =>
      mapping.storeId === order.storeId && mapping.ozonSku === secondItem.ozonSku,
    )!;
    const withTwoUnmappedItems = {
      ...state,
      orders: state.orders.map((candidate) => candidate.id === order.id
        ? { ...candidate, status: 'pending-dispatch' as const, items: [...candidate.items, secondItem] }
        : candidate),
      skuMappings: state.skuMappings.map((mapping) => mapping.id === secondMapping.id
        ? { ...mapping, status: 'unmapped' as const, warehouseSku: undefined, warehouseId: undefined }
        : mapping),
    };
    const blocked = demoReducer(withTwoUnmappedItems, { type: 'DISPATCH_ORDER', orderId: order.id });
    const firstMapping = blocked.skuMappings.find((mapping) =>
      mapping.storeId === order.storeId && mapping.ozonSku === order.items[0].ozonSku,
    )!;

    const partiallyRepaired = demoReducer(blocked, {
      type: 'REPAIR_MAPPING',
      mappingId: firstMapping.id,
      warehouseSku: 'CW-9008',
      warehouseId: 'wh-kazan',
    });

    expect(partiallyRepaired.orders.find((candidate) => candidate.id === order.id)?.status).toBe('exception');
  });

  it('preserves an unrelated order exception when repairing its SKU mapping', () => {
    const state = createSeedState();
    const order = state.orders.find((item) => item.id === 'order-normal')!;
    const mapping = state.skuMappings.find((candidate) =>
      candidate.storeId === order.storeId && candidate.ozonSku === order.items[0].ozonSku,
    )!;
    const unrelatedException = {
      ...state,
      orders: state.orders.map((candidate) => candidate.id === order.id
        ? { ...candidate, status: 'exception' as const }
        : candidate),
    };

    const next = demoReducer(unrelatedException, {
      type: 'REPAIR_MAPPING',
      mappingId: mapping.id,
      warehouseSku: 'CW-OTHER-CAUSE',
      warehouseId: 'wh-kazan',
    });

    expect(next.orders.find((candidate) => candidate.id === order.id)?.status).toBe('exception');
  });

  it('completes a retryable failed task in place and rejects a duplicate retry', () => {
    const state = createSeedState();
    const failed = state.tasks.find((task) => task.retryable)!;
    const next = demoReducer(state, { type: 'RETRY_TASK', taskId: failed.id });
    const duplicate = demoReducer(next, { type: 'RETRY_TASK', taskId: failed.id });

    expect(next.tasks).toHaveLength(state.tasks.length);
    expect(next.tasks.find((task) => task.id === failed.id)).toMatchObject({ status: 'succeeded', retryCount: failed.retryCount + 1 });
    expect(next.auditLogs.at(-1)).toMatchObject({ entityType: 'task', action: 'TASK_RETRIED' });
    expect(duplicate).toBe(next);
  });

  it('records return approval, receipt, and sellable inspection inventory', () => {
    const state = createSeedState();
    const returnCase = state.returns.find((item) => item.status === 'requested')!;
    const warehouseId = 'wh-novosibirsk';
    const before = state.inventory.find((item) => item.productId === returnCase.productId && item.warehouseId === warehouseId)!;

    const approved = demoReducer(state, { type: 'DECIDE_RETURN', returnCaseId: returnCase.id, decision: 'approved', warehouseId });
    const received = demoReducer(approved, { type: 'RECEIVE_RETURN', returnCaseId: returnCase.id });
    const inspected = demoReducer(received, { type: 'INSPECT_RETURN', returnCaseId: returnCase.id, condition: 'sellable' });

    expect(approved.returns.find((item) => item.id === returnCase.id)).toMatchObject({ status: 'approved', returnWarehouseId: warehouseId });
    expect(received.returns.find((item) => item.id === returnCase.id)?.status).toBe('received');
    expect(inspected.returns.find((item) => item.id === returnCase.id)?.status).toBe('inspected');
    expect(inspected.inventory.find((item) => item.id === before.id)).toMatchObject({ onHand: before.onHand + 1, available: before.available + 1 });
  });

  it('retargets an existing active return receipt task when approval changes warehouse', () => {
    const state = createSeedState();
    const returnCase = state.returns.find((item) => item.id === 'return-01')!;

    const next = demoReducer(state, {
      type: 'DECIDE_RETURN',
      returnCaseId: returnCase.id,
      decision: 'approved',
      warehouseId: 'wh-moscow',
    });
    const activeReceiptTasks = next.tasks.filter((task) =>
      task.kind === 'return-receipt'
        && task.returnCaseId === returnCase.id
        && (task.status === 'pending' || task.status === 'processing'),
    );

    expect(activeReceiptTasks).toHaveLength(1);
    expect(activeReceiptTasks[0]).toMatchObject({
      id: 'task-return-receipt',
      status: 'pending',
      warehouseId: 'wh-moscow',
      timezone: 'Europe/Moscow',
    });
  });

  it('rejects a return without changing inventory', () => {
    const state = createSeedState();
    const returnCase = state.returns.find((item) => item.status === 'requested')!;

    const next = demoReducer(state, { type: 'DECIDE_RETURN', returnCaseId: returnCase.id, decision: 'rejected' });

    expect(next.returns.find((item) => item.id === returnCase.id)?.status).toBe('rejected');
    expect(next.inventory).toBe(state.inventory);
  });

  it('applies only valid order status transitions', () => {
    const state = createSeedState();
    const accepted = demoReducer(state, { type: 'SET_ORDER_STATUS', orderId: 'order-normal', status: 'warehouse-accepted' });
    const invalid = demoReducer(accepted, { type: 'SET_ORDER_STATUS', orderId: 'order-normal', status: 'completed' });

    expect(accepted.orders.find((order) => order.id === 'order-normal')?.status).toBe('warehouse-accepted');
    expect(invalid).toBe(accepted);
  });

  it('updates safety stock and resets all demo state', () => {
    const state = createSeedState();
    const record = state.inventory[0];
    const updated = demoReducer(state, { type: 'SET_SAFETY_STOCK', inventoryId: record.id, safetyStock: 8 });

    expect(updated.inventory.find((item) => item.id === record.id)?.safetyStock).toBe(8);
    expect(demoReducer(updated, { type: 'RESET_DEMO' })).toEqual(createSeedState());
  });

  it('rejects non-integer and partially invalid price batches', () => {
    const state = createSeedState();
    const next = demoReducer(state, { type: 'SET_PRODUCT_PRICES', updates: [
      { productId: state.products[0].id, priceRub: 1299 },
      { productId: state.products[1].id, priceRub: 0.49 },
    ] });

    expect(next).toBe(state);
  });
});

describe('selectDashboardMetrics', () => {
  it('derives linked metrics for the selected store', () => {
    const state = createSeedState();
    const all = selectDashboardMetrics(state, {});
    const store = selectDashboardMetrics(state, { storeId: 'store-polaris' });

    expect(all.totalOrders).toBe(30);
    expect(store.totalOrders).toBe(state.orders.filter((order) => order.storeId === 'store-polaris').length);
    expect(store.pendingDispatch).toBeGreaterThan(0);
    expect(store.exceptions).toBeGreaterThanOrEqual(0);
    expect(store.pendingReturns).toBeGreaterThanOrEqual(0);
  });
});
