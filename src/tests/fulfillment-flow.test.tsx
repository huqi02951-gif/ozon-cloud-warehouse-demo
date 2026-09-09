/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../app/AppShell';
import { createDemoRuntime, DemoProvider } from '../state/DemoContext';
import { createSeedState } from '../domain/seed';

function renderDemoAt(route: string, role: 'admin' | 'operator' | 'warehouse' = 'admin') {
  window.localStorage.clear();
  window.history.replaceState(null, '', `#/${route}`);
  return render(<DemoProvider initialRole={role}><AppShell /></DemoProvider>);
}

describe('订单履约联动', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('下发正常订单并联动状态、库存、指标和日志', async () => {
    const user = userEvent.setup();
    renderDemoAt('orders');
    await user.click(screen.getByRole('button', { name: /正常履约演示单/ }));
    await user.click(screen.getByRole('button', { name: '获取面单并下发云仓' }));
    expect((await screen.findAllByText('云仓已接单')).length).toBeGreaterThan(0);
    expect(await screen.findByText('任务已写入操作日志')).toBeTruthy();
    expect(await screen.findByText('演示面单')).toBeTruthy();
  });

  it('仓库人员可以推进出库但不能取消、改仓或下发', async () => {
    const user = userEvent.setup();
    renderDemoAt('fulfillment', 'warehouse');
    expect(screen.queryByRole('button', { name: /下发云仓|手工改仓|取消订单/ })).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: '当前云仓' }), 'wh-kazan');
    await user.click(screen.getAllByRole('button', { name: /云仓已接单.*推进/ })[0]);
    expect((await screen.findAllByText('拣货中')).length).toBeGreaterThan(0);
  });

  it('面单预览显示水印并可模拟打印', async () => {
    const user = userEvent.setup();
    renderDemoAt('labels');
    await user.click(screen.getByRole('button', { name: /预览.*正常履约演示单/ }));
    const dialog = await screen.findByRole('dialog', { name: /演示面单/ });
    expect(within(dialog).getByText('DEMO / 演示数据')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: '模拟打印' }));
    expect(await screen.findByText('面单已进入模拟打印队列')).toBeTruthy();
  });

  it('修复已知未映射 SKU 后可以下发且未知订单仍被拒绝', async () => {
    const runtime = createDemoRuntime({ initialState: createSeedState(), storage: undefined });
    runtime.dispatch({
      type: 'REPAIR_SKU_MAPPING',
      mappingId: 'mapping-store-taiga-product-49',
      warehouseSku: 'CN-DEMO-049',
      warehouseId: 'wh-kazan',
    });

    const repaired = await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-unmapped' });
    const unknown = await runtime.runCommand({ type: 'DISPATCH_ORDER', orderId: 'order-not-configured' });

    expect(repaired.ok).toBe(true);
    expect(runtime.getSnapshot().state.orders.find(order => order.id === 'order-unmapped')?.status).toBe('warehouse-accepted');
    expect(unknown).toMatchObject({ ok: false, error: { code: 'DISPATCH_ORDER_NOT_FOUND' } });
  });

  it('批量下发会处理全部可见待处理订单并汇总结果', async () => {
    const user = userEvent.setup();
    renderDemoAt('fulfillment');
    await user.click(screen.getByRole('button', { name: '批量下发待处理订单' }));
    expect(await screen.findByText(/批量处理完成：成功 \d+，失败 \d+，无需处理 \d+/)).toBeTruthy();
  });

  it('拉取操作遵循全局店铺筛选并显示真实处理数量', async () => {
    const user = userEvent.setup();
    renderDemoAt('orders');
    await user.selectOptions(screen.getByRole('combobox', { name: '当前店铺' }), 'store-polaris');
    await user.click(screen.getByRole('button', { name: '模拟拉取新订单' }));
    expect(await screen.findByText(/当前筛选范围已拉取 \d+ 笔订单/)).toBeTruthy();
  });

  it('订单深链接会打开筛选范围内的指定订单', async () => {
    window.history.replaceState(null, '', '#/orders?order=order-normal');
    render(<DemoProvider><AppShell /></DemoProvider>);
    expect(await screen.findByRole('dialog', { name: '正常履约演示单' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: '关闭正常履约演示单' }));
    window.history.replaceState(null, '', '#/orders?order=order-fallback');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('dialog', { name: '缺货改仓演示单' })).toBeTruthy();
  });

  it('批量获取全部可见面单并汇总成功失败数量', async () => {
    const user = userEvent.setup();
    renderDemoAt('labels');
    await user.click(screen.getByRole('button', { name: '批量获取面单' }));
    expect(await screen.findByText(/批量获取完成：成功 \d+，失败 0/)).toBeTruthy();
  });
});
