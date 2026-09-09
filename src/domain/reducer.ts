import { createSeedState } from './seed';
import { selectWarehouse, warehouseCanFulfill } from './routing';
import type {
  AuditLog,
  DemoAction,
  DemoState,
  FulfillmentStatus,
  IntegrationTask,
  Order,
  ReturnCase,
} from './types';

const DEFAULT_ACTION_TIME = '2026-09-07T09:45:00+03:00';
const DEFAULT_ACTOR = '系统演示账号';
const ACTIVE_TASK_STATUSES = new Set<IntegrationTask['status']>(['pending', 'processing']);

const STATUS_TRANSITIONS: Record<FulfillmentStatus, readonly FulfillmentStatus[]> = {
  pulled: ['pending-validation', 'cancelled', 'exception'],
  'pending-validation': ['pending-routing', 'cancelled', 'exception'],
  'pending-routing': ['pending-dispatch', 'warehouse-accepted', 'cancelled', 'exception'],
  'pending-dispatch': ['warehouse-accepted', 'cancelled', 'exception'],
  'warehouse-accepted': ['picking', 'cancelled', 'exception'],
  picking: ['packed', 'cancelled', 'exception'],
  packed: ['shipped', 'cancelled', 'exception'],
  shipped: ['pending-ozon-sync', 'exception'],
  'pending-ozon-sync': ['completed', 'exception'],
  completed: [],
  cancelled: [],
  exception: ['pending-routing', 'pending-dispatch', 'cancelled'],
};

type AuditInput = Omit<AuditLog, 'id'>;

function appendAudit(state: DemoState, input: AuditInput): DemoState {
  let number = state.auditLogs.length + 1;
  let id = `audit-${String(number).padStart(3, '0')}`;
  while (state.auditLogs.some((audit) => audit.id === id)) {
    number += 1;
    id = `audit-${String(number).padStart(3, '0')}`;
  }
  return { ...state, auditLogs: [...state.auditLogs, { id, ...input }] };
}

function actionTime(action: { at?: string }): string {
  return action.at ?? DEFAULT_ACTION_TIME;
}

function actionActor(action: { actor?: string }): string {
  return action.actor ?? DEFAULT_ACTOR;
}

function withOrder(state: DemoState, nextOrder: Order): DemoState {
  return { ...state, orders: state.orders.map((order) => order.id === nextOrder.id ? nextOrder : order) };
}

function withReturn(state: DemoState, nextReturn: ReturnCase): DemoState {
  return { ...state, returns: state.returns.map((returnCase) => returnCase.id === nextReturn.id ? nextReturn : returnCase) };
}

function nextTaskId(state: DemoState, prefix: string): string {
  let sequence = 1;
  let id = prefix;
  while (state.tasks.some((task) => task.id === id)) {
    sequence += 1;
    id = `${prefix}-${sequence}`;
  }
  return id;
}

function orderHasUnmappedSku(order: Order, state: DemoState): boolean {
  return order.items.some((item) => !state.skuMappings.some((mapping) =>
    mapping.storeId === order.storeId
      && mapping.ozonSku === item.ozonSku
      && mapping.status === 'mapped'
      && Boolean(mapping.warehouseSku),
  ));
}

function dispatchOrder(state: DemoState, action: Extract<DemoAction, { type: 'DISPATCH_ORDER' }>): DemoState {
  const order = state.orders.find((candidate) => candidate.id === action.orderId);
  if (!order || !['pending-routing', 'pending-dispatch', 'exception'].includes(order.status)) return state;

  const existingTask = state.tasks.some((task) => task.idempotencyKey === `outbound:${order.id}`);
  if (existingTask) return state;

  const route = selectWarehouse(order, state);
  if (route.reason === 'unmapped-sku') {
    const blocked = order.status === 'exception' && order.exceptionReason === 'mapping'
      ? state
      : withOrder(state, { ...order, status: 'exception', exceptionReason: 'mapping' });
    return appendAudit(blocked, {
      entityType: 'order', entityId: order.id, action: 'DISPATCH_BLOCKED_MAPPING', actor: actionActor(action),
      detail: 'SKU 未映射，出库任务未创建', createdAt: actionTime(action), timezone: order.timezone,
    });
  }

  const manualOverride = action.manualOverride === true;
  const warehouseId = manualOverride ? action.warehouseId : route.warehouseId;
  const warehouse = state.warehouses.find((candidate) => candidate.id === warehouseId);
  if (!warehouse || !warehouseCanFulfill(order, warehouse, state)) {
    const blocked = order.status === 'exception' && order.exceptionReason === 'stock'
      ? state
      : withOrder(state, { ...order, status: 'exception', exceptionReason: 'stock' });
    return appendAudit(blocked, {
      entityType: 'order', entityId: order.id,
      action: manualOverride ? 'MANUAL_DISPATCH_BLOCKED_STOCK' : 'DISPATCH_BLOCKED_STOCK',
      actor: actionActor(action),
      detail: manualOverride ? '人工改仓校验失败，出库任务未创建' : '可售库存不足，出库任务未创建',
      createdAt: actionTime(action), timezone: order.timezone,
    });
  }

  const quantities = new Map<string, number>();
  for (const item of order.items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  const inventory = state.inventory.map((record) => {
    const quantity = record.warehouseId === warehouse.id ? quantities.get(record.productId) : undefined;
    if (quantity === undefined || record.condition !== 'sellable') return record;
    return { ...record, available: record.available - quantity, reserved: record.reserved + quantity, updatedAt: actionTime(action) };
  });
  const task: IntegrationTask = {
    labelReference: action.labelReference,
    reservation: state.inventory.filter(record => record.warehouseId === warehouse.id && record.condition === 'sellable' && quantities.has(record.productId)).map(record => ({ inventoryId: record.id, quantity: quantities.get(record.productId)! })),
    id: nextTaskId(state, `task-outbound-${order.id}`),
    kind: 'outbound',
    status: 'pending',
    orderId: order.id,
    warehouseId: warehouse.id,
    idempotencyKey: `outbound:${order.id}`,
    retryCount: 0,
    lastAttemptAt: actionTime(action),
    timezone: warehouse.timezone,
    summary: `已下发至${warehouse.name}`,
  };
  const dispatched: DemoState = {
    ...state,
    inventory,
    orders: state.orders.map((candidate) => candidate.id === order.id ? {
      ...candidate,
      assignedWarehouseId: warehouse.id,
      status: 'warehouse-accepted',
      warehouseStatus: 'accepted',
      exceptionReason: undefined,
    } : candidate),
    tasks: [...state.tasks, task],
  };

  return appendAudit(dispatched, {
    entityType: 'order', entityId: order.id,
    action: manualOverride ? 'ORDER_DISPATCHED_MANUAL_OVERRIDE' : 'ORDER_DISPATCHED',
    actor: actionActor(action),
    detail: manualOverride
      ? `运营人工改仓至${warehouse.name}，已重新校验仓库能力与库存并创建唯一出库任务`
      : `已创建唯一出库任务并下发${warehouse.name}`,
    createdAt: actionTime(action), timezone: order.timezone,
  });
}

function setOrderStatus(state: DemoState, action: Extract<DemoAction, { type: 'SET_ORDER_STATUS' }>): DemoState {
  const order = state.orders.find((candidate) => candidate.id === action.orderId);
  if (!order || !STATUS_TRANSITIONS[order.status].includes(action.status)) return state;

  const outbound = state.tasks.find(task => task.idempotencyKey === `outbound:${order.id}`);
  if (action.status === 'cancelled' && (outbound?.stockSettled || ['shipped', 'pending-ozon-sync', 'completed'].includes(order.status))) return state;
  const settle = !outbound?.stockSettled && (action.status === 'shipped' || action.status === 'cancelled');
  const reconciled: DemoState = { ...state,
    inventory: settle ? state.inventory.map(record => {
      const quantity = outbound?.reservation?.find(item => item.inventoryId === record.id)?.quantity;
      if (!quantity) return record;
      return { ...record, reserved: record.reserved - quantity, onHand: record.onHand - (action.status === 'shipped' ? quantity : 0), available: record.available + (action.status === 'cancelled' ? quantity : 0), updatedAt: actionTime(action) };
    }) : state.inventory,
    tasks: state.tasks.map(task => task === outbound && settle ? { ...task, stockSettled: true, status: action.status === 'cancelled' ? 'cancelled' : 'succeeded', lastAttemptAt: actionTime(action) } : task),
  };
  const updated = withOrder(reconciled, {
    ...order,
    status: action.status,
    platformStatus: action.status === 'completed' ? 'delivered' : action.status === 'cancelled' ? 'cancelled' : action.platformStatus ?? order.platformStatus,
    warehouseStatus: action.warehouseStatus ?? order.warehouseStatus,
    exceptionReason: action.status === 'exception' ? 'other' : undefined,
  });
  return appendAudit(updated, {
    entityType: 'order', entityId: order.id, action: 'ORDER_STATUS_CHANGED', actor: actionActor(action),
    detail: `履约状态由 ${order.status} 更新为 ${action.status}`, createdAt: actionTime(action), timezone: order.timezone,
  });
}

function repairMapping(
  state: DemoState,
  action: Extract<DemoAction, { type: 'REPAIR_MAPPING' | 'REPAIR_SKU_MAPPING' }>,
): DemoState {
  const mapping = state.skuMappings.find((candidate) => candidate.id === action.mappingId);
  const warehouse = state.warehouses.find((candidate) => candidate.id === action.warehouseId);
  if (!mapping || !warehouse || action.warehouseSku.trim() === '') return state;

  const at = actionTime(action);
  const skuMappings = state.skuMappings.map((candidate) => candidate.id === mapping.id ? {
    ...candidate,
    status: 'mapped' as const,
    warehouseSku: action.warehouseSku.trim(),
    warehouseId: warehouse.id,
    updatedAt: at,
  } : candidate);
  const mappingState = { ...state, skuMappings };
  const repaired: DemoState = {
    ...state,
    skuMappings,
    tasks: state.tasks.map(task => task.status === 'failed' && task.failureCode === 'mapping' && state.orders.some(order => order.id === task.orderId && order.storeId === mapping.storeId && order.items.some(item => item.ozonSku === mapping.ozonSku) && !orderHasUnmappedSku(order, mappingState)) ? { ...task, status: 'succeeded', summary: 'SKU 映射已修复', lastAttemptAt: at } : task),
    orders: state.orders.map((order) =>
      order.storeId === mapping.storeId
        && order.status === 'exception'
        && order.exceptionReason === 'mapping'
        && order.items.some((item) => item.ozonSku === mapping.ozonSku)
        && !orderHasUnmappedSku(order, mappingState)
        ? { ...order, status: 'pending-routing', exceptionReason: undefined }
        : order,
    ),
  };
  return appendAudit(repaired, {
    entityType: 'mapping', entityId: mapping.id, action: 'MAPPING_REPAIRED', actor: actionActor(action),
    detail: `已映射至云仓货号 ${action.warehouseSku.trim()}`, createdAt: at, timezone: mapping.timezone,
  });
}

function retryTask(state: DemoState, action: Extract<DemoAction, { type: 'RETRY_TASK' }>): DemoState {
  const task = state.tasks.find((candidate) => candidate.id === action.taskId);
  if (!task || task.status !== 'failed' || !task.retryable) return state;
  if (task.orderId) {
    const order = state.orders.find((candidate) => candidate.id === task.orderId);
    if (order && orderHasUnmappedSku(order, state)) return state;
  }

  const retried: DemoState = {
    ...state,
    tasks: state.tasks.map((candidate) => candidate.id === task.id ? {
      ...candidate,
      status: 'succeeded',
      retryCount: candidate.retryCount + 1,
      lastAttemptAt: actionTime(action),
    } : candidate),
  };
  return appendAudit(retried, {
    entityType: 'task', entityId: task.id, action: 'TASK_RETRIED', actor: actionActor(action),
    detail: '失败任务已重新执行并确认成功', createdAt: actionTime(action), timezone: task.timezone,
  });
}

function decideReturn(state: DemoState, action: Extract<DemoAction, { type: 'DECIDE_RETURN' }>): DemoState {
  const returnCase = state.returns.find((candidate) => candidate.id === action.returnCaseId);
  if (!returnCase || returnCase.status !== 'requested') return state;
  const warehouse = action.warehouseId
    ? state.warehouses.find((candidate) => candidate.id === action.warehouseId && candidate.connected && candidate.capabilities.includes('rfbs-return') && state.inventory.some((record) => record.productId === returnCase.productId && record.warehouseId === candidate.id))
    : undefined;
  if (action.decision === 'approved' && !warehouse) return state;

  const at = actionTime(action);
  const decided = withReturn(state, {
    ...returnCase,
    status: action.decision,
    returnWarehouseId: action.decision === 'approved' ? warehouse?.id : undefined,
    updatedAt: at,
  });
  let next = decided;
  if (action.decision === 'approved' && warehouse) {
    const activeReceipts = state.tasks.filter((task) =>
      task.kind === 'return-receipt'
        && task.returnCaseId === returnCase.id
        && ACTIVE_TASK_STATUSES.has(task.status),
    );
    const receiptToKeep = activeReceipts.find((task) => task.warehouseId === warehouse.id) ?? activeReceipts[0];
    if (receiptToKeep) {
      next = {
        ...next,
        tasks: next.tasks.map((task) => {
          if (!activeReceipts.some((active) => active.id === task.id)) return task;
          if (task.id !== receiptToKeep.id) return { ...task, status: 'cancelled' as const };
          if (task.warehouseId === warehouse.id) return task;
          return {
            ...task,
            status: 'pending' as const,
            warehouseId: warehouse.id,
            lastAttemptAt: at,
            timezone: warehouse.timezone,
            summary: '等待云仓签收退货',
          };
        }),
      };
    } else {
      const task: IntegrationTask = {
        id: nextTaskId(state, `task-return-${returnCase.id}`), kind: 'return-receipt', status: 'pending',
        returnCaseId: returnCase.id, warehouseId: warehouse.id, idempotencyKey: `return:${returnCase.id}`,
        retryCount: 0, lastAttemptAt: at, timezone: warehouse.timezone, summary: '等待云仓签收退货',
      };
      next = { ...next, tasks: [...next.tasks, task] };
    }
  } else {
    next = {
      ...next,
      tasks: next.tasks.map((task) =>
        task.returnCaseId === returnCase.id && ACTIVE_TASK_STATUSES.has(task.status)
          ? { ...task, status: 'cancelled' }
          : task,
      ),
    };
  }

  return appendAudit(next, {
    entityType: 'return', entityId: returnCase.id,
    action: action.decision === 'approved' ? 'RETURN_APPROVED' : 'RETURN_REJECTED',
    actor: actionActor(action), detail: action.decision === 'approved' ? '退货申请已同意' : '退货申请已拒绝',
    createdAt: at, timezone: returnCase.timezone,
  });
}

function receiveReturn(state: DemoState, action: Extract<DemoAction, { type: 'RECEIVE_RETURN' }>): DemoState {
  const returnCase = state.returns.find((candidate) => candidate.id === action.returnCaseId);
  if (!returnCase || !['approved', 'in-transit'].includes(returnCase.status)) return state;
  const at = actionTime(action);
  const received = withReturn(state, { ...returnCase, status: 'received', updatedAt: at });
  const next = {
    ...received,
    tasks: received.tasks.map((task) =>
      task.kind === 'return-receipt' && task.returnCaseId === returnCase.id && ACTIVE_TASK_STATUSES.has(task.status)
        ? { ...task, status: 'succeeded' as const, lastAttemptAt: at }
        : task,
    ),
  };
  return appendAudit(next, {
    entityType: 'return', entityId: returnCase.id, action: 'RETURN_RECEIVED', actor: actionActor(action),
    detail: '云仓已签收退货', createdAt: at, timezone: returnCase.timezone,
  });
}

function inspectReturn(state: DemoState, action: Extract<DemoAction, { type: 'INSPECT_RETURN' }>): DemoState {
  const returnCase = state.returns.find((candidate) => candidate.id === action.returnCaseId);
  if (!returnCase || returnCase.status !== 'received' || !returnCase.returnWarehouseId) return state;
  const record = state.inventory.find((candidate) =>
    candidate.productId === returnCase.productId && candidate.warehouseId === returnCase.returnWarehouseId,
  );
  if (!record) return state;
  const at = actionTime(action);
  const inspected = withReturn(state, { ...returnCase, status: 'inspected', updatedAt: at });
  const next: DemoState = {
    ...inspected,
    inventory: inspected.inventory.map((candidate) => candidate.id === record.id ? {
      ...candidate,
      onHand: candidate.onHand + 1,
      available: candidate.available + (action.condition === 'sellable' ? 1 : 0),
      damaged: candidate.damaged + (action.condition === 'damaged' ? 1 : 0),
      updatedAt: at,
    } : candidate),
  };
  return appendAudit(next, {
    entityType: 'return', entityId: returnCase.id, action: 'RETURN_INSPECTED', actor: actionActor(action),
    detail: action.condition === 'sellable' ? '验货完成，商品恢复可售库存' : '验货完成，商品计入残次库存',
    createdAt: at, timezone: returnCase.timezone,
  });
}

function setSafetyStock(state: DemoState, action: Extract<DemoAction, { type: 'SET_SAFETY_STOCK' }>): DemoState {
  const record = state.inventory.find((candidate) => candidate.id === action.inventoryId);
  if (!record || !Number.isFinite(action.safetyStock)) return state;
  const safetyStock = Math.max(0, Math.trunc(action.safetyStock));
  if (record.safetyStock === safetyStock) return state;
  const at = actionTime(action);
  const updated: DemoState = {
    ...state,
    inventory: state.inventory.map((candidate) => candidate.id === record.id
      ? { ...candidate, safetyStock, updatedAt: at }
      : candidate),
  };
  return appendAudit(updated, {
    entityType: 'inventory', entityId: record.id, action: 'SAFETY_STOCK_UPDATED', actor: actionActor(action),
    detail: `安全库存已更新为 ${safetyStock}`, createdAt: at, timezone: record.timezone,
  });
}

function setProductActive(state: DemoState, action: Extract<DemoAction, { type: 'SET_PRODUCT_ACTIVE' }>): DemoState {
  const product = state.products.find((item) => item.id === action.productId);
  if (!product || product.active === action.active) return state;
  return { ...state, products: state.products.map((item) => item.id === product.id ? { ...item, active: action.active } : item) };
}

function setProductPrices(state: DemoState, action: Extract<DemoAction, { type: 'SET_PRODUCT_PRICES' }>): DemoState {
  const allValid = action.updates.length > 0 && action.updates.every((item) => state.products.some((product) => product.id === item.productId)
    && Number.isSafeInteger(item.priceRub) && item.priceRub >= 1
    && (item.promotionPriceRub === undefined || (Number.isSafeInteger(item.promotionPriceRub) && item.promotionPriceRub >= 1 && item.promotionPriceRub < item.priceRub)));
  if (!allValid) return state;
  const valid = new Map(action.updates.map((item) => [item.productId, item]));
  const changed = state.products.some((product) => {
    const update = valid.get(product.id);
    return update && (product.priceRub !== update.priceRub || product.promotionPriceRub !== update.promotionPriceRub);
  });
  if (!changed) return state;
  return { ...state, products: state.products.map((product) => {
    const update = valid.get(product.id);
    return update ? { ...product, priceRub: update.priceRub, promotionPriceRub: update.promotionPriceRub } : product;
  }) };
}

function syncInventory(state: DemoState, action: Extract<DemoAction, { type: 'SYNC_INVENTORY' }>): DemoState {
  const ids = new Set(action.inventoryIds.filter((id) => state.inventory.some((record) => record.id === id)));
  if (!ids.size) return state;
  const at = actionTime(action);
  return { ...state, inventory: state.inventory.map((record) => ids.has(record.id) ? { ...record, updatedAt: at } : record) };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'DISPATCH_ORDER': return dispatchOrder(state, action);
    case 'SET_ORDER_STATUS': return setOrderStatus(state, action);
    case 'REPAIR_MAPPING':
    case 'REPAIR_SKU_MAPPING': return repairMapping(state, action);
    case 'RETRY_TASK': return retryTask(state, action);
    case 'DECIDE_RETURN': return decideReturn(state, action);
    case 'RECEIVE_RETURN': return receiveReturn(state, action);
    case 'INSPECT_RETURN': return inspectReturn(state, action);
    case 'SET_SAFETY_STOCK': return setSafetyStock(state, action);
    case 'SET_PRODUCT_ACTIVE': return setProductActive(state, action);
    case 'SET_PRODUCT_PRICES': return setProductPrices(state, action);
    case 'SYNC_INVENTORY': return syncInventory(state, action);
    case 'UPDATE_WAREHOUSE_CONFIG': {
      if (!Number.isSafeInteger(action.priority) || action.priority < 1 || !Number.isSafeInteger(action.estimatedProcessingHours) || action.estimatedProcessingHours < 1) return state;
      const warehouse = state.warehouses.find((item) => item.id === action.warehouseId);
      if (!warehouse || (warehouse.priority === action.priority && warehouse.estimatedProcessingHours === action.estimatedProcessingHours && warehouse.connected === action.connected)) return state;
      return { ...state, warehouses: state.warehouses.map((item) => item.id === warehouse.id ? { ...item, priority: action.priority, estimatedProcessingHours: action.estimatedProcessingHours, connected: action.connected } : item) };
    }
    case 'UPDATE_SETTINGS': {
      if (![5, 15, 30, 60].includes(action.inventorySyncMinutes)) return state;
      if (state.settings.inventorySyncMinutes === action.inventorySyncMinutes && state.settings.autoRouteEnabled === action.autoRouteEnabled) return state;
      return { ...state, settings: { inventorySyncMinutes: action.inventorySyncMinutes, autoRouteEnabled: action.autoRouteEnabled } };
    }
    case 'UPDATE_STORE_CONNECTION': {
      const store = state.stores.find((item) => item.id === action.storeId);
      if (!store || store.connected === action.connected) return state;
      return { ...state, stores: state.stores.map((item) => item.id === store.id ? { ...item, connected: action.connected } : item) };
    }
    case 'RESET':
    case 'RESET_DEMO': return createSeedState();
  }
}
