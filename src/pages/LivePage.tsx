import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MetricCard } from '../components/MetricCard';
import { StatusTag } from '../components/StatusTag';
import { DataTable } from '../components/DataTable';
import { createSimulatedEventSource, createSseEventSource } from '../realtime/eventSource';
import { useDemo } from '../state/DemoContext';
import type { PageProps } from './types';
import { Status, visibleOrders } from './pageUtils';

const SSE_URL = (import.meta.env.VITE_EVENTS_URL as string | undefined) || undefined;

export function LivePage({ storeId, warehouseId, role }: PageProps) {
  const { state, dispatch, runCommand } = useDemo();
  const [running, setRunning] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!running) return;
    const source = SSE_URL ? createSseEventSource(SSE_URL) : createSimulatedEventSource(() => stateRef.current, 2500);
    return source.start((event) => dispatch({ type: 'APPLY_WAREHOUSE_EVENT', event }));
  }, [running, dispatch]);

  const orders = visibleOrders(state.orders, storeId, warehouseId);
  const orderIds = useMemo(() => new Set(orders.map((order) => order.id)), [orders]);
  const events = (state.liveEvents ?? []).filter((event) => !event.orderId || orderIds.has(event.orderId)).slice(0, 30);
  const inWarehouse = orders.filter((order) => ['warehouse-accepted', 'picking', 'packed'].includes(order.status));
  const awaitingSync = orders.filter((order) => order.status === 'pending-ozon-sync');
  const synced = orders.filter((order) => order.ozonSyncedAt);
  const canSync = role !== 'warehouse';

  return <div className="page-stack">
    <div className="alert-strip">
      <strong>{running ? '实时接收中' : '已暂停'}</strong>
      <span>{SSE_URL ? `已连接服务端事件流 ${SSE_URL}` : '当前为浏览器内模拟云仓回传（配置 VITE_EVENTS_URL 后切换为服务端 SSE）'}</span>
      <button className="button button--primary" onClick={() => setRunning(!running)}>{running ? '暂停接收' : '开始接收云仓回传'}</button>
    </div>
    <div className="metric-grid">
      <MetricCard label="云仓作业中" value={inWarehouse.length} hint="已接单 / 拣货 / 打包" tone="primary" />
      <MetricCard label="待回写 Ozon" value={awaitingSync.length} hint="已出库，未同步发货" tone="warning" />
      <MetricCard label="已回写 Ozon" value={synced.length} hint="ship / tracking 成功" tone="success" />
      <MetricCard label="实时事件" value={events.length} hint="最近 30 条" />
    </div>
    <section className="panel"><div className="panel__head"><div><h2>待回写 Ozon</h2><p>云仓出库后需调用 Ozon 发货/运单接口，订单才算闭环</p></div></div>
      <DataTable caption="待回写 Ozon 订单" rows={awaitingSync} rowKey={(o) => o.id} columns={[
        { id: 'order', header: '订单', cell: (o) => <strong>{o.displayNumber}</strong> },
        { id: 'type', header: '模式', cell: (o) => o.fulfillmentType },
        { id: 'pkg', header: '包裹 / 运单', cell: (o) => (o.packages ?? []).map((p) => `${p.packageNo}${p.weightGrams ? ` ${(p.weightGrams / 1000).toFixed(2)}kg` : ''}${p.waybillNo ? ` · ${p.waybillNo}` : ''}`).join('；') || '—' },
        { id: 'status', header: '状态', cell: (o) => <Status status={o.status} /> },
        { id: 'action', header: '操作', align: 'end', cell: (o) => canSync ? <div className="row-actions">
          <button className="button button--primary" aria-label={`回写 Ozon ${o.displayNumber}`} onClick={() => void runCommand({ type: 'SYNC_TO_OZON', orderId: o.id })}>回写 Ozon</button>
          <button className="button button--secondary" aria-label={`模拟回写失败 ${o.displayNumber}`} onClick={() => void runCommand({ type: 'SYNC_TO_OZON', orderId: o.id, fail: true })}>模拟失败</button>
        </div> : <span className="muted">只读</span> },
      ]} />
    </section>
    <section className="panel"><div className="panel__head"><div><h2>实时事件流</h2><p>云仓回传与 Ozon 回写按时间倒序</p></div></div>
      <div className="audit-list" aria-label="实时事件流">{events.length === 0 ? <p className="empty-text">暂无实时事件，点击“开始接收云仓回传”</p> : events.map((event) =>
        <article key={event.id}><StatusTag tone={event.tone}>{event.source === 'warehouse' ? '云仓' : event.source === 'ozon-push' ? 'Ozon 推送' : 'Ozon 回写'}</StatusTag><div><strong>{event.title}</strong><p>{event.detail} · {event.occurredAt}</p></div></article>)}
      </div>
    </section>
  </div>;
}
