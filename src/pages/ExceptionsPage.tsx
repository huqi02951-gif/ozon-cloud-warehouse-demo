import React, { useState } from 'react';
import { StatusTag } from '../components/StatusTag';
import type { IntegrationTask } from '../domain/types';
import { useDemo } from '../state/DemoContext';
import type { PageProps } from './types';

const KIND_LABEL: Record<IntegrationTask['kind'], string> = { outbound: '出库下发', label: '面单生成', 'inventory-sync': '库存同步', 'return-receipt': '退货签收', 'ozon-ship': '回写 Ozon 发货', 'ozon-tracking': '回写 Ozon 运单' };

export function ExceptionsPage({ storeId, warehouseId, role }: PageProps) {
  const { state, runCommand } = useDemo();
  const [tab, setTab] = useState<'exceptions' | 'logs'>('exceptions');
  const [resultMessage, setResultMessage] = useState<{ ok: boolean; text: string }>();
  const orderIds = new Set(state.orders.filter(order => storeId === 'all' || order.storeId === storeId).map(order => order.id));
  const returnIds = new Set(state.returns.filter(item => storeId === 'all' || item.storeId === storeId).map(item => item.id));
  const tasks = state.tasks.filter(task => (warehouseId === 'all' || task.warehouseId === warehouseId)
    && (!task.orderId || orderIds.has(task.orderId)) && (!task.returnCaseId || returnIds.has(task.returnCaseId)));
  const visibleTasks = role === 'warehouse' ? tasks.filter(task => task.warehouseId && (warehouseId === 'all' || task.warehouseId === warehouseId)) : tasks;
  const taskIds = new Set(visibleTasks.map(task => task.id));
  const entityIds = new Set(visibleTasks.flatMap(task => [task.id, task.orderId, task.returnCaseId].filter(Boolean) as string[]));
  if (role !== 'warehouse') {
    const scopedOrders = state.orders.filter(order => entityIds.has(order.id));
    for (const order of scopedOrders) {
      for (const mapping of state.skuMappings.filter(item => item.storeId === order.storeId && order.items.some(line => line.ozonSku === item.ozonSku))) entityIds.add(mapping.id);
      for (const inventory of state.inventory.filter(item => order.items.some(line => line.productId === item.productId) && (warehouseId === 'all' || item.warehouseId === warehouseId))) entityIds.add(inventory.id);
    }
  }
  const logs = state.auditLogs.filter(log => role === 'warehouse' ? (log.entityType === 'task' ? taskIds.has(log.entityId) : entityIds.has(log.entityId)) : entityIds.has(log.entityId) || (storeId === 'all' && warehouseId === 'all'));
  const retry = async (taskId: string) => { const result = await runCommand({ type: 'RETRY_TASK', taskId }); setResultMessage({ ok: result.ok, text: result.message }); };
  return <div className="page-stack">
    {resultMessage ? <div className={resultMessage.ok ? 'success-note' : 'form-error'} role="status"><span>{resultMessage.text}</span><button onClick={() => setResultMessage(undefined)}>关闭</button></div> : null}
    <section className="panel"><div className="panel__head"><div><h2>异常处理与审计</h2><p>仅显示当前店铺和云仓范围内的任务。</p></div><div className="tabs"><button className={tab === 'exceptions' ? 'active' : ''} onClick={() => setTab('exceptions')}>异常任务</button><button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>操作日志</button></div></div>
      {tab === 'exceptions' ? <div className="exception-grid">{visibleTasks.filter(task => task.status === 'failed').map(task => {
        const mapping = task.failureCode === 'mapping';
        const stock = task.failureCode === 'stock';
        return <article className="exception-card" key={task.id}><header><div><small>{KIND_LABEL[task.kind]} · {task.id}</small><h3>{task.errorReason ?? (mapping ? 'SKU 未映射' : task.summary)}</h3></div><StatusTag tone="danger">执行失败</StatusTag></header><dl><div><dt>失败原因</dt><dd>{task.errorReason ?? task.summary}</dd></div><div><dt>建议操作</dt><dd>{task.recommendation ?? (mapping ? '请先完成 SKU 映射' : stock ? '请先补充可售库存' : '请检查配置后处理')}</dd></div><div><dt>最后尝试</dt><dd>{task.lastAttemptAt} · 已重试 {task.retryCount} 次</dd></div><div><dt>请求摘要</dt><dd>请求摘要：{task.requestSummary ?? `${KIND_LABEL[task.kind]} · ${task.orderId ?? task.returnCaseId ?? task.id}`}</dd></div></dl><div className="exception-card__actions">{mapping ? <a className="button button--secondary" href="#/sku-mapping">前往 SKU 映射</a> : stock ? <a className="button button--secondary" href="#/inventory">前往库存中心</a> : task.retryable && role !== 'warehouse' ? <button className="button button--primary" onClick={() => void retry(task.id)}>重新执行</button> : <span className="muted">当前任务不可重试</span>}</div></article>;
      })}</div> : <div className="audit-list">{logs.map(log => <article key={log.id}><StatusTag tone="info">{log.action}</StatusTag><div><strong>{log.detail}</strong><p>{log.actor} · {log.createdAt}</p></div></article>)}</div>}
    </section>
  </div>;
}
