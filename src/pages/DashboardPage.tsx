import React from 'react';
import { MetricCard } from '../components/MetricCard';
import { StatusTag } from '../components/StatusTag';
import { selectDashboardMetrics } from '../domain/selectors';
import { useDemo } from '../state/DemoContext';
import type { PageProps } from './types';
import { Status, visibleOrders } from './pageUtils';

export function DashboardPage({ storeId, warehouseId }: PageProps) {
  const { state } = useDemo();
  const metrics = selectDashboardMetrics(state, { storeId, warehouseId });
  const urgent = visibleOrders(state.orders, storeId, warehouseId).filter((o) => ['pending-dispatch', 'exception'].includes(o.status)).slice(0, 5);
  return <div className="page-stack">
    <div className="metric-grid">
      <MetricCard label="订单总量" value={metrics.totalOrders} hint="当前全局筛选范围" tone="primary" />
      <MetricCard label="待下发" value={metrics.pendingDispatch} hint="等待校验或分仓" tone="warning" />
      <MetricCard label="截单预警" value={metrics.cutoffAlerts} hint="未来 6 小时内" tone="danger" />
      <MetricCard label="履约异常" value={metrics.exceptions} hint="含失败接口任务" tone="danger" />
      <MetricCard label="已完成" value={metrics.completedOrders} hint="订单闭环完成" tone="success" />
      <MetricCard label="待处理退货" value={metrics.pendingReturns} hint="rFBS 售后队列" />
    </div>
    <section className="panel"><div className="panel__head"><div><h2>今日履约关注</h2><p>截单、缺货与异常订单集中处理</p></div><StatusTag tone="info">本地演示数据</StatusTag></div>
      <div className="compact-list">{urgent.map(o => <a href={`#/orders?order=${o.id}`} key={o.id}><strong>{o.displayNumber}</strong><span>{o.recipient.region}</span><Status status={o.status} /></a>)}</div>
    </section>
  </div>;
}
