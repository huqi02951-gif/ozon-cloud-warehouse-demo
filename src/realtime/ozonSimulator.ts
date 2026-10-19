import type { OzonPosting } from '../integrations/ozonContract';
import type { DemoState } from '../domain/types';

const CUSTOMERS = [
  { name: 'Анна', city: '莫斯科', region: '莫斯科市' },
  { name: 'Иван', city: '圣彼得堡', region: '圣彼得堡市' },
  { name: 'Ольга', city: '喀山', region: '鞑靼斯坦共和国' },
  { name: 'Дмитрий', city: '萨马拉', region: '萨马拉州' },
  { name: 'Мария', city: '新西伯利亚', region: '新西伯利亚州' },
  { name: 'Сергей', city: '鄂木斯克', region: '鄂木斯克州' },
];

let counter = 0;

/** 生成一笔与 /v3/posting/fbs/unfulfilled/list 字段一致的模拟 posting。 */
export function simulatePosting(state: DemoState, now: Date, random: () => number = Math.random): { posting: OzonPosting; storeId: string } | undefined {
  const products = state.products.filter((product) => product.active);
  const stores = state.stores.filter((store) => store.connected);
  if (!products.length || !stores.length) return undefined;
  counter += 1;
  const store = stores[Math.floor(random() * stores.length)];
  const customer = CUSTOMERS[Math.floor(random() * CUSTOMERS.length)];
  const lineCount = random() < 0.25 ? 2 : 1;
  const picked = new Set<number>();
  while (picked.size < lineCount) picked.add(Math.floor(random() * products.length));
  const stamp = `${now.getTime()}`.slice(-8);
  return {
    storeId: store.id,
    posting: {
      posting_number: `${stamp}-${String(counter).padStart(4, '0')}-1`,
      status: 'awaiting_packaging',
      in_process_at: now.toISOString(),
      shipment_date: new Date(now.getTime() + (4 + Math.floor(random() * 20)) * 3600e3).toISOString(),
      tpl_integration_type: random() < 0.2 ? 'non_integrated' : 'ozon',
      products: [...picked].map((index) => {
        const product = products[index];
        return { sku: 100000 + index, offer_id: product.merchantSku, name: product.name, quantity: 1 + Math.floor(random() * 2), price: String(product.promotionPriceRub ?? product.priceRub) };
      }),
      customer: { name: customer.name, address: { city: customer.city, region: customer.region } },
    },
  };
}
