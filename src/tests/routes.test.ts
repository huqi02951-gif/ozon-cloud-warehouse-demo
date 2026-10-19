import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../app/routes';

describe('APP_ROUTES', () => {
  it('contains the 13 approved unique routes', () => {
    expect(APP_ROUTES).toHaveLength(13);
    expect(new Set(APP_ROUTES.map((route) => route.id)).size).toBe(13);
  });

  it('matches the approved metadata and role-permission matrix for all thirteen routes', () => {
    expect(APP_ROUTES).toEqual([
      { id: 'dashboard', label: '运营工作台', group: '经营', icon: 'dashboard', roles: ['admin', 'operator', 'warehouse'], access: { admin: 'operate', operator: 'operate', warehouse: 'read-only' } },
      { id: 'live', label: '实时履约', group: '经营', icon: 'live', roles: ['admin', 'operator', 'warehouse'], access: { admin: 'operate', operator: 'operate', warehouse: 'read-only' } },
      { id: 'orders', label: '订单中心', group: '经营', icon: 'orders', roles: ['admin', 'operator', 'warehouse'], access: { admin: 'operate', operator: 'operate', warehouse: 'read-only' } },
      { id: 'fulfillment', label: '出库履约', group: '履约', icon: 'fulfillment', roles: ['admin', 'operator', 'warehouse'], access: { admin: 'operate', operator: 'operate', warehouse: 'operate' } },
      { id: 'labels', label: '面单中心', group: '履约', icon: 'labels', roles: ['admin', 'operator', 'warehouse'], access: { admin: 'operate', operator: 'operate', warehouse: 'operate' } },
      { id: 'products', label: '商品中心', group: '商品', icon: 'products', roles: ['admin', 'operator'], access: { admin: 'operate', operator: 'operate' } },
      { id: 'inventory', label: '库存中心', group: '商品', icon: 'inventory', roles: ['admin', 'operator', 'warehouse'], access: { admin: 'operate', operator: 'operate', warehouse: 'read-only' } },
      { id: 'prices', label: '价格管理', group: '商品', icon: 'prices', roles: ['admin', 'operator'], access: { admin: 'operate', operator: 'operate' } },
      { id: 'returns', label: 'rFBS 退货', group: '履约', icon: 'returns', roles: ['admin', 'operator', 'warehouse'], access: { admin: 'operate', operator: 'operate', warehouse: 'operate' } },
      { id: 'warehouses', label: '云仓管理', group: '配置', icon: 'warehouses', roles: ['admin', 'operator'], access: { admin: 'operate', operator: 'read-only' } },
      { id: 'sku-mapping', label: 'SKU 映射', group: '配置', icon: 'mapping', roles: ['admin', 'operator'], access: { admin: 'operate', operator: 'operate' } },
      { id: 'exceptions', label: '异常与日志', group: '履约', icon: 'exceptions', roles: ['admin', 'operator', 'warehouse'], access: { admin: 'operate', operator: 'operate', warehouse: 'read-only' } },
      { id: 'settings', label: '系统设置', group: '配置', icon: 'settings', roles: ['admin', 'operator'], access: { admin: 'operate', operator: 'read-only' } },
    ]);
  });
});
