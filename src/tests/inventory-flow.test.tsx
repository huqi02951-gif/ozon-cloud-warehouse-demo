/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../app/AppShell';
import { DemoProvider } from '../state/DemoContext';

function renderDemoAt(route: string, role: 'admin' | 'operator' | 'warehouse' = 'admin') {
  window.localStorage.clear();
  window.history.replaceState(null, '', `#/${route}`);
  return render(<DemoProvider initialRole={role}><AppShell /></DemoProvider>);
}

describe('商品、库存与价格操作', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('修改安全库存后重新计算并同步 Ozon 库存', async () => {
    const user = userEvent.setup();
    renderDemoAt('inventory');
    const firstRow = screen.getAllByRole('row')[1];
    const before = Number(within(firstRow).getByTestId('ozon-stock').textContent);
    await user.click(within(firstRow).getByRole('button', { name: '编辑安全库存' }));
    await user.clear(screen.getByLabelText('安全库存'));
    await user.type(screen.getByLabelText('安全库存'), '8');
    await user.click(screen.getByRole('button', { name: '保存并同步' }));
    expect(await screen.findByText('已同步至Ozon')).toBeTruthy();
    expect(Number(screen.getAllByTestId('ozon-stock')[0].textContent)).toBeLessThanOrEqual(before);
  });

  it('拒绝负数和小数安全库存', async () => {
    const user = userEvent.setup();
    renderDemoAt('inventory');
    await user.click(screen.getAllByRole('button', { name: '编辑安全库存' })[0]);
    await user.clear(screen.getByLabelText('安全库存'));
    await user.type(screen.getByLabelText('安全库存'), '-1.5');
    await user.click(screen.getByRole('button', { name: '保存并同步' }));
    expect(screen.getByRole('alert').textContent).toContain('请输入非负整数');
  });

  it('价格批量修改优先应用于勾选商品并显示准确数量', async () => {
    const user = userEvent.setup();
    renderDemoAt('prices');
    await user.click(screen.getAllByRole('checkbox', { name: /选择/ })[0]);
    await user.selectOptions(screen.getByLabelText('调整方式'), 'fixed');
    await user.clear(screen.getByLabelText('调整值'));
    await user.type(screen.getByLabelText('调整值'), '1299');
    await user.click(screen.getByRole('button', { name: '应用批量调价' }));
    expect(await screen.findByText('批量调价成功：已更新 1 个商品')).toBeTruthy();
    expect(screen.getAllByText('1,299 ₽').length).toBeGreaterThan(0);
  });

  it('固定价格只接受至少 1 卢布的整数', async () => {
    const user = userEvent.setup();
    renderDemoAt('prices');
    await user.selectOptions(screen.getByLabelText('调整方式'), 'fixed');
    await user.type(screen.getByLabelText('调整值'), '0.49');
    await user.click(screen.getByRole('button', { name: '应用批量调价' }));
    expect(screen.getByRole('alert').textContent).toContain('至少 1 卢布的整数');
    expect(screen.queryByText(/批量调价成功/)).toBeNull();
  });

  it('搜索范围变化后清除不可见选择并按实际目标计数', async () => {
    const user = userEvent.setup();
    renderDemoAt('prices');
    await user.click(screen.getAllByRole('checkbox', { name: /选择/ })[0]);
    await user.type(screen.getByLabelText('搜索商品'), '不存在的商品');
    expect(await screen.findByText('未勾选商品，将应用于当前可见 0 行')).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('调整方式'), 'fixed');
    await user.type(screen.getByLabelText('调整值'), '1299');
    await user.click(screen.getByRole('button', { name: '应用批量调价' }));
    expect(screen.getByRole('alert').textContent).toContain('没有可调价的商品');
  });

  it('仓库人员库存只读且无法访问商品和价格入口', () => {
    renderDemoAt('inventory', 'warehouse');
    expect(screen.queryByRole('button', { name: /编辑安全库存|同步可见库存/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /商品中心|价格管理/ })).toBeNull();
  });
});
