import type { DemoState, WarehouseEvent, WarehouseEventType } from '../domain/types';

/**
 * 实时事件源抽象。
 * - SimulatedEventSource：浏览器内定时模拟云仓回传，用于演示（GitHub Pages）。
 * - SseEventSource：连接服务端 /events（Server-Sent Events），服务端把云仓 webhook
 *   与 Ozon Push 通知统一转发到这里，实现真正的实时看板。
 */
export interface FulfillmentEventSource {
  start(onEvent: (event: WarehouseEvent) => void): () => void;
  readonly kind: 'simulated' | 'sse';
}

const NEXT_EVENT: Partial<Record<string, WarehouseEventType>> = {
  'warehouse-accepted': 'picked',
  picking: 'weighed',
  packed: 'waybill',
};

const CARRIERS = ['Ozon Rocket', 'СДЭК', 'Почта России', 'Boxberry'];

let sequence = 0;

/** 根据当前订单状态推导下一条云仓回传（纯函数，便于测试）。 */
export function nextSimulatedEvent(state: DemoState, now: string, random: () => number = Math.random): WarehouseEvent | undefined {
  const active = state.orders.filter((order) => order.assignedWarehouseId
    && ['warehouse-accepted', 'picking', 'packed'].includes(order.status));
  if (active.length === 0) return undefined;
  const order = active[Math.floor(random() * active.length)];
  const warehouseId = order.assignedWarehouseId!;
  const pkg = order.packages?.[0];
  const packageNo = pkg?.packageNo ?? `PKG-${order.id.toUpperCase()}`;
  const items = order.items.map((item) => ({ ozonSku: item.ozonSku, quantity: item.quantity }));
  sequence += 1;
  const eventId = `sim-${order.id}-${sequence}-${now}`;
  const base = { eventId, orderId: order.id, warehouseId, occurredAt: now, operator: '模拟仓库作业员' };

  let type: WarehouseEventType = NEXT_EVENT[order.status] ?? 'picked';
  // packed 状态下：先回运单，再回出库。
  if (order.status === 'packed' && pkg?.waybillNo) type = 'shipped';
  if (order.status === 'picking' && pkg?.weightGrams !== undefined) type = 'packed';

  switch (type) {
    case 'picked':
      return { ...base, type };
    case 'weighed':
      return { ...base, type, package: { packageNo, items, weightGrams: 300 + Math.round(random() * 2200), dimensionsCm: { length: 30, width: 20, height: 10 + Math.round(random() * 15) } } };
    case 'packed':
      return { ...base, type, package: { packageNo, items } };
    case 'waybill':
      return { ...base, type, package: { packageNo, items, carrier: CARRIERS[Math.floor(random() * CARRIERS.length)], waybillNo: `RU${String(Math.floor(random() * 1e9)).padStart(9, '0')}` } };
    default:
      return { ...base, type: 'shipped', package: { packageNo, items } };
  }
}

export function createSimulatedEventSource(getState: () => DemoState, intervalMs = 4000): FulfillmentEventSource {
  return {
    kind: 'simulated',
    start(onEvent) {
      const timer = setInterval(() => {
        const event = nextSimulatedEvent(getState(), new Date().toISOString());
        if (event) onEvent(event);
      }, intervalMs);
      return () => clearInterval(timer);
    },
  };
}

export function createSseEventSource(url: string): FulfillmentEventSource {
  return {
    kind: 'sse',
    start(onEvent) {
      const source = new EventSource(url);
      source.addEventListener('warehouse', (message) => {
        try { onEvent(JSON.parse((message as MessageEvent<string>).data) as WarehouseEvent); } catch { /* 忽略格式错误事件 */ }
      });
      return () => source.close();
    },
  };
}
