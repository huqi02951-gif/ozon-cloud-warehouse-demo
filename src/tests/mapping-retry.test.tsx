/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AppShell } from '../app/AppShell';
import { DemoProvider, useDemo } from '../state/DemoContext';

function StateProbe() {
  const { state } = useDemo();
  const order = state.orders.find((item) => item.id === 'order-unmapped');
  const task = state.tasks.find((item) => item.kind === 'outbound' && item.orderId === order?.id);
  const mapping = state.skuMappings.find((item) => item.id === 'mapping-store-taiga-product-49');
  return <><output aria-label="履约状态">{order?.status}|{task?.warehouseId ?? '无任务'}</output><output aria-label="映射共享状态">{mapping?.status}|{mapping?.warehouseSku ?? '无货号'}</output></>;
}

beforeEach(() => { window.localStorage.clear(); window.history.replaceState(null, '', '#/sku-mapping'); });
afterEach(cleanup);

it('修复未映射 SKU 后真正重试并创建出库任务', async () => {
  const user = userEvent.setup();
  render(<DemoProvider><AppShell /><StateProbe /></DemoProvider>);
  await user.click(screen.getByRole('button', { name: '建立映射' }));
  await user.selectOptions(screen.getByLabelText('云仓货号'), 'CW-9008');
  await user.click(screen.getByRole('button', { name: '保存并重试' }));
  expect(await screen.findByText('订单已恢复履约')).toBeTruthy();
  expect(screen.getByLabelText('履约状态').textContent).toMatch(/^warehouse-accepted\|wh-/);
});

it('批量导入先预览确定样例，再由用户应用', async () => {
  const user = userEvent.setup();
  render(<DemoProvider><AppShell /></DemoProvider>);
  await user.click(screen.getByRole('button', { name: '批量导入' }));
  expect(screen.getByRole('dialog', { name: '批量导入预览' })).toBeTruthy();
  expect(screen.getByText('CW-9008')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '应用 1 条映射' }));
  expect(await screen.findByText('已应用 1 条演示映射')).toBeTruthy();
});

it.each([
  ['不匹配云仓', async (user: ReturnType<typeof userEvent.setup>) => user.selectOptions(screen.getByRole('combobox', { name: '当前云仓' }), 'wh-moscow')],
  ['不匹配搜索', async (user: ReturnType<typeof userEvent.setup>) => user.type(screen.getByRole('textbox', { name: '搜索 SKU' }), '不存在的 SKU')],
  ['已映射状态', async (user: ReturnType<typeof userEvent.setup>) => user.selectOptions(screen.getByRole('combobox', { name: '映射状态' }), 'mapped')],
])('%s筛选下不会修复隐藏的缺失映射', async (_label, applyFilter) => {
  const user = userEvent.setup();
  render(<DemoProvider><AppShell /><StateProbe /></DemoProvider>);
  await applyFilter(user);
  expect((screen.getByRole('button', { name: '批量导入' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByLabelText('映射共享状态').textContent).toBe('unmapped|无货号');
});
