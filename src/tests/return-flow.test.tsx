/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AppShell } from '../app/AppShell';
import { DemoProvider, useDemo } from '../state/DemoContext';

function ReturnProbe() {
  const { state } = useDemo();
  const item = state.returns.find((value) => value.id === 'return-01')!;
  const inventory = state.inventory.find((value) => value.productId === item.productId && value.warehouseId === item.returnWarehouseId);
  return <output aria-label="退货共享状态">{item.status}|{item.returnWarehouseId}|{inventory?.available}|{state.auditLogs.at(-1)?.action}|{state.auditLogs.at(-1)?.actor}</output>;
}

beforeEach(() => { window.localStorage.clear(); window.history.replaceState(null, '', '#/returns'); });
afterEach(cleanup);

it('确认同意、选择退回仓、签收及可售验货联动退货库存和日志', async () => {
  const user = userEvent.setup();
  render(<DemoProvider><AppShell /><ReturnProbe /></DemoProvider>);
  await user.click(screen.getByRole('button', { name: /查看.*return-01/i }));
  await user.selectOptions(screen.getByLabelText('退回云仓'), 'wh-novosibirsk');
  await user.click(screen.getByRole('button', { name: '同意退货' }));
  await user.click(screen.getByRole('button', { name: '确认同意' }));
  expect(await screen.findByText('退货申请已同意')).toBeTruthy();
  await user.click(screen.getByRole('button', { name: '确认签收' }));
  await user.click(screen.getByRole('button', { name: '验货：恢复可售' }));
  expect(await screen.findByText('验货完成，已恢复可售库存')).toBeTruthy();
  expect(screen.getByLabelText('退货共享状态').textContent).toMatch(/^inspected\|wh-novosibirsk\|\d+\|RETURN_INSPECTED\|管理员$/);
});

it('仓库人员只能签收和验货，不能审核退货', async () => {
  const user = userEvent.setup();
  render(<DemoProvider initialRole="warehouse"><AppShell /></DemoProvider>);
  await user.click(screen.getByRole('button', { name: /查看.*return-01/i }));
  expect(screen.queryByRole('button', { name: /同意退货|拒绝退货/ })).toBeNull();
  expect(screen.queryByRole('button', { name: '确认签收' })).toBeNull();
});
