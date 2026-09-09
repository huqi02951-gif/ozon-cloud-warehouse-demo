# Ozon Cloud Warehouse Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished, clickable Chinese Web demo that connects Ozon-style seller operations with multi-cloud-warehouse fulfillment using realistic mock data and linked state transitions.

**Architecture:** A React single-page application uses a typed in-browser domain store as its source of truth. Ozon and cloud-warehouse integrations are represented by isolated mock adapters, while feature modules consume shared selectors and commands so dashboard, orders, inventory, labels, returns, and logs update together.

**Tech Stack:** React 19, TypeScript 5, Vite 7, Vitest, Testing Library, CSS variables and native SVG icons.

**Spec:** `docs/superpowers/specs/2026-09-07-ozon-cloud-warehouse-demo-design.md`

## Global Constraints

- The demo contains 12 navigable business pages and no blank routes.
- All visible business copy is Chinese; original platform status codes may appear beside Chinese explanations.
- All people, stores, warehouses, addresses, tracking numbers, and credentials are fictional.
- Every label preview carries a visible `DEMO / 演示数据` watermark.
- No real Ozon, warehouse, payment, refund, or logistics request is sent.
- Demo state persists in local storage and can be reset to the seed state.
- The primary desktop view must work at 1366×768 and 1440×900 without critical horizontal overflow.
- The Ozon adapter, warehouse adapter, routing engine, domain store, and UI modules remain isolated behind typed interfaces.

---

## File Map

- `package.json` — scripts and pinned dependencies.
- `index.html` — application entry document.
- `src/main.tsx` — React bootstrap.
- `src/styles.css` — tokens, layout, component styles, responsive rules.
- `src/domain/types.ts` — shared domain types and status unions.
- `src/domain/seed.ts` — deterministic stores, warehouses, SKUs, orders, returns, tasks, and logs.
- `src/domain/routing.ts` — deterministic warehouse routing and stock calculation.
- `src/domain/reducer.ts` — state transitions and idempotent commands.
- `src/domain/selectors.ts` — dashboard and filtered-view calculations.
- `src/integrations/ozonAdapter.ts` — mock Ozon operations.
- `src/integrations/warehouseAdapter.ts` — mock cloud-warehouse operations.
- `src/state/DemoContext.tsx` — persistence, reset, commands, and async simulation.
- `src/app/routes.ts` — route metadata and role access.
- `src/app/AppShell.tsx` — navigation, switchers, header, and responsive shell.
- `src/components/` — reusable cards, tables, tags, drawer, modal, timeline, toast, empty state.
- `src/pages/` — one focused page per approved menu item.
- `src/tests/` — unit and interaction tests.
- `docs/demo-guide.md` — four-flow presentation script.

---

### Task 1: Application Skeleton and Navigation Contract

**Files:**
- Create: `package.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/routes.ts`
- Create: `src/app/AppShell.tsx`
- Create: `src/styles.css`
- Test: `src/tests/routes.test.ts`

**Interfaces:**
- Produces: `AppRoute { id, label, group, icon, roles }`, `APP_ROUTES`, `AppShell`.
- Consumes: none.

- [ ] **Step 1: Write the failing route-contract test**

```ts
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '../app/routes';

describe('APP_ROUTES', () => {
  it('contains the 12 approved unique routes', () => {
    expect(APP_ROUTES).toHaveLength(12);
    expect(new Set(APP_ROUTES.map((route) => route.id)).size).toBe(12);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/tests/routes.test.ts`
Expected: FAIL because `src/app/routes.ts` does not exist.

- [ ] **Step 3: Create the Vite app shell and all route metadata**

Define exactly these route ids: `dashboard`, `orders`, `fulfillment`, `labels`, `products`, `inventory`, `prices`, `returns`, `warehouses`, `sku-mapping`, `exceptions`, `settings`. Render a temporary titled panel for each route, with left navigation and hash-based route selection.

- [ ] **Step 4: Run the route test and production build**

Run: `npm test -- src/tests/routes.test.ts && npm run build`
Expected: PASS and `dist/index.html` created.

- [ ] **Step 5: Commit the skeleton**

```bash
git add package.json index.html src
git commit -m "feat: scaffold cloud warehouse demo shell"
```

### Task 2: Typed Domain Model and Deterministic Seed Data

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/seed.ts`
- Test: `src/tests/seed.test.ts`

**Interfaces:**
- Produces: `DemoState`, `Order`, `OrderItem`, `Store`, `Warehouse`, `SkuMapping`, `InventoryRecord`, `ReturnCase`, `IntegrationTask`, `AuditLog`, `createSeedState(): DemoState`.
- Consumes: none.

- [ ] **Step 1: Write the failing seed-shape test**

```ts
import { describe, expect, it } from 'vitest';
import { createSeedState } from '../domain/seed';

it('creates the approved deterministic demo dataset', () => {
  const state = createSeedState();
  expect(state.stores).toHaveLength(3);
  expect(state.warehouses).toHaveLength(3);
  expect(state.products).toHaveLength(50);
  expect(state.orders).toHaveLength(30);
  expect(state.orders.map((order) => order.scenario)).toEqual(
    expect.arrayContaining(['normal', 'fallback', 'unmapped', 'return'])
  );
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/tests/seed.test.ts`
Expected: FAIL because domain types and seed data do not exist.

- [ ] **Step 3: Implement domain types and seed factories**

Use union types for the approved fulfillment states and create fixed fictional data for three stores, three Russian warehouses, fifty products, thirty orders, six returns, inventory records, integration tasks, and audit logs. Include four named scenario orders with stable ids for the demo guide.

- [ ] **Step 4: Run domain tests**

Run: `npm test -- src/tests/seed.test.ts`
Expected: PASS with deterministic counts and scenario ids.

- [ ] **Step 5: Commit the domain model**

```bash
git add src/domain src/tests/seed.test.ts
git commit -m "feat: add typed demo domain and seed data"
```

### Task 3: Routing Engine, Inventory Formula, and Idempotent Reducer

**Files:**
- Create: `src/domain/routing.ts`
- Create: `src/domain/reducer.ts`
- Create: `src/domain/selectors.ts`
- Test: `src/tests/routing.test.ts`
- Test: `src/tests/reducer.test.ts`

**Interfaces:**
- Produces: `selectWarehouse(order, state): RouteDecision`, `ozonAvailable(record): number`, `demoReducer(state, action): DemoState`, `selectDashboardMetrics(state, filter): DashboardMetrics`.
- Consumes: types and seed state from Task 2.

- [ ] **Step 1: Write failing routing and idempotency tests**

```ts
it('falls back to the next eligible warehouse when the preferred warehouse is short', () => {
  const state = createSeedState();
  const order = state.orders.find((item) => item.scenario === 'fallback')!;
  expect(selectWarehouse(order, state).warehouseId).toBe('wh-kazan');
});

it('does not create two active outbound tasks for repeated dispatch', () => {
  const state = createSeedState();
  const once = demoReducer(state, { type: 'DISPATCH_ORDER', orderId: 'order-normal' });
  const twice = demoReducer(once, { type: 'DISPATCH_ORDER', orderId: 'order-normal' });
  expect(twice.tasks.filter((task) => task.orderId === 'order-normal' && task.kind === 'outbound')).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests and confirm both fail**

Run: `npm test -- src/tests/routing.test.ts src/tests/reducer.test.ts`
Expected: FAIL because routing and reducer functions do not exist.

- [ ] **Step 3: Implement pure domain logic**

Implement the approved warehouse priority order, `max(0, available - safetyStock)` inventory formula, status transitions, audit-log creation, inventory reservation, dispatch idempotency, mapping repair, task retry, return decisions, reset, and derived dashboard selectors.

- [ ] **Step 4: Run all domain tests**

Run: `npm test -- src/tests/routing.test.ts src/tests/reducer.test.ts src/tests/seed.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit domain behavior**

```bash
git add src/domain src/tests
git commit -m "feat: implement routing and demo state transitions"
```

### Task 4: Mock Integrations and Persistent Demo Context

**Files:**
- Create: `src/integrations/ozonAdapter.ts`
- Create: `src/integrations/warehouseAdapter.ts`
- Create: `src/state/DemoContext.tsx`
- Test: `src/tests/adapters.test.ts`
- Test: `src/tests/context.test.tsx`

**Interfaces:**
- Produces: `OzonAdapter`, `WarehouseAdapter`, `DemoProvider`, `useDemo()`, `runCommand(command): Promise<CommandResult>`.
- Consumes: `DemoState`, reducer actions, and seed factory from Tasks 2–3.

- [ ] **Step 1: Write failing adapter tests**

```ts
it('returns a watermarked demo label and never a live URL', async () => {
  const result = await ozonAdapter.getLabel('order-normal');
  expect(result.watermark).toBe('DEMO / 演示数据');
  expect(result.source).toBe('mock');
});

it('returns a readable rejection for the configured warehouse failure', async () => {
  await expect(warehouseAdapter.createOutbound('order-warehouse-error')).rejects.toMatchObject({
    code: 'WAREHOUSE_REJECTED'
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- src/tests/adapters.test.ts src/tests/context.test.tsx`
Expected: FAIL because adapters and provider do not exist.

- [ ] **Step 3: Implement adapters and state provider**

Use short deterministic delays, explicit success and failure fixtures, reducer-backed commands, `localStorage` key `ozon-cloud-demo-v1`, reset support, and toast events. Do not call `fetch` in either mock adapter.

- [ ] **Step 4: Run adapter and context tests**

Run: `npm test -- src/tests/adapters.test.ts src/tests/context.test.tsx`
Expected: PASS and source scan finds no `fetch(` inside `src/integrations`.

- [ ] **Step 5: Commit integration boundaries**

```bash
git add src/integrations src/state src/tests
git commit -m "feat: add mock Ozon and warehouse adapters"
```

### Task 5: Shared UI, Role Permissions, and App Shell

**Files:**
- Create: `src/components/MetricCard.tsx`
- Create: `src/components/DataTable.tsx`
- Create: `src/components/StatusTag.tsx`
- Create: `src/components/Drawer.tsx`
- Create: `src/components/ConfirmModal.tsx`
- Create: `src/components/Timeline.tsx`
- Create: `src/components/ToastRegion.tsx`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/styles.css`
- Test: `src/tests/permissions.test.tsx`

**Interfaces:**
- Produces: reusable presentation components and role-filtered navigation.
- Consumes: `APP_ROUTES`, `useDemo()`, and role definitions.

- [ ] **Step 1: Write the failing role-navigation test**

```tsx
it('hides configuration routes from the warehouse role', () => {
  render(<DemoProvider initialRole="warehouse"><AppShell /></DemoProvider>);
  expect(screen.queryByText('系统设置')).not.toBeInTheDocument();
  expect(screen.getByText('面单中心')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/tests/permissions.test.tsx`
Expected: FAIL because role-filtered shell is incomplete.

- [ ] **Step 3: Build shared components and polished shell**

Add grouped navigation, active route state, store/warehouse/role switchers, semantic status colors, keyboard-accessible modal and drawer behavior, compact table controls, and non-blocking toast feedback.

- [ ] **Step 4: Run component tests and build**

Run: `npm test -- src/tests/permissions.test.tsx && npm run build`
Expected: PASS and no TypeScript errors.

- [ ] **Step 5: Commit the UI foundation**

```bash
git add src/app src/components src/styles.css src/tests
git commit -m "feat: build role-aware operations shell"
```

### Task 6: Dashboard, Orders, Fulfillment, and Labels

**Files:**
- Create: `src/pages/DashboardPage.tsx`
- Create: `src/pages/OrdersPage.tsx`
- Create: `src/pages/FulfillmentPage.tsx`
- Create: `src/pages/LabelsPage.tsx`
- Test: `src/tests/fulfillment-flow.test.tsx`

**Interfaces:**
- Produces: the normal fulfillment and fallback-warehouse demo flows.
- Consumes: shared components, selectors, `runCommand`, and scenario order ids.

- [ ] **Step 1: Write the failing normal-flow interaction test**

```tsx
it('dispatches the normal order and updates status, stock, metrics, and logs', async () => {
  renderDemoAt('orders');
  await userEvent.click(screen.getByText('正常履约演示单'));
  await userEvent.click(screen.getByRole('button', { name: '获取面单并下发云仓' }));
  expect(await screen.findByText('云仓已接单')).toBeInTheDocument();
  expect(screen.getByText('任务已写入操作日志')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the interaction test and confirm it fails**

Run: `npm test -- src/tests/fulfillment-flow.test.tsx`
Expected: FAIL because the four feature pages do not exist.

- [ ] **Step 3: Implement the four linked pages**

Build KPI cards, store filters, order tabs, dense order table, detail drawer, status timeline, auto/manual routing, batch dispatch, label preview with watermark, print simulation, cutoff alerts, and linked updates across all four pages.

- [ ] **Step 4: Run flow tests and build**

Run: `npm test -- src/tests/fulfillment-flow.test.tsx && npm run build`
Expected: PASS; label preview contains the demo watermark.

- [ ] **Step 5: Commit the outbound flow**

```bash
git add src/pages src/tests/fulfillment-flow.test.tsx
git commit -m "feat: add linked order fulfillment demo"
```

### Task 7: Products, Inventory, and Prices

**Files:**
- Create: `src/pages/ProductsPage.tsx`
- Create: `src/pages/InventoryPage.tsx`
- Create: `src/pages/PricesPage.tsx`
- Test: `src/tests/inventory-flow.test.tsx`

**Interfaces:**
- Produces: catalog browsing, inventory synchronization, safety-stock editing, and basic price changes.
- Consumes: product, inventory, store, warehouse state and `ozonAvailable`.

- [ ] **Step 1: Write the failing safety-stock test**

```tsx
it('recalculates Ozon stock after safety stock changes', async () => {
  renderDemoAt('inventory');
  await userEvent.click(screen.getByRole('button', { name: '编辑安全库存' }));
  await userEvent.clear(screen.getByLabelText('安全库存'));
  await userEvent.type(screen.getByLabelText('安全库存'), '8');
  await userEvent.click(screen.getByRole('button', { name: '保存并同步' }));
  expect(await screen.findByText('已同步至Ozon')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/tests/inventory-flow.test.tsx`
Expected: FAIL because the inventory page does not exist.

- [ ] **Step 3: Implement the catalog pages**

Provide product thumbnails, SKU and status filters, detail drawer, basic status toggle, multi-warehouse stock table, stock composition, safety-stock modal, bulk sync action, price and promotion columns, and basic batch price simulation.

- [ ] **Step 4: Run catalog tests and build**

Run: `npm test -- src/tests/inventory-flow.test.tsx && npm run build`
Expected: PASS with non-negative Ozon stock values.

- [ ] **Step 5: Commit catalog operations**

```bash
git add src/pages src/tests/inventory-flow.test.tsx
git commit -m "feat: add product inventory and price views"
```

### Task 8: Returns, Warehouses, and SKU Mapping

**Files:**
- Create: `src/pages/ReturnsPage.tsx`
- Create: `src/pages/WarehousesPage.tsx`
- Create: `src/pages/SkuMappingPage.tsx`
- Test: `src/tests/mapping-retry.test.tsx`
- Test: `src/tests/return-flow.test.tsx`

**Interfaces:**
- Produces: rFBS return decisions, warehouse capability views, and mapping repair flow.
- Consumes: return cases, warehouse state, SKU mappings, and reducer commands.

- [ ] **Step 1: Write failing mapping and return tests**

```tsx
it('repairs an unmapped SKU and successfully retries the blocked order', async () => {
  renderDemoAt('sku-mapping');
  await userEvent.click(screen.getByText('建立映射'));
  await userEvent.selectOptions(screen.getByLabelText('云仓货号'), 'CW-9008');
  await userEvent.click(screen.getByRole('button', { name: '保存并重试' }));
  expect(await screen.findByText('订单已恢复履约')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- src/tests/mapping-retry.test.tsx src/tests/return-flow.test.tsx`
Expected: FAIL because the feature pages do not exist.

- [ ] **Step 3: Implement returns, warehouse cards, and mapping repair**

Add return reason and evidence panels, approve/reject confirmation, return-warehouse selection, simulated receipt and inspection, warehouse connection and capability cards, coverage and priority display, mapping filters, bulk-import preview, and save-and-retry behavior.

- [ ] **Step 4: Run feature tests and build**

Run: `npm test -- src/tests/mapping-retry.test.tsx src/tests/return-flow.test.tsx && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit returns and warehouse setup**

```bash
git add src/pages src/tests
git commit -m "feat: add returns warehouses and SKU mapping"
```

### Task 9: Exceptions, Logs, Settings, and Reset

**Files:**
- Create: `src/pages/ExceptionsPage.tsx`
- Create: `src/pages/SettingsPage.tsx`
- Test: `src/tests/exception-retry.test.tsx`
- Test: `src/tests/reset.test.tsx`

**Interfaces:**
- Produces: readable exception handling, retry actions, audit views, configuration views, and seed reset.
- Consumes: integration tasks, audit logs, role permissions, and context commands.

- [ ] **Step 1: Write failing exception and reset tests**

```tsx
it('shows a readable reason and retries a retryable task', async () => {
  renderDemoAt('exceptions');
  expect(screen.getByText('云仓接口暂时不可用')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: '重新执行' }));
  expect(await screen.findByText('重试成功')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and confirm they fail**

Run: `npm test -- src/tests/exception-retry.test.tsx src/tests/reset.test.tsx`
Expected: FAIL because exception and settings pages do not exist.

- [ ] **Step 3: Implement exception recovery and settings**

Show object, failed node, readable cause, recommendation, last attempt, retry count, sanitized request summary, and retry eligibility. Add mock store authorization, role matrix, routing-rule display, sync-frequency controls, local persistence indicator, and confirmed reset action.

- [ ] **Step 4: Run tests and build**

Run: `npm test -- src/tests/exception-retry.test.tsx src/tests/reset.test.tsx && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit operational controls**

```bash
git add src/pages src/tests
git commit -m "feat: add exception recovery and settings"
```

### Task 10: Responsive QA, Accessibility, and Demo Guide

**Files:**
- Modify: `src/styles.css`
- Modify: `src/app/AppShell.tsx`
- Create: `src/tests/acceptance.test.tsx`
- Create: `docs/demo-guide.md`
- Create: `scripts/verify-demo.mjs`

**Interfaces:**
- Produces: verified release build and four-flow presentation guide.
- Consumes: the completed application.

- [ ] **Step 1: Write the failing acceptance test**

```ts
it('renders every approved route without an empty main region', async () => {
  for (const route of APP_ROUTES) {
    const view = renderDemoAt(route.id);
    expect(view.getByRole('main').textContent?.trim().length).toBeGreaterThan(40);
    view.unmount();
  }
});
```

- [ ] **Step 2: Run the full suite and record failures**

Run: `npm test`
Expected: acceptance failures identify any empty route, missing accessible name, or broken interaction.

- [ ] **Step 3: Complete responsive and accessibility fixes**

Ensure keyboard focus visibility, semantic buttons, labelled controls, modal focus handling, table overflow containment, sticky actions, compact 1366×768 layout, and clear 1440×900 presentation. Write a four-part Chinese demo guide using the stable scenario order ids.

- [ ] **Step 4: Run final verification**

Run: `npm test && npm run build && node scripts/verify-demo.mjs`
Expected: all tests pass, build exits zero, twelve route headings exist, no live endpoint strings are present, and the label watermark is present.

- [ ] **Step 5: Commit the verified demo**

```bash
git add src docs scripts
git commit -m "feat: complete verified Ozon cloud warehouse demo"
```

---

## Completion Evidence

- Attach the full test and build command results.
- Provide the clickable demo entry point.
- Provide `docs/demo-guide.md` for the four presentation flows.
- State clearly that integrations and labels are simulated.
