import { selectWarehouse } from './routing';
import type { DashboardFilter, DashboardMetrics, DemoState, Order } from './types';

const PENDING_DISPATCH_STATUSES = new Set<Order['status']>([
  'pulled',
  'pending-validation',
  'pending-routing',
  'pending-dispatch',
]);
const ACTIVE_TASK_STATUSES = new Set(['pending', 'processing']);
const DEFAULT_AS_OF = '2026-09-07T09:30:00+03:00';
const CUTOFF_ALERT_WINDOW_MS = 6 * 60 * 60 * 1000;

export function selectDashboardMetrics(state: DemoState, filter: DashboardFilter = {}): DashboardMetrics {
  const selectedStore = filter.storeId && filter.storeId !== 'all' ? filter.storeId : undefined;
  const selectedWarehouse = filter.warehouseId && filter.warehouseId !== 'all' ? filter.warehouseId : undefined;
  const orders = state.orders.filter((order) =>
    (!selectedStore || order.storeId === selectedStore)
      && (!selectedWarehouse || order.assignedWarehouseId === selectedWarehouse),
  );
  const orderIds = new Set(orders.map((order) => order.id));
  const returns = state.returns.filter((returnCase) => orderIds.has(returnCase.orderId));
  const tasks = state.tasks.filter((task) =>
    (task.orderId !== undefined && orderIds.has(task.orderId))
      || (task.returnCaseId !== undefined && returns.some((returnCase) => returnCase.id === task.returnCaseId)),
  );
  const asOf = Date.parse(filter.asOf ?? DEFAULT_AS_OF);

  return {
    totalOrders: orders.length,
    pendingDispatch: orders.filter((order) => PENDING_DISPATCH_STATUSES.has(order.status)).length,
    cutoffAlerts: orders.filter((order) => {
      if (!PENDING_DISPATCH_STATUSES.has(order.status)) return false;
      const remaining = Date.parse(order.cutoffAt) - asOf;
      return remaining >= 0 && remaining <= CUTOFF_ALERT_WINDOW_MS;
    }).length,
    stockoutOrders: orders.filter((order) =>
      (order.status === 'pending-routing' || order.status === 'pending-dispatch' || order.status === 'exception')
        && selectWarehouse(order, state).reason === 'insufficient-stock',
    ).length,
    exceptions: orders.filter((order) => order.status === 'exception').length
      + tasks.filter((task) => task.status === 'failed').length,
    pendingReturns: returns.filter((returnCase) => returnCase.status !== 'rejected' && returnCase.status !== 'inspected').length,
    activeTasks: tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status)).length,
    completedOrders: orders.filter((order) => order.status === 'completed').length,
  };
}
