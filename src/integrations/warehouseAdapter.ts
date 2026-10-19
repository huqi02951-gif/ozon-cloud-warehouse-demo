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

/**
 * 云仓出库单下发协议（中台 → 云仓）。真实云仓（如 4PX/万邑通/自建 WMS）字段各不相同，
 * 服务端 adapter 负责把下面这个统一结构翻译成各家协议。
 */
export interface OutboundOrderPayload {
  outboundNo: string;          // 中台生成的出库单号，幂等键
  postingNumber: string;       // Ozon posting_number
  warehouseCode: string;
  shipBy: string;              // Ozon 截单时间，云仓据此排产
  deliveryMethod: 'FBS' | 'rFBS';
  labelUrl?: string;           // Ozon 面单 PDF（FBS 必须贴 Ozon 面单）
  recipient: { name: string; city: string; region: string; address: string; phone: string };
  lines: Array<{ warehouseSku: string; ozonSku: string; quantity: number }>;
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
    if (!orderId.startsWith('ozon-') && !OUTBOUND_SUCCESS_ORDER_IDS.has(orderId)) {
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
