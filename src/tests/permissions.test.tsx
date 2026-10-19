// @vitest-environment jsdom

import React, { useState } from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppShell } from '../app/AppShell';
import { ConfirmModal } from '../components/ConfirmModal';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { Drawer } from '../components/Drawer';
import { MetricCard } from '../components/MetricCard';
import { StatusTag } from '../components/StatusTag';
import { Timeline } from '../components/Timeline';
import { ToastRegion } from '../components/ToastRegion';
import { DemoProvider, useDemo } from '../state/DemoContext';

function renderShell(role: 'admin' | 'operator' | 'warehouse' = 'admin') {
  return render(
    <DemoProvider initialRole={role}>
      <AppShell />
    </DemoProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '#/dashboard';
});

afterEach(() => {
  cleanup();
});

describe('角色导航与全局筛选', () => {
  it('仓库人员看不到配置路由但可以进入面单中心', () => {
    renderShell('warehouse');

    expect(screen.queryByText('云仓管理')).toBeNull();
    expect(screen.queryByText('SKU 映射')).toBeNull();
    expect(screen.queryByText('系统设置')).toBeNull();
    expect(screen.getByRole('link', { name: /面单中心/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: '出库履约' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '出库履约 只读' })).toBeNull();
    const warehouse = screen.getByRole('combobox', { name: '当前云仓' }) as HTMLSelectElement;
    expect(warehouse.value).toBe('wh-moscow');
    expect([...warehouse.options].some(option => option.value === 'all')).toBe(false);
  });

  it('管理员可访问全部十三个业务路由且当前路由有明确标识', () => {
    window.location.hash = '#/labels';
    renderShell('admin');

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    expect(within(navigation).getAllByRole('link')).toHaveLength(13);
    expect(within(navigation).getByRole('link', { name: /面单中心/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('面单中心');
  });

  it('运营人员保留全部业务入口且配置能力明确标为只读', () => {
    renderShell('operator');

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    expect(within(navigation).getAllByRole('link')).toHaveLength(13);
    expect(within(navigation).getByRole('link', { name: '云仓管理 只读' })).toBeTruthy();
    expect(within(navigation).getByRole('link', { name: '系统设置 只读' })).toBeTruthy();
    expect(within(navigation).getByRole('link', { name: '价格管理' })).toBeTruthy();
  });

  it('角色切换调用共享上下文并立即收紧导航权限', async () => {
    const user = userEvent.setup();
    renderShell('admin');

    await user.selectOptions(screen.getByRole('combobox', { name: '当前角色' }), 'warehouse');

    expect(screen.queryByRole('link', { name: /系统设置/ })).toBeNull();
    expect(screen.getByRole('link', { name: /面单中心/ })).toBeTruthy();
    expect((screen.getByRole('combobox', { name: '当前角色' }) as HTMLSelectElement).value).toBe('warehouse');
    expect((screen.getByRole('combobox', { name: '当前云仓' }) as HTMLSelectElement).value).toBe('wh-moscow');
    expect(screen.queryByRole('option', { name: '全部云仓' })).toBeNull();
  });

  it('仓库角色可切换单一模拟仓库工作区且页面使用该范围', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/exceptions';
    renderShell('warehouse');
    const warehouse = screen.getByRole('combobox', { name: '当前云仓' });

    expect(screen.getAllByText('云仓接口暂时不可用').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ozon 接口触发频率限制')).toBeNull();
    await user.selectOptions(warehouse, 'wh-kazan');
    expect((await screen.findAllByText('Ozon 接口触发频率限制')).length).toBeGreaterThan(0);
    expect(screen.queryByText('云仓接口暂时不可用')).toBeNull();
  });

  it('角色切换后用首个可访问路由替换无权限的当前地址', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/settings';
    renderShell('admin');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('系统设置');
    await user.selectOptions(screen.getByRole('combobox', { name: '当前角色' }), 'warehouse');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('运营工作台');
    await waitFor(() => expect(window.location.hash).toBe('#/dashboard'));
    expect(screen.getByRole('link', { name: /运营工作台/ }).getAttribute('aria-current')).toBe('page');
  });

  it('当前路由仍有权限时保留地址中的筛选参数', () => {
    window.location.hash = '#/labels?batch=ready';
    renderShell('admin');

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('面单中心');
    expect(window.location.hash).toBe('#/labels?batch=ready');
  });

  it('店铺和云仓切换器使用共享演示数据中的选项', async () => {
    const user = userEvent.setup();
    renderShell();

    const store = screen.getByRole('combobox', { name: '当前店铺' }) as HTMLSelectElement;
    const warehouse = screen.getByRole('combobox', { name: '当前云仓' }) as HTMLSelectElement;
    expect(store.options).toHaveLength(4);
    expect(warehouse.options).toHaveLength(4);

    await user.selectOptions(store, 'store-taiga');
    await user.selectOptions(warehouse, 'wh-kazan');

    expect(store.value).toBe('store-taiga');
    expect(warehouse.value).toBe('wh-kazan');
  });
});

describe('共享组件可访问性', () => {
  it('抽屉支持 Escape 关闭并把焦点还给触发按钮', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>查看订单</button>
          <Drawer open={open} title="订单详情" onClose={() => setOpen(false)}>
            <button type="button">处理订单</button>
          </Drawer>
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '查看订单' });
    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: '订单详情' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭订单详情' }));

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: '订单详情' })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('确认弹窗将安全操作作为初始焦点并约束 Tab 焦点', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>取消订单</button>
          <ConfirmModal
            open={open}
            title="确认取消订单"
            description="此操作只会修改虚构演示订单。"
            confirmLabel="确认取消"
            onConfirm={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '取消订单' }));

    const cancel = screen.getByRole('button', { name: '返回' });
    const confirm = screen.getByRole('button', { name: '确认取消' });
    expect(document.activeElement).toBe(cancel);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirm);
    await user.tab();
    expect(document.activeElement).toBe(cancel);
  });

  it('确认弹窗初始忙碌时将焦点留在弹窗容器', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>提交出库</button>
          <ConfirmModal
            open={open}
            busy
            title="正在提交出库"
            description="正在处理虚构演示订单。"
            onConfirm={() => undefined}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '提交出库' }));

    const dialog = screen.getByRole('alertdialog', { name: '正在提交出库' });
    expect(document.activeElement).toBe(dialog);
    await user.tab();
    expect(document.activeElement).toBe(dialog);
  });

  it('确认操作转为忙碌时将焦点移到弹窗容器', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      const [busy, setBusy] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>下发云仓</button>
          <ConfirmModal
            open={open}
            busy={busy}
            title="确认下发云仓"
            description="此操作只会修改虚构演示订单。"
            confirmLabel="确认下发"
            onConfirm={() => setBusy(true)}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '下发云仓' }));
    await user.click(screen.getByRole('button', { name: '确认下发' }));

    const dialog = screen.getByRole('alertdialog', { name: '确认下发云仓' });
    expect(document.activeElement).toBe(dialog);
    expect((screen.getByRole('button', { name: '正在处理' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('点击确认弹窗遮罩会关闭弹窗并清理滚动锁定', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>删除映射</button>
          <ConfirmModal
            open={open}
            title="确认删除映射"
            description="此操作只会修改虚构演示数据。"
            onConfirm={() => undefined}
            onCancel={() => setOpen(false)}
          />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '删除映射' });
    await user.click(trigger);
    const dialog = screen.getByRole('alertdialog', { name: '确认删除映射' });
    expect(document.body.style.overflow).toBe('hidden');

    await user.click(dialog.parentElement!);

    expect(screen.queryByRole('alertdialog', { name: '确认删除映射' })).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
  });

  it('数据表格、指标、状态和时间线保留语义结构', () => {
    type Row = { id: string; order: string; status: string };
    const columns: DataTableColumn<Row>[] = [
      { id: 'order', header: '订单号', cell: (row) => row.order },
      { id: 'status', header: '状态', cell: (row) => <StatusTag tone="success">已完成</StatusTag> },
    ];

    render(
      <>
        <MetricCard label="待下发" value={8} hint="较昨日减少 2 单" tone="warning" />
        <DataTable caption="订单列表" columns={columns} rows={[{ id: '1', order: '演示订单 001', status: 'completed' }]} rowKey={(row) => row.id} />
        <Timeline items={[{ id: '1', title: '已拉取', description: '来自模拟 Ozon 适配器', timestamp: '2026-09-07T09:00:00+03:00' }]} />
      </>,
    );

    expect(screen.getByRole('group', { name: '待下发' })).toBeTruthy();
    expect(screen.getByRole('table', { name: '订单列表' })).toBeTruthy();
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toBe('已完成');
    expect(screen.getByRole('list', { name: '状态时间线' })).toBeTruthy();
    expect(screen.getByText('2026-09-07T09:00:00+03:00').closest('time')?.dateTime).toBe('2026-09-07T09:00:00+03:00');
  });

  it('提示区域消费共享上下文消息并允许关闭', async () => {
    const user = userEvent.setup();

    function Harness() {
      const { resetDemo } = useDemo();
      return <button type="button" onClick={() => void resetDemo()}>重置演示</button>;
    }

    render(
      <DemoProvider>
        <Harness />
        <ToastRegion />
      </DemoProvider>,
    );
    await user.click(screen.getByRole('button', { name: '重置演示' }));

    expect(await screen.findByText('演示数据已重置')).toBeTruthy();
    const region = screen.getByRole('region', { name: '操作提示' });
    expect(region.getAttribute('aria-live')).toBeNull();
    expect(within(region).getAllByRole('status')).toHaveLength(1);
    expect(region.querySelectorAll('[aria-live]')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: '关闭提示：演示数据已重置' }));
    expect(screen.queryByText('演示数据已重置')).toBeNull();
  });
});
