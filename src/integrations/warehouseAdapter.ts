import type { DemoLabel } from './ozonAdapter';
export interface OutboundResult {
  orderId: string;
  outboundId: string;
  status: 'accepted';
  source: 'mock';
}

export interface WarehouseAdapter {
  createOutbound(orderId: string, label?: DemoLabel): Promise<OutboundResult>;
}

export class WarehouseAdapterError extends Error {
  constructor(
    readonly code: 'WAREHOUSE_REJECTED' | 'WAREHOUSE_ORDER_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'WarehouseAdapterError';
  }
}

const DELAY_MS = 8;
const OUTBOUND_FAILURES: Record<string, WarehouseAdapterError> = {
  'order-warehouse-error': new WarehouseAdapterError(
    'WAREHOUSE_REJECTED',
    '演示云仓拒绝接单，请检查仓库能力后重试',
  ),
};
// The fixed demo dataset is the adapter boundary. Repairing a SKU mapping can make
// its corresponding demo order eligible for this simulated outbound call.
const OUTBOUND_SUCCESS_ORDER_IDS = new Set([
  'order-normal', 'order-fallback', 'order-unmapped', 'order-return',
  ...Array.from({ length: 26 }, (_, index) => `order-${String(index + 5).padStart(2, '0')}`),
]);

function delay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}

export const warehouseAdapter: WarehouseAdapter = {
  async createOutbound(orderId) {
    await delay();

    const failure = OUTBOUND_FAILURES[orderId];
    if (failure) throw failure;
    if (!OUTBOUND_SUCCESS_ORDER_IDS.has(orderId)) {
      throw new WarehouseAdapterError('WAREHOUSE_ORDER_NOT_FOUND', '未找到对应的演示出库单');
    }

    return {
      orderId,
      outboundId: `mock-outbound-${orderId}`,
      status: 'accepted',
      source: 'mock',
    };
  },
};
