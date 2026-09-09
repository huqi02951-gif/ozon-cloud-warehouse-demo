// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from '../app/AppShell';
import { createDemoRuntime, DemoProvider } from '../state/DemoContext';
import { WarehouseAdapterError } from '../integrations/warehouseAdapter';

beforeEach(() => { window.localStorage.clear(); window.history.replaceState(null, '', '#/exceptions'); });
afterEach(cleanup);

it('shows a readable reason and completes a retryable task', async () => {
  render(<DemoProvider><AppShell /></DemoProvider>);

  expect(screen.getAllByText('云仓接口暂时不可用')).toHaveLength(2);
  expect(screen.getByText(/请求摘要：创建出库单 · 演示订单 005/)).toBeTruthy();
  const timeoutCard = screen.getAllByText('云仓接口暂时不可用')[0].closest('article')!;
  await userEvent.click(timeoutCard.querySelector('button')!);

  expect(await screen.findByText('重试成功')).toBeTruthy();
  expect(JSON.parse(window.localStorage.getItem('ozon-cloud-demo-v1')!).state.tasks.find((task: { id: string }) => task.id === 'task-warehouse-timeout')).toMatchObject({ status: 'succeeded', retryCount: 2 });
});

it('directs mapping failures to repair instead of offering retry', () => {
  render(<DemoProvider><AppShell /></DemoProvider>);
  const mappingCard = screen.getAllByText('SKU 未映射')[0].closest('article')!;
  expect(mappingCard.textContent).toContain('请先完成 SKU 映射');
  expect(mappingCard.querySelector('button')).toBeNull();
  expect(screen.getByRole('link', { name: '前往 SKU 映射' }).getAttribute('href')).toBe('#/sku-mapping');
});

it('does not report retry success when the deterministic warehouse retry fails', async () => {
  const runtime = createDemoRuntime({
    storage: undefined,
    warehouse: { createOutbound: async () => { throw new WarehouseAdapterError('WAREHOUSE_REJECTED', '云仓仍然拒绝接单'); } },
  });

  const result = await runtime.runCommand({ type: 'RETRY_TASK', taskId: 'task-warehouse-timeout' });

  expect(result).toMatchObject({ ok: false, message: '云仓仍然拒绝接单' });
  expect(runtime.getSnapshot().state.tasks.find(task => task.id === 'task-warehouse-timeout')).toMatchObject({ status: 'failed', retryCount: 1 });
});

it('enforces warehouse read-only retry permission in the runtime', async () => {
  const runtime = createDemoRuntime({ storage: undefined, initialRole: 'warehouse' });
  const result = await runtime.runCommand({ type: 'RETRY_TASK', taskId: 'task-warehouse-timeout' });
  expect(result).toMatchObject({ ok: false, error: { code: 'RETRY_FORBIDDEN' } });
});

it('retries a label failure through the Ozon mock before completing it', async () => {
  const getLabel = vi.fn(async (orderId: string) => ({ orderId, previewUrl: 'data:application/pdf;base64,DEMO', watermark: 'DEMO / 演示数据' as const, source: 'mock' as const }));
  const runtime = createDemoRuntime({ storage: undefined, ozon: { getLabel } });

  const result = await runtime.runCommand({ type: 'RETRY_TASK', taskId: 'task-label-failed' });

  expect(result.ok).toBe(true);
  expect(getLabel).toHaveBeenCalledWith('order-10');
  expect(runtime.getSnapshot().state.tasks.find(task => task.id === 'task-label-failed')?.status).toBe('succeeded');
});

it('includes mapping audit records related to scoped exception orders', async () => {
  render(<DemoProvider><AppShell /></DemoProvider>);
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '当前店铺' }), 'store-taiga');
  await userEvent.click(screen.getByRole('button', { name: '操作日志' }));
  expect(screen.getByText('MAPPING_BLOCKED')).toBeTruthy();
});
