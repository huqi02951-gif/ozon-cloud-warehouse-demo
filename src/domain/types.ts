export type FulfillmentStatus =
  | 'pulled'
  | 'pending-validation'
  | 'pending-routing'
  | 'pending-dispatch'
  | 'warehouse-accepted'
  | 'picking'
  | 'packed'
  | 'shipped'
  | 'pending-ozon-sync'
  | 'completed'
  | 'cancelled'
  | 'exception';

export type OrderScenario = 'normal' | 'fallback' | 'unmapped' | 'return' | 'standard';
export type TaskKind = 'outbound' | 'label' | 'inventory-sync' | 'return-receipt';
export type TaskStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
export type ReturnStatus = 'requested' | 'approved' | 'rejected' | 'in-transit' | 'received' | 'inspected';
export type InventoryCondition = 'sellable' | 'damaged' | 'in-transit';
export type OrderExceptionReason = 'mapping' | 'stock' | 'other';

export interface DisplayMeta {
  color: string;
  initials: string;
}

export interface Store {
  id: string;
  name: string;
  ozonSellerCode: string;
  preferredWarehouseId: string;
  timezone: string;
  display: DisplayMeta;
  connected: boolean;
}

export interface Warehouse {
  id: string;
  name: string;
  city: string;
  region: string;
  timezone: string;
  priority: number;
  estimatedProcessingHours: number;
  coverageRegions: string[];
  capabilities: Array<'fbs' | 'rfbs-return' | 'label-printing'>;
  connected: boolean;
  display: DisplayMeta;
}

export interface Product {
  id: string;
  ozonSku: string;
  merchantSku: string;
  name: string;
  category: string;
  priceRub: number;
  promotionPriceRub?: number;
  currency: 'RUB';
  active: boolean;
  display: DisplayMeta;
}

export interface OrderItem {
  productId: string;
  ozonSku: string;
  name: string;
  quantity: number;
  unitPriceRub: number;
  currency: 'RUB';
}

export interface Order {
  id: string;
  displayNumber: string;
  storeId: string;
  scenario: OrderScenario;
  fulfillmentType: 'FBS' | 'rFBS';
  status: FulfillmentStatus;
  platformStatus: string;
  warehouseStatus?: string;
  exceptionReason?: OrderExceptionReason;
  assignedWarehouseId?: string;
  recipient: { name: string; city: string; region: string; addressMasked: string; phoneMasked: string };
  items: OrderItem[];
  totalRub: number;
  currency: 'RUB';
  createdAt: string;
  cutoffAt: string;
  timezone: string;
  labelWatermark: 'DEMO / 演示数据';
}

export interface SkuMapping {
  id: string;
  storeId: string;
  ozonSku: string;
  warehouseSku?: string;
  warehouseId?: string;
  status: 'mapped' | 'unmapped';
  updatedAt: string;
  timezone: string;
}

export interface InventoryRecord {
  id: string;
  productId: string;
  warehouseId: string;
  onHand: number;
  reserved: number;
  available: number;
  damaged: number;
  inTransit: number;
  safetyStock: number;
  condition: InventoryCondition;
  updatedAt: string;
  timezone: string;
}

export interface ReturnCase {
  id: string;
  orderId: string;
  storeId: string;
  productId: string;
  status: ReturnStatus;
  reason: string;
  evidence: string[];
  returnWarehouseId?: string;
  requestedAt: string;
  updatedAt: string;
  timezone: string;
}

export interface IntegrationTask {
  labelReference?: string;
  reservation?: Array<{ inventoryId: string; quantity: number }>;
  stockSettled?: boolean;
  id: string;
  kind: TaskKind;
  status: TaskStatus;
  orderId?: string;
  returnCaseId?: string;
  warehouseId?: string;
  idempotencyKey: string;
  retryCount: number;
  lastAttemptAt: string;
  timezone: string;
  summary: string;
  errorReason?: string;
  recommendation?: string;
  requestSummary?: string;
  retryable?: boolean;
  failureCode?: 'warehouse-timeout' | 'rate-limit' | 'warehouse-refused' | 'stock' | 'mapping' | 'label-failed' | 'ozon-sync-gap';
}

export interface DemoSettings {
  inventorySyncMinutes: 5 | 15 | 30 | 60;
  autoRouteEnabled: boolean;
}

export interface AuditLog {
  id: string;
  entityType: 'order' | 'return' | 'task' | 'inventory' | 'mapping';
  entityId: string;
  action: string;
  actor: string;
  detail: string;
  createdAt: string;
  timezone: string;
}

export interface DemoState {
  stores: Store[];
  warehouses: Warehouse[];
  products: Product[];
  orders: Order[];
  skuMappings: SkuMapping[];
  inventory: InventoryRecord[];
  returns: ReturnCase[];
  tasks: IntegrationTask[];
  auditLogs: AuditLog[];
  settings: DemoSettings;
}

export type RouteReason =
  | 'preferred-warehouse'
  | 'region-coverage'
  | 'warehouse-priority'
  | 'unmapped-sku'
  | 'insufficient-stock'
  | 'no-eligible-warehouse';

export interface RouteDecision {
  warehouseId?: string;
  reason: RouteReason;
  consideredWarehouseIds: string[];
}

export interface DashboardFilter {
  storeId?: string;
  warehouseId?: string;
  asOf?: string;
}

export interface DashboardMetrics {
  totalOrders: number;
  pendingDispatch: number;
  cutoffAlerts: number;
  stockoutOrders: number;
  exceptions: number;
  pendingReturns: number;
  activeTasks: number;
  completedOrders: number;
}

type DispatchOrderAction = {
  labelReference?: string;
  type: 'DISPATCH_ORDER';
  orderId: string;
  at?: string;
  actor?: string;
} & (
  | { manualOverride: true; warehouseId: string }
  | { manualOverride?: false; warehouseId?: string }
);

export type DemoAction =
  | DispatchOrderAction
  | { type: 'SET_ORDER_STATUS'; orderId: string; status: FulfillmentStatus; platformStatus?: string; warehouseStatus?: string; at?: string; actor?: string }
  | { type: 'REPAIR_MAPPING' | 'REPAIR_SKU_MAPPING'; mappingId: string; warehouseSku: string; warehouseId: string; at?: string; actor?: string }
  | { type: 'RETRY_TASK'; taskId: string; at?: string; actor?: string }
  | { type: 'UPDATE_SETTINGS'; inventorySyncMinutes: DemoSettings['inventorySyncMinutes']; autoRouteEnabled: boolean }
  | { type: 'UPDATE_STORE_CONNECTION'; storeId: string; connected: boolean }
  | { type: 'DECIDE_RETURN'; returnCaseId: string; decision: 'approved' | 'rejected'; warehouseId?: string; at?: string; actor?: string }
  | { type: 'RECEIVE_RETURN'; returnCaseId: string; at?: string; actor?: string }
  | { type: 'INSPECT_RETURN'; returnCaseId: string; condition: 'sellable' | 'damaged'; at?: string; actor?: string }
  | { type: 'SET_SAFETY_STOCK'; inventoryId: string; safetyStock: number; at?: string; actor?: string }
  | { type: 'SET_PRODUCT_ACTIVE'; productId: string; active: boolean; at?: string; actor?: string }
  | { type: 'SET_PRODUCT_PRICES'; updates: Array<{ productId: string; priceRub: number; promotionPriceRub?: number }>; at?: string; actor?: string }
  | { type: 'SYNC_INVENTORY'; inventoryIds: string[]; at?: string; actor?: string }
  | { type: 'UPDATE_WAREHOUSE_CONFIG'; warehouseId: string; priority: number; estimatedProcessingHours: number; connected: boolean }
  | { type: 'RESET_DEMO' | 'RESET' };
