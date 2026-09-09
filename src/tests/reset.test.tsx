// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AppShell } from '../app/AppShell';
import { createDemoRuntime, DEMO_STORAGE_KEY, DemoProvider } from '../state/DemoContext';
import { createSeedState } from '../domain/seed';

beforeEach(() => { window.localStorage.clear(); window.history.replaceState(null, '', '#/settings'); });
afterEach(cleanup);

it('persists settings and resets them only after confirmation', async () => {
  render(<DemoProvider><AppShell /></DemoProvider>);
  const frequency = screen.getByLabelText('库存同步频率');
  await userEvent.selectOptions(frequency, '30');
  await userEvent.click(screen.getByRole('button', { name: '保存设置' }));
  expect(await screen.findAllByText('设置已保存到本机')).toHaveLength(2);
  expect(JSON.parse(window.localStorage.getItem('ozon-cloud-demo-v1')!).state.settings.inventorySyncMinutes).toBe(30);

  await userEvent.click(screen.getByRole('button', { name: '重置演示数据' }));
  expect(screen.getByRole('alertdialog', { name: '重置演示数据' })).toBeTruthy();
  expect((screen.getByLabelText('库存同步频率') as HTMLSelectElement).value).toBe('30');
  await userEvent.click(screen.getByRole('button', { name: '确认重置' }));

  expect((await screen.findAllByText('演示数据已重置')).length).toBeGreaterThan(0);
  expect(screen.queryByText('设置已保存到本机')).toBeNull();
  expect((screen.getByLabelText('库存同步频率') as HTMLSelectElement).value).toBe('15');
});

it('keeps settings read-only for operators', () => {
  render(<DemoProvider initialRole="operator"><AppShell /></DemoProvider>);
  expect((screen.getByLabelText('库存同步频率') as HTMLSelectElement).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: '保存设置' })).toBeNull();
  expect(screen.queryByRole('button', { name: '重置演示数据' })).toBeNull();
});

it('hydrates default settings when loading persisted state from an older demo version', () => {
  const legacyState = createSeedState();
  const { settings: _settings, ...stateWithoutSettings } = legacyState;
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ state: stateWithoutSettings, role: 'operator' }));

  const runtime = createDemoRuntime({ storage: window.localStorage });

  expect(runtime.getSnapshot()).toMatchObject({ role: 'operator', state: { settings: { inventorySyncMinutes: 15, autoRouteEnabled: true } } });
});

it('uses the persisted auto-route setting when dispatching', async () => {
  const runtime = createDemoRuntime({ storage: undefined });
  await runtime.runCommand({ type: 'UPDATE_SETTINGS', inventorySyncMinutes: 15, autoRouteEnabled: false });

  const result = await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-07', manualOverride: false });

  expect(result).toMatchObject({ ok: false, error: { code: 'AUTO_ROUTE_DISABLED' } });
  expect(runtime.getSnapshot().state.tasks.some(task => task.orderId === 'order-07' && task.kind === 'outbound')).toBe(false);
});

it('rejects privileged settings, authorization, and reset commands for non-admin roles', async () => {
  const runtime = createDemoRuntime({ storage: undefined, initialRole: 'operator' });
  const original = runtime.getSnapshot().state;

  for (const command of [
    { type: 'UPDATE_SETTINGS' as const, inventorySyncMinutes: 30 as const, autoRouteEnabled: false },
    { type: 'UPDATE_STORE_CONNECTION' as const, storeId: original.stores[0].id, connected: !original.stores[0].connected },
    { type: 'UPDATE_WAREHOUSE_CONFIG' as const, warehouseId: original.warehouses[0].id, priority: 99, estimatedProcessingHours: 99, connected: false },
    { type: 'RESET_DEMO' as const },
    { type: 'RESET' as const },
  ]) {
    await expect(runtime.runCommand(command)).resolves.toMatchObject({ ok: false, error: { code: 'ADMIN_REQUIRED' } });
  }
  expect(runtime.getSnapshot().state).toBe(original);
});

it('blocks direct dispatch from bypassing non-admin configuration authorization', () => {
  const runtime = createDemoRuntime({ storage: undefined, initialRole: 'operator' });
  const original = runtime.getSnapshot().state;
  const warehouse = original.warehouses[0];

  runtime.dispatch({ type: 'UPDATE_WAREHOUSE_CONFIG', warehouseId: warehouse.id, priority: 99, estimatedProcessingHours: 99, connected: false });
  runtime.dispatch({ type: 'UPDATE_SETTINGS', inventorySyncMinutes: 60, autoRouteEnabled: false });
  runtime.dispatch({ type: 'RESET_DEMO' });

  expect(runtime.getSnapshot().state).toBe(original);
  expect(runtime.getSnapshot().toasts).toHaveLength(3);
  expect(runtime.getSnapshot().toasts.every(toast => toast.tone === 'error' && toast.message === '仅管理员可执行此操作')).toBe(true);
});

it('whitelists hydrated setting values instead of trusting malformed persisted config', () => {
  const state = createSeedState();
  window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ state: { ...state, settings: { inventorySyncMinutes: 17, autoRouteEnabled: 'yes' } }, role: 'admin' }));
  const runtime = createDemoRuntime({ storage: window.localStorage });
  expect(runtime.getSnapshot().state.settings).toEqual({ inventorySyncMinutes: 15, autoRouteEnabled: true });
});
