import type {
  AuditLog,
  DemoState,
  InventoryRecord,
  Order,
  Product,
  ReturnCase,
  SkuMapping,
} from './types';

const MOSCOW_TZ = 'Europe/Moscow';
const KAZAN_TZ = 'Europe/Moscow';
const NOVOSIBIRSK_TZ = 'Asia/Novosibirsk';
const DEMO_TIME = '2026-09-07T09:30:00+03:00';

const stores = [
  { id: 'store-polaris', name: '北极星家居店', ozonSellerCode: 'DEMO-SELLER-101', preferredWarehouseId: 'wh-moscow', timezone: MOSCOW_TZ, display: { color: '#5B5CE2', initials: '北' }, connected: true },
  { id: 'store-taiga', name: '泰加数码店', ozonSellerCode: 'DEMO-SELLER-202', preferredWarehouseId: 'wh-kazan', timezone: MOSCOW_TZ, display: { color: '#0EA5A4', initials: '泰' }, connected: true },
  { id: 'store-volga', name: '伏尔加精选店', ozonSellerCode: 'DEMO-SELLER-303', preferredWarehouseId: 'wh-novosibirsk', timezone: NOVOSIBIRSK_TZ, display: { color: '#E8793B', initials: '伏' }, connected: true },
] as const;

const warehouses = [
  { id: 'wh-moscow', name: '莫斯科演示云仓', city: '莫斯科', region: '莫斯科市', timezone: MOSCOW_TZ, priority: 1, estimatedProcessingHours: 4, coverageRegions: ['莫斯科市', '莫斯科州', '圣彼得堡市'], capabilities: ['fbs', 'rfbs-return', 'label-printing'], connected: true, display: { color: '#356AE6', initials: '莫' } },
  { id: 'wh-kazan', name: '喀山演示云仓', city: '喀山', region: '鞑靼斯坦共和国', timezone: KAZAN_TZ, priority: 2, estimatedProcessingHours: 6, coverageRegions: ['鞑靼斯坦共和国', '巴什科尔托斯坦共和国', '萨马拉州'], capabilities: ['fbs', 'rfbs-return', 'label-printing'], connected: true, display: { color: '#7C3AED', initials: '喀' } },
  { id: 'wh-novosibirsk', name: '新西伯利亚演示云仓', city: '新西伯利亚', region: '新西伯利亚州', timezone: NOVOSIBIRSK_TZ, priority: 3, estimatedProcessingHours: 8, coverageRegions: ['新西伯利亚州', '克拉斯诺亚尔斯克边疆区', '鄂木斯克州'], capabilities: ['fbs', 'rfbs-return', 'label-printing'], connected: true, display: { color: '#0891B2', initials: '新' } },
] as const;

const productNames = ['北境保温杯', '极光收纳盒', '雪松蓝牙音箱', '贝加尔旅行枕', '伏尔加桌面灯', '西伯利亚毯', '喀山咖啡杯', '涅瓦数据线', '乌拉尔背包', '阿尔泰水壶'];
const categories = ['家居生活', '数码配件', '旅行用品', '办公用品', '户外装备'];

function buildProducts(): Product[] {
  return Array.from({ length: 50 }, (_, index) => {
    const number = index + 1;
    return {
      id: `product-${String(number).padStart(2, '0')}`,
      ozonSku: `OZ-DEMO-${String(number).padStart(4, '0')}`,
      merchantSku: `CN-DEMO-${String(number).padStart(3, '0')}`,
      name: `${productNames[index % productNames.length]} ${String(number).padStart(2, '0')}`,
      category: categories[index % categories.length],
      priceRub: 790 + index * 95,
      promotionPriceRub: index % 4 === 0 ? 690 + index * 90 : undefined,
      currency: 'RUB',
      active: index !== 47,
      display: { color: ['#5B5CE2', '#0EA5A4', '#E8793B', '#356AE6', '#D946A6'][index % 5], initials: productNames[index % productNames.length].slice(0, 2) },
    };
  });
}

function orderItem(product: Product, quantity = 1) {
  return { productId: product.id, ozonSku: product.ozonSku, name: product.name, quantity, unitPriceRub: product.priceRub, currency: 'RUB' as const };
}

function buildOrders(products: Product[]): Order[] {
  const scenarios: Order[] = [
    { id: 'order-normal', displayNumber: '正常履约演示单', storeId: 'store-polaris', scenario: 'normal', fulfillmentType: 'FBS', status: 'pending-dispatch', platformStatus: 'awaiting_packaging', assignedWarehouseId: 'wh-moscow', recipient: { name: '李**', city: '莫斯科', region: '莫斯科市', addressMasked: '列宁大街 ** 号', phoneMasked: '+7 *** *** ** 21' }, items: [orderItem(products[0], 2)], totalRub: products[0].priceRub * 2, currency: 'RUB', createdAt: '2026-09-07T08:10:00+03:00', cutoffAt: '2026-09-07T14:00:00+03:00', timezone: MOSCOW_TZ, labelWatermark: 'DEMO / 演示数据' },
    { id: 'order-fallback', displayNumber: '缺货改仓演示单', storeId: 'store-polaris', scenario: 'fallback', fulfillmentType: 'FBS', status: 'pending-routing', platformStatus: 'awaiting_packaging', recipient: { name: '王**', city: '喀山', region: '鞑靼斯坦共和国', addressMasked: '克里姆林街 ** 号', phoneMasked: '+7 *** *** ** 43' }, items: [orderItem(products[1], 3)], totalRub: products[1].priceRub * 3, currency: 'RUB', createdAt: '2026-09-07T08:25:00+03:00', cutoffAt: '2026-09-07T15:00:00+03:00', timezone: MOSCOW_TZ, labelWatermark: 'DEMO / 演示数据' },
    { id: 'order-unmapped', displayNumber: 'SKU 未映射演示单', storeId: 'store-taiga', scenario: 'unmapped', fulfillmentType: 'FBS', status: 'exception', platformStatus: 'awaiting_packaging', exceptionReason: 'mapping', recipient: { name: '张**', city: '萨马拉', region: '萨马拉州', addressMasked: '加加林街 ** 号', phoneMasked: '+7 *** *** ** 65' }, items: [orderItem(products[48])], totalRub: products[48].priceRub, currency: 'RUB', createdAt: '2026-09-07T08:40:00+03:00', cutoffAt: '2026-09-07T15:30:00+03:00', timezone: MOSCOW_TZ, labelWatermark: 'DEMO / 演示数据' },
    { id: 'order-return', displayNumber: 'rFBS 退货演示单', storeId: 'store-volga', scenario: 'return', fulfillmentType: 'rFBS', status: 'completed', platformStatus: 'delivered', warehouseStatus: 'delivered', assignedWarehouseId: 'wh-novosibirsk', recipient: { name: '陈**', city: '新西伯利亚', region: '新西伯利亚州', addressMasked: '红色大道 ** 号', phoneMasked: '+7 *** *** ** 87' }, items: [orderItem(products[3])], totalRub: products[3].priceRub, currency: 'RUB', createdAt: '2026-09-04T11:20:00+07:00', cutoffAt: '2026-09-04T16:00:00+07:00', timezone: NOVOSIBIRSK_TZ, labelWatermark: 'DEMO / 演示数据' },
  ];

  const statuses: Order['status'][] = ['pulled', 'pending-validation', 'pending-routing', 'pending-dispatch', 'warehouse-accepted', 'picking', 'packed', 'shipped', 'pending-ozon-sync', 'completed', 'cancelled', 'exception'];
  const regions = [['莫斯科', '莫斯科市', MOSCOW_TZ], ['喀山', '鞑靼斯坦共和国', MOSCOW_TZ], ['新西伯利亚', '新西伯利亚州', NOVOSIBIRSK_TZ]] as const;
  return [...scenarios, ...Array.from({ length: 26 }, (_, index) => {
    const number = index + 5;
    const product = products[(index + 5) % products.length];
    const [city, region, timezone] = regions[index % regions.length];
    const quantity = (index % 3) + 1;
    const status = statuses[index % statuses.length];
    return { id: `order-${String(number).padStart(2, '0')}`, displayNumber: `演示订单 ${String(number).padStart(3, '0')}`, storeId: stores[index % stores.length].id, scenario: 'standard' as const, fulfillmentType: index % 5 === 0 ? 'rFBS' as const : 'FBS' as const, status, platformStatus: status === 'completed' ? 'delivered' : 'awaiting_packaging', warehouseStatus: ['warehouse-accepted', 'picking', 'packed', 'shipped', 'completed'].includes(status) ? status : undefined, assignedWarehouseId: status === 'pulled' || status === 'pending-validation' || status === 'exception' ? undefined : warehouses[index % warehouses.length].id, recipient: { name: `顾客${String(number).padStart(2, '0')}**`, city, region, addressMasked: '演示街道 ** 号', phoneMasked: '+7 *** *** ** **' }, items: [orderItem(product, quantity)], totalRub: product.priceRub * quantity, currency: 'RUB' as const, createdAt: `2026-09-${String(1 + (index % 7)).padStart(2, '0')}T${String(9 + (index % 8)).padStart(2, '0')}:00:00${timezone === NOVOSIBIRSK_TZ ? '+07:00' : '+03:00'}`, cutoffAt: `2026-09-07T18:00:00${timezone === NOVOSIBIRSK_TZ ? '+07:00' : '+03:00'}`, timezone, labelWatermark: 'DEMO / 演示数据' as const };
  })];
}

function buildInventory(products: Product[]): InventoryRecord[] {
  return products.flatMap((product, productIndex) => warehouses.map((warehouse, warehouseIndex) => {
    let available = 12 + ((productIndex * 7 + warehouseIndex * 5) % 31);
    if (product.id === 'product-02' && warehouse.id === 'wh-moscow') available = 1;
    return { id: `inventory-${product.id}-${warehouse.id}`, productId: product.id, warehouseId: warehouse.id, onHand: available + 4, reserved: 2, available, damaged: warehouseIndex === 1 ? 1 : 0, inTransit: productIndex % 6 === 0 ? 3 : 0, safetyStock: 3, condition: 'sellable' as const, updatedAt: DEMO_TIME, timezone: warehouse.timezone };
  }));
}

function buildMappings(products: Product[]): SkuMapping[] {
  return stores.flatMap((store) => products.map((product) => ({ id: `mapping-${store.id}-${product.id}`, storeId: store.id, ozonSku: product.ozonSku, warehouseSku: product.merchantSku, warehouseId: store.preferredWarehouseId, status: 'mapped' as const, updatedAt: DEMO_TIME, timezone: store.timezone }))).map((mapping) => mapping.storeId === 'store-taiga' && mapping.ozonSku === 'OZ-DEMO-0049' ? { ...mapping, warehouseSku: undefined, warehouseId: undefined, status: 'unmapped' as const } : mapping);
}

function buildReturns(orders: Order[]): ReturnCase[] {
  const orderIds = ['order-return', 'order-05', 'order-06', 'order-07', 'order-08', 'order-09'];
  return orderIds.map((orderId, index) => {
    const order = orders.find((candidate) => candidate.id === orderId)!;
    return { id: `return-${String(index + 1).padStart(2, '0')}`, orderId, storeId: order.storeId, productId: order.items[0].productId, status: (['requested', 'approved', 'in-transit', 'received', 'inspected', 'rejected'] as const)[index], reason: ['尺寸不合适', '运输外包装破损', '与描述不符', '颜色不喜欢', '重复下单', '商品功能异常'][index], evidence: [`演示凭证 ${index + 1}`], returnWarehouseId: index === 5 ? undefined : warehouses[index % warehouses.length].id, requestedAt: `2026-09-0${index + 1}T10:00:00+03:00`, updatedAt: DEMO_TIME, timezone: warehouses[index % warehouses.length].timezone };
  });
}

function buildTasks() {
  return [
    { id: 'task-label-normal', kind: 'label' as const, status: 'succeeded' as const, orderId: 'order-normal', warehouseId: 'wh-moscow', idempotencyKey: 'label:order-normal', retryCount: 0, lastAttemptAt: DEMO_TIME, timezone: MOSCOW_TZ, summary: '已生成演示面单' },
    { id: 'task-dispatch-standard', kind: 'outbound' as const, status: 'pending' as const, orderId: 'order-11', warehouseId: 'wh-moscow', idempotencyKey: 'outbound:order-11', retryCount: 0, lastAttemptAt: DEMO_TIME, timezone: KAZAN_TZ, summary: '历史演示订单已打包，等待出库' },
    { id: 'task-sync-unmapped', kind: 'inventory-sync' as const, status: 'failed' as const, orderId: 'order-unmapped', idempotencyKey: 'mapping:order-unmapped', retryCount: 1, lastAttemptAt: DEMO_TIME, timezone: MOSCOW_TZ, summary: 'SKU 未映射，等待运营处理', errorReason: 'SKU 未映射', recommendation: '请先完成 SKU 映射', requestSummary: '校验商品映射 · OZ-DEMO-0049', retryable: false, failureCode: 'mapping' as const },
    { id: 'task-warehouse-timeout', kind: 'outbound' as const, status: 'failed' as const, orderId: 'order-05', warehouseId: 'wh-moscow', idempotencyKey: 'retry:warehouse-timeout', retryCount: 1, lastAttemptAt: DEMO_TIME, timezone: MOSCOW_TZ, summary: '创建云仓出库单失败', errorReason: '云仓接口暂时不可用', recommendation: '确认云仓连接正常后重新执行', requestSummary: '创建出库单 · 演示订单 005 · 2 件商品', retryable: true, failureCode: 'warehouse-timeout' as const },
    { id: 'task-ozon-rate-limit', kind: 'label' as const, status: 'failed' as const, orderId: 'order-07', warehouseId: 'wh-kazan', idempotencyKey: 'retry:ozon-rate-limit', retryCount: 2, lastAttemptAt: DEMO_TIME, timezone: KAZAN_TZ, summary: 'Ozon 请求频率受限', errorReason: 'Ozon 接口触发频率限制', recommendation: '等待限流窗口结束后重新执行', requestSummary: '获取面单 · 演示订单 007', retryable: true, failureCode: 'rate-limit' as const },
    { id: 'task-warehouse-refused', kind: 'outbound' as const, status: 'failed' as const, orderId: 'order-08', warehouseId: 'wh-novosibirsk', idempotencyKey: 'exception:warehouse-refused', retryCount: 1, lastAttemptAt: DEMO_TIME, timezone: NOVOSIBIRSK_TZ, summary: '云仓拒绝接单', errorReason: '云仓能力不支持当前订单', recommendation: '确认仓库能力并手工改仓', requestSummary: '创建出库单 · 演示订单 008', retryable: false, failureCode: 'warehouse-refused' as const },
    { id: 'task-stock-shortage', kind: 'outbound' as const, status: 'failed' as const, orderId: 'order-09', warehouseId: 'wh-moscow', idempotencyKey: 'exception:stock-shortage', retryCount: 0, lastAttemptAt: DEMO_TIME, timezone: MOSCOW_TZ, summary: '可售库存不足', errorReason: '安全库存校验未通过', recommendation: '请先补充可售库存', requestSummary: '库存校验 · 演示订单 009', retryable: false, failureCode: 'stock' as const },
    { id: 'task-label-failed', kind: 'label' as const, status: 'failed' as const, orderId: 'order-10', warehouseId: 'wh-kazan', idempotencyKey: 'retry:label-failed', retryCount: 1, lastAttemptAt: DEMO_TIME, timezone: KAZAN_TZ, summary: '面单生成失败', errorReason: 'Ozon 暂未返回可打印面单', recommendation: '确认订单状态后重新执行', requestSummary: '获取面单 · 演示订单 010', retryable: true, failureCode: 'label-failed' as const },
    { id: 'task-ozon-sync-gap', kind: 'inventory-sync' as const, status: 'failed' as const, orderId: 'order-11', warehouseId: 'wh-novosibirsk', idempotencyKey: 'exception:ozon-sync-gap', retryCount: 1, lastAttemptAt: DEMO_TIME, timezone: NOVOSIBIRSK_TZ, summary: 'Ozon 库存状态未回写', errorReason: '本地库存与 Ozon 回执存在差异', recommendation: '核对库存流水后重新发起同步', requestSummary: '同步库存 · 演示订单 011', retryable: false, failureCode: 'ozon-sync-gap' as const },
    { id: 'task-return-receipt', kind: 'return-receipt' as const, status: 'processing' as const, returnCaseId: 'return-01', warehouseId: 'wh-novosibirsk', idempotencyKey: 'return:return-01', retryCount: 0, lastAttemptAt: '2026-09-07T13:30:00+07:00', timezone: NOVOSIBIRSK_TZ, summary: '等待云仓验货' },
  ];
}

function buildAuditLogs(): AuditLog[] {
  return [
    { id: 'audit-001', entityType: 'order', entityId: 'order-normal', action: 'LABEL_CREATED', actor: '系统演示账号', detail: '已创建带演示水印的 Ozon 面单', createdAt: DEMO_TIME, timezone: MOSCOW_TZ },
    { id: 'audit-002', entityType: 'order', entityId: 'order-fallback', action: 'ROUTING_FALLBACK', actor: '路由引擎', detail: '莫斯科仓库存不足，建议改派喀山仓', createdAt: DEMO_TIME, timezone: MOSCOW_TZ },
    { id: 'audit-003', entityType: 'mapping', entityId: 'mapping-store-taiga-product-49', action: 'MAPPING_BLOCKED', actor: '系统演示账号', detail: 'Ozon SKU 未匹配云仓货号', createdAt: DEMO_TIME, timezone: MOSCOW_TZ },
    { id: 'audit-004', entityType: 'return', entityId: 'return-01', action: 'RETURN_REQUESTED', actor: '顾客演示账号', detail: '已提交 rFBS 退货申请', createdAt: '2026-09-07T12:00:00+07:00', timezone: NOVOSIBIRSK_TZ },
  ];
}

export function createSeedState(): DemoState {
  const products = buildProducts();
  const orders = buildOrders(products);
  return { stores: stores.map((store) => ({ ...store, display: { ...store.display } })), warehouses: warehouses.map((warehouse) => ({ ...warehouse, coverageRegions: [...warehouse.coverageRegions], capabilities: [...warehouse.capabilities], display: { ...warehouse.display } })), products, orders, skuMappings: buildMappings(products), inventory: buildInventory(products), returns: buildReturns(orders), tasks: buildTasks(), auditLogs: buildAuditLogs(), settings: { inventorySyncMinutes: 15, autoRouteEnabled: true } };
}
