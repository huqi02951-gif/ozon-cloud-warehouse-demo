/**
 * Ozon Seller API 契约（与真实接口字段对齐的最小子集）。
 *
 * 来源：Ozon Seller API 公开文档（docs.ozon.ru/api/seller）中的 FBS/rFBS 发货、商品、库存、
 * 价格、退货与 Push 通知章节。文档站点有反爬跳转，本文件未能在本次会话中逐字核对，
 * 接入真实账号前必须用沙箱/真实响应校验字段名与版本号（v2/v3/v4 会随平台升级变化）。
 *
 * 前端只使用这些类型，不持有 Api-Key；真实请求必须由服务端代理发起（见 server/）。
 */

/** Ozon 平台 posting 状态（FBS/rFBS 常见值）。 */
export type OzonPostingStatus =
  | 'acceptance_in_progress'
  | 'awaiting_approve'
  | 'awaiting_packaging'
  | 'awaiting_registration'
  | 'awaiting_deliver'
  | 'arbitration'
  | 'client_arbitration'
  | 'delivering'
  | 'driver_pickup'
  | 'sent_by_seller'
  | 'delivered'
  | 'cancelled'
  | 'not_accepted';

export const OZON_POSTING_STATUS_LABEL: Record<OzonPostingStatus, string> = {
  acceptance_in_progress: '验收中',
  awaiting_approve: '待确认',
  awaiting_packaging: '待打包',
  awaiting_registration: '待登记',
  awaiting_deliver: '待交运',
  arbitration: '仲裁中',
  client_arbitration: '客户仲裁',
  delivering: '配送中',
  driver_pickup: '司机已揽收',
  sent_by_seller: '卖家已发出',
  delivered: '已签收',
  cancelled: '已取消',
  not_accepted: '分拣中心未接收',
};

/** Ozon Seller API 端点清单：服务端代理按此调用，前端只用于展示与审计。 */
export const OZON_ENDPOINTS = {
  // 订单（posting）
  listUnfulfilled: 'POST /v3/posting/fbs/unfulfilled/list',
  listPostings: 'POST /v3/posting/fbs/list',
  getPosting: 'POST /v3/posting/fbs/get',
  shipPosting: 'POST /v4/posting/fbs/ship',
  packageLabel: 'POST /v2/posting/fbs/package-label',
  cancelPosting: 'POST /v2/posting/fbs/cancel',
  setTrackingNumber: 'POST /v2/fbs/posting/tracking-number/set',
  markDelivering: 'POST /v2/fbs/posting/delivering',
  // 商品 / 库存 / 价格
  listProducts: 'POST /v3/product/list',
  productInfo: 'POST /v3/product/info/list',
  stocksInfo: 'POST /v4/product/info/stocks',
  updateStocks: 'POST /v2/products/stocks',
  pricesInfo: 'POST /v5/product/info/prices',
  importPrices: 'POST /v1/product/import/prices',
  listWarehouses: 'POST /v1/warehouse/list',
  // rFBS 退货
  listRfbsReturns: 'POST /v2/returns/rfbs/list',
  getRfbsReturn: 'POST /v2/returns/rfbs/get',
  verifyRfbsReturn: 'POST /v2/returns/rfbs/verify',
  rejectRfbsReturn: 'POST /v2/returns/rfbs/reject',
  receiveRfbsReturn: 'POST /v2/returns/rfbs/receive-return',
} as const;

export type OzonEndpointKey = keyof typeof OZON_ENDPOINTS;

/** Ozon Push 通知（卖家后台 → 设置 → API 密钥 → Push 通知 中配置回调地址）。 */
export type OzonPushMessage =
  | { message_type: 'TYPE_PING'; time: string }
  | { message_type: 'TYPE_NEW_POSTING'; posting_number: string; seller_id: number; warehouse_id: number; in_process_at: string; products: Array<{ sku: number; quantity: number }> }
  | { message_type: 'TYPE_POSTING_CANCELLED'; posting_number: string; seller_id: number; reason?: { id: number; message: string }; changed_state_date: string }
  | { message_type: 'TYPE_STATE_CHANGED'; posting_number: string; seller_id: number; new_state: OzonPostingStatus; changed_state_date: string }
  | { message_type: 'TYPE_CUTOFF_DATE_CHANGED'; posting_number: string; seller_id: number; new_cutoff_date: string; old_cutoff_date: string }
  | { message_type: 'TYPE_STOCKS_CHANGED'; seller_id: number; items: Array<{ sku: number; product_id: number; updated_at: string }> };

/** /v4/posting/fbs/ship 的请求体：按云仓实际包裹拆分上报。 */
export interface OzonShipRequest {
  posting_number: string;
  packages: Array<{ products: Array<{ product_id: number; quantity: number }> }>;
}

/** /v2/fbs/posting/tracking-number/set 的请求体（rFBS 由卖家物流配送）。 */
export interface OzonTrackingRequest {
  tracking_numbers: Array<{ posting_number: string; tracking_number: string }>;
}

/** /v3/posting/fbs/unfulfilled/list 返回的 posting（与真实字段同名的子集）。 */
export interface OzonPosting {
  posting_number: string;
  status: OzonPostingStatus;
  in_process_at: string;
  shipment_date: string; // 截单 / 最晚交运时间
  tpl_integration_type?: 'ozon' | 'non_integrated' | string; // non_integrated ≈ rFBS
  products: Array<{ sku: number; offer_id: string; name: string; quantity: number; price: string }>;
  analytics_data?: { region?: string; city?: string };
  customer?: { name?: string; phone?: string; address?: { city?: string; region?: string; address_tail?: string } };
}
