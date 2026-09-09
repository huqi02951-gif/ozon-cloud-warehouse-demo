import React, { useEffect, useMemo, useState } from 'react';
import { StatusTag } from '../components/StatusTag';
import { ToastRegion } from '../components/ToastRegion';
import { useDemo, type DemoRole } from '../state/DemoContext';
import { routeFromHash, routePermission, routesForRole, type AppRouteGroup } from './routes';
import { DashboardPage } from '../pages/DashboardPage';
import { OrdersPage } from '../pages/OrdersPage';
import { FulfillmentPage } from '../pages/FulfillmentPage';
import { LabelsPage } from '../pages/LabelsPage';
import { ProductsPage } from '../pages/ProductsPage';
import { InventoryPage } from '../pages/InventoryPage';
import { PricesPage } from '../pages/PricesPage';
import { ReturnsPage } from '../pages/ReturnsPage';
import { WarehousesPage } from '../pages/WarehousesPage';
import { SkuMappingPage } from '../pages/SkuMappingPage';
import { ExceptionsPage } from '../pages/ExceptionsPage';
import { SettingsPage } from '../pages/SettingsPage';

const NAV_GROUPS: AppRouteGroup[] = ['经营', '履约', '商品', '配置'];
const ROLE_LABELS: Record<DemoRole, string> = {
  admin: '管理员',
  operator: '运营人员',
  warehouse: '仓库人员',
};

interface NavIconProps {
  name: string;
}

function NavIcon({ name }: NavIconProps) {
  const paths: Record<string, React.ReactNode> = {
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></>,
    orders: <><path d="M7 3h10l2 3v15H5V6l2-3Z" /><path d="M8 10h8M8 14h8M8 18h5" /></>,
    fulfillment: <><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></>,
    labels: <><path d="M4 5h12l4 4-9 9-7-7V5Z" /><circle cx="9" cy="9" r="1.5" /></>,
    returns: <><path d="M9 7 5 11l4 4" /><path d="M6 11h8a5 5 0 1 1 0 10" /></>,
    exceptions: <><path d="M12 3 2.8 20h18.4L12 3Z" /><path d="M12 9v5M12 17h.01" /></>,
    products: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5M3 16l9 5 9-5" /></>,
    inventory: <><path d="M4 4h16v16H4zM4 9h16M9 9v11" /></>,
    prices: <><circle cx="12" cy="12" r="9" /><path d="M9 8h4a2 2 0 0 1 0 4H9m0 0h5m-5 0v5m0-10v10" /></>,
    warehouses: <><path d="m3 9 9-5 9 5v11H3V9Z" /><path d="M8 20v-7h8v7" /></>,
    mapping: <><path d="M7 7h11M15 4l3 3-3 3M17 17H6M9 14l-3 3 3 3" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5l-.4 3a8 8 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2L3 14.5 5 18l2.4-1a8 8 0 0 0 1.7 1l.4 3h5l.4-3a8 8 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z" /></>,
  };

  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function AppShell() {
  const { state, role, setRole } = useDemo();
  const [requestedRoute, setRequestedRoute] = useState(() => routeFromHash(window.location.hash));
  const [storeId, setStoreId] = useState('all');
  const [warehouseId, setWarehouseId] = useState('all');

  useEffect(() => {
    const syncRoute = () => setRequestedRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', syncRoute);
    return () => window.removeEventListener('hashchange', syncRoute);
  }, []);

  const visibleRoutes = useMemo(() => routesForRole(role), [role]);
  const activeRoute = visibleRoutes.find((route) => route.id === requestedRoute.id) ?? visibleRoutes[0];
  const access = routePermission(activeRoute, role);
  const firstConnectedWarehouseId = state.warehouses.find((warehouse) => warehouse.connected)?.id ?? state.warehouses[0]?.id ?? '';
  const effectiveWarehouseId = role === 'warehouse' && (warehouseId === 'all' || !state.warehouses.some((warehouse) => warehouse.id === warehouseId && warehouse.connected))
    ? firstConnectedWarehouseId
    : warehouseId;
  const pageProps = { storeId, warehouseId: effectiveWarehouseId, role };
  const page = activeRoute.id === 'dashboard' ? <DashboardPage {...pageProps} />
    : activeRoute.id === 'orders' ? <OrdersPage {...pageProps} />
    : activeRoute.id === 'fulfillment' ? <FulfillmentPage {...pageProps} />
    : activeRoute.id === 'labels' ? <LabelsPage {...pageProps} />
    : activeRoute.id === 'products' ? <ProductsPage {...pageProps} />
    : activeRoute.id === 'inventory' ? <InventoryPage {...pageProps} />
    : activeRoute.id === 'prices' ? <PricesPage {...pageProps} />
    : activeRoute.id === 'returns' ? <ReturnsPage {...pageProps} />
    : activeRoute.id === 'warehouses' ? <WarehousesPage {...pageProps} />
    : activeRoute.id === 'sku-mapping' ? <SkuMappingPage {...pageProps} />
    : activeRoute.id === 'exceptions' ? <ExceptionsPage {...pageProps} />
    : activeRoute.id === 'settings' ? <SettingsPage {...pageProps} />
    : null;

  useEffect(() => {
    if (requestedRoute.id !== activeRoute.id) {
      window.history.replaceState(null, '', `#/${activeRoute.id}`);
      setRequestedRoute(activeRoute);
    }
  }, [activeRoute, requestedRoute.id]);

  useEffect(() => {
    if (role === 'warehouse' && warehouseId !== effectiveWarehouseId) setWarehouseId(effectiveWarehouseId);
  }, [effectiveWarehouseId, role, warehouseId]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#/dashboard" aria-label="Ozon 云仓运营中台">
          <span className="brand-mark" aria-hidden="true">O</span>
          <span className="brand-copy">
            <strong>Ozon 云仓</strong>
            <small>多店铺运营中台</small>
          </span>
        </a>
        <nav aria-label="主导航">
          {NAV_GROUPS.map((group) => {
            const routes = visibleRoutes.filter((route) => route.group === group);
            if (routes.length === 0) return null;
            return (
              <section className="nav-group" key={group} aria-labelledby={`nav-${group}`}>
                <h2 id={`nav-${group}`}>{group}</h2>
                {routes.map((route) => (
                  <a
                    className={route.id === activeRoute.id ? 'nav-link active' : 'nav-link'}
                    href={`#/${route.id}`}
                    key={route.id}
                    aria-current={route.id === activeRoute.id ? 'page' : undefined}
                  >
                    <NavIcon name={route.icon} />
                    <span>{route.label}</span>
                    {route.access[role] === 'read-only' ? <span className="nav-link__permission">只读</span> : null}
                  </a>
                ))}
              </section>
            );
          })}
        </nav>
        <div className="sidebar-footnote">
          <span className="sidebar-footnote__pulse" aria-hidden="true" />
          <span><strong>本地模拟服务</strong><small>不连接真实业务接口</small></span>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar__context">
            <label className="context-select">
              <span>店铺</span>
              <select aria-label="当前店铺" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
                <option value="all">全部店铺</option>
                {state.stores.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}
              </select>
            </label>
            <span className="topbar__divider" aria-hidden="true" />
            <label className="context-select">
              <span>云仓</span>
              <select aria-label="当前云仓" value={effectiveWarehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
                {role !== 'warehouse' ? <option value="all">全部云仓</option> : null}
                {state.warehouses.filter((warehouse) => role !== 'warehouse' || warehouse.connected).map((warehouse) => <option value={warehouse.id} key={warehouse.id}>{warehouse.name}</option>)}
              </select>
            </label>
          </div>
          <div className="topbar__actions">
            <span className="demo-badge">演示环境</span>
            <label className="role-switcher">
              <span className="avatar" aria-hidden="true">{ROLE_LABELS[role].slice(0, 1)}</span>
              <span className="visually-hidden">角色</span>
              <select aria-label="当前角色" value={role} onChange={(event) => setRole(event.target.value as DemoRole)}>
                <option value="admin">管理员</option>
                <option value="operator">运营人员</option>
                <option value="warehouse">仓库人员</option>
              </select>
            </label>
          </div>
        </header>

        <main className="content">
          <div className="page-heading">
            <div>
              <p className="breadcrumb">Ozon 云仓运营中台 <span aria-hidden="true">/</span> {activeRoute.group}</p>
              <div className="page-title-row">
                <h1 id="page-title">{activeRoute.label}</h1>
                {access === 'read-only' ? <StatusTag tone="info">只读权限</StatusTag> : null}
              </div>
              <p>统一管理虚构店铺与云仓的演示业务数据。</p>
            </div>
            <div className="heading-meta" aria-label="当前视图信息">
              <span>{ROLE_LABELS[role]}视图</span>
              <strong>{storeId === 'all' ? '全部店铺' : state.stores.find((store) => store.id === storeId)?.name}</strong>
            </div>
          </div>

          {page}
        </main>
      </div>
      <ToastRegion />
    </div>
  );
}
