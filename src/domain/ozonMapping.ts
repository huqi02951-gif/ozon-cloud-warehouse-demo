import type { OzonPosting } from '../integrations/ozonContract';
import type { DemoState, Order } from './types';

export type PostingMapResult =
  | { ok: true; order: Order }
  | { ok: false; reason: 'duplicate' | 'unknown-store' | 'unknown-offer'; detail: string };

const TIMEZONE_BY_REGION: Record<string, string> = { '新西伯利亚州': 'Asia/Novosibirsk', '克拉斯诺亚尔斯克边疆区': 'Asia/Krasnoyarsk', '鄂木斯克州': 'Asia/Omsk' };

export function orderIdForPosting(postingNumber: string): string {
  return `ozon-${postingNumber}`;
}

function mask(name?: string) {
  return name ? `${name.slice(0, 1)}**` : '买家**';
}

/**
 * 把 Ozon posting 转成内部订单。
 * - offer_id 对应商品的卖家货号（merchantSku），这也是 Ozon 推荐的对账键。
 * - 未知 offer_id 不创建订单，交给 SKU 映射流程处理。
 */
export function mapPostingToOrder(posting: OzonPosting, storeId: string, state: DemoState): PostingMapResult {
  const id = orderIdForPosting(posting.posting_number);
  if (state.orders.some((order) => order.id === id || order.postingNumber === posting.posting_number)) {
    return { ok: false, reason: 'duplicate', detail: posting.posting_number };
  }
  if (!state.stores.some((store) => store.id === storeId)) return { ok: false, reason: 'unknown-store', detail: storeId };
  const items = [];
  for (const line of posting.products) {
    const product = state.products.find((candidate) => candidate.merchantSku === line.offer_id);
    if (!product) return { ok: false, reason: 'unknown-offer', detail: line.offer_id };
    const unit = Math.round(Number.parseFloat(line.price) || product.priceRub);
    items.push({ productId: product.id, ozonSku: product.ozonSku, name: product.name, quantity: line.quantity, unitPriceRub: unit, currency: 'RUB' as const });
  }
  const region = posting.customer?.address?.region ?? posting.analytics_data?.region ?? '莫斯科市';
  const city = posting.customer?.address?.city ?? posting.analytics_data?.city ?? '莫斯科';
  return {
    ok: true,
    order: {
      id,
      displayNumber: `Ozon ${posting.posting_number}`,
      postingNumber: posting.posting_number,
      storeId,
      scenario: 'standard',
      fulfillmentType: posting.tpl_integration_type === 'non_integrated' ? 'rFBS' : 'FBS',
      status: 'pending-routing',
      platformStatus: posting.status,
      recipient: { name: mask(posting.customer?.name), city, region, addressMasked: posting.customer?.address?.address_tail ? '*** 已脱敏' : '地址已脱敏', phoneMasked: '+7 *** *** ** **' },
      items,
      totalRub: items.reduce((sum, item) => sum + item.unitPriceRub * item.quantity, 0),
      currency: 'RUB',
      createdAt: posting.in_process_at,
      cutoffAt: posting.shipment_date,
      timezone: TIMEZONE_BY_REGION[region] ?? 'Europe/Moscow',
      labelWatermark: 'DEMO / 演示数据',
    },
  };
}
