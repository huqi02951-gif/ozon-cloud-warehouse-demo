import type { DemoRole } from '../state/DemoContext';

export type AppRouteId =
  | 'dashboard'
  | 'live'
  | 'orders'
  | 'fulfillment'
  | 'labels'
  | 'products'
  | 'inventory'
  | 'prices'
  | 'returns'
  | 'warehouses'
  | 'sku-mapping'
  | 'exceptions'
  | 'settings';

export type AppRouteGroup = '经营' | '履约' | '商品' | '配置';
export type RoutePermission = 'operate' | 'read-only';

export type AppRoute = {
  id: AppRouteId;
  label: string;
  group: AppRouteGroup;
  icon: string;
  roles: DemoRole[];
  access: Partial<Record<DemoRole, RoutePermission>>;
};

const ALL_ROLES: DemoRole[] = ['admin', 'operator', 'warehouse'];
const OFFICE_ROLES: DemoRole[] = ['admin', 'operator'];

export const APP_ROUTES: AppRoute[] = [
  { id: 'dashboard', label: '运营工作台', group: '经营', icon: 'dashboard', roles: ALL_ROLES, access: { admin: 'operate', operator: 'operate', warehouse: 'read-only' } },
  { id: 'live', label: '实时履约', group: '经营', icon: 'live', roles: ALL_ROLES, access: { admin: 'operate', operator: 'operate', warehouse: 'read-only' } },
  { id: 'orders', label: '订单中心', group: '经营', icon: 'orders', roles: ALL_ROLES, access: { admin: 'operate', operator: 'operate', warehouse: 'read-only' } },
  { id: 'fulfillment', label: '出库履约', group: '履约', icon: 'fulfillment', roles: ALL_ROLES, access: { admin: 'operate', operator: 'operate', warehouse: 'operate' } },
  { id: 'labels', label: '面单中心', group: '履约', icon: 'labels', roles: ALL_ROLES, access: { admin: 'operate', operator: 'operate', warehouse: 'operate' } },
  { id: 'products', label: '商品中心', group: '商品', icon: 'products', roles: OFFICE_ROLES, access: { admin: 'operate', operator: 'operate' } },
  { id: 'inventory', label: '库存中心', group: '商品', icon: 'inventory', roles: ALL_ROLES, access: { admin: 'operate', operator: 'operate', warehouse: 'read-only' } },
  { id: 'prices', label: '价格管理', group: '商品', icon: 'prices', roles: OFFICE_ROLES, access: { admin: 'operate', operator: 'operate' } },
  { id: 'returns', label: 'rFBS 退货', group: '履约', icon: 'returns', roles: ALL_ROLES, access: { admin: 'operate', operator: 'operate', warehouse: 'operate' } },
  { id: 'warehouses', label: '云仓管理', group: '配置', icon: 'warehouses', roles: OFFICE_ROLES, access: { admin: 'operate', operator: 'read-only' } },
  { id: 'sku-mapping', label: 'SKU 映射', group: '配置', icon: 'mapping', roles: OFFICE_ROLES, access: { admin: 'operate', operator: 'operate' } },
  { id: 'exceptions', label: '异常与日志', group: '履约', icon: 'exceptions', roles: ALL_ROLES, access: { admin: 'operate', operator: 'operate', warehouse: 'read-only' } },
  { id: 'settings', label: '系统设置', group: '配置', icon: 'settings', roles: OFFICE_ROLES, access: { admin: 'operate', operator: 'read-only' } },
];

export function routesForRole(role: DemoRole): AppRoute[] {
  return APP_ROUTES.filter((route) => route.roles.includes(role));
}

export function routePermission(route: AppRoute, role: DemoRole): RoutePermission | undefined {
  return route.access[role];
}

export function routeFromHash(hash: string): AppRoute {
  const id = hash.replace(/^#\/?/, '').split('?')[0];
  return APP_ROUTES.find((route) => route.id === id) ?? APP_ROUTES[0];
}
