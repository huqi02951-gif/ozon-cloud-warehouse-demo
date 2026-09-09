import React, { useEffect, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { DataTable } from '../components/DataTable';
import { Drawer } from '../components/Drawer';
import { Timeline } from '../components/Timeline';
import type { Order } from '../domain/types';
import { useDemo } from '../state/DemoContext';
import type { DemoLabel } from '../integrations/ozonAdapter';
import type { PageProps } from './types';
import { rub, Status, STATUS_LABEL, visibleOrders, zonedDate } from './pageUtils';

export function OrdersPage({ storeId, warehouseId, role }: PageProps) {
  const { state, runCommand } = useDemo();
  const [selectedId, setSelectedId] = useState<string>();
  const [tab, setTab] = useState<'all'|'pending'|'exception'>('all');
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState<DemoLabel>();
  const [cancel, setCancel] = useState(false);
  const [pullFeedback, setPullFeedback] = useState<string>();
  const selected = state.orders.find(o => o.id === selectedId);
  let rows = visibleOrders(state.orders, storeId, warehouseId);
  if (tab === 'pending') rows = rows.filter(o => ['pulled','pending-validation','pending-routing','pending-dispatch'].includes(o.status));
  if (tab === 'exception') rows = rows.filter(o => o.status === 'exception');
  const dispatch = async (order: Order) => { setBusy(true); const result = await runCommand({type:'DISPATCH_ORDER', orderId:order.id}); if (result.ok) { setLabel({ orderId: order.id, previewUrl: '', watermark: 'DEMO / 演示数据', source: 'mock' }); } setBusy(false); };
  const canOperate = role !== 'warehouse';
  useEffect(() => {
    const openLinkedOrder = () => {
      const id = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('order');
      const inScope = visibleOrders(state.orders, storeId, warehouseId).some(order => order.id === id);
      setSelectedId(inScope && id ? id : undefined);
    };
    openLinkedOrder();
    window.addEventListener('hashchange', openLinkedOrder);
    return () => window.removeEventListener('hashchange', openLinkedOrder);
  }, [storeId, warehouseId]);
  const pullVisible = () => {
    const candidates = visibleOrders(state.orders, storeId, warehouseId).filter(order => order.status === 'pulled');
    candidates.forEach(order => void runCommand({ type: 'SET_ORDER_STATUS', orderId: order.id, status: 'pending-validation' }));
    setPullFeedback(`当前筛选范围已拉取 ${candidates.length} 笔订单`);
  };
  return <div className="page-stack">
    <div className="action-bar"><div className="tabs">{([['all','全部订单'],['pending','待处理'],['exception','异常']] as const).map(([id,text]) => <button className={tab===id?'active':''} onClick={()=>setTab(id)} key={id}>{text}</button>)}</div>{canOperate && <button className="button button--primary" onClick={pullVisible}>模拟拉取新订单</button>}</div>
    {pullFeedback && <p className="success-note">{pullFeedback}</p>}
    <DataTable caption="订单列表" rows={rows} rowKey={o=>o.id} columns={[
      {id:'order',header:'订单',cell:o=><button className="text-button" aria-label={`查看 ${o.displayNumber}`} onClick={()=>setSelectedId(o.id)}><strong>{o.displayNumber}</strong><small>{o.id}</small></button>},
      {id:'store',header:'店铺',cell:o=>state.stores.find(s=>s.id===o.storeId)?.name},
      {id:'items',header:'商品',cell:o=><span>{o.items[0].name} × {o.items[0].quantity}</span>},
      {id:'amount',header:'金额',align:'end',cell:o=>rub(o.totalRub)},
      {id:'cutoff',header:'截单时间',cell:o=><span className="cutoff">{zonedDate(o.cutoffAt)}</span>},
      {id:'status',header:'状态',cell:o=><Status status={o.status}/>}]} />
    <Drawer open={!!selected} title={selected?.displayNumber ?? ''} description="订单、履约与接口记录" onClose={()=>setSelectedId(undefined)} footer={selected && canOperate ? <><button className="button button--secondary" disabled={['shipped','pending-ozon-sync','completed','cancelled'].includes(selected.status)} onClick={()=>setCancel(true)}>取消订单</button>{selected.status === 'pending-validation' && <button className="button button--primary" onClick={()=>void runCommand({type:'SET_ORDER_STATUS', orderId:selected.id, status:'pending-routing'})}>校验并继续分仓</button>}{['pending-routing','pending-dispatch','exception'].includes(selected.status)&&<button className="button button--primary" disabled={busy} onClick={()=>void dispatch(selected)}>{busy?'正在下发':'获取面单并下发云仓'}</button>}</>:undefined}>
      {selected && <><div className="detail-grid"><span>收件信息<strong>{selected.recipient.name} · {selected.recipient.phoneMasked}</strong></span><span>配送地址<strong>{selected.recipient.city} · {selected.recipient.addressMasked}</strong></span><span>平台原始状态<strong>{selected.platformStatus}</strong></span><span>云仓<strong>{state.warehouses.find(w=>w.id===selected.assignedWarehouseId)?.name ?? '待分仓'}</strong></span></div>{label && label.orderId===selected.id?<div className="success-note"><strong>演示面单</strong><span>{label.watermark}</span></div>:null}<h3>状态时间线</h3><Timeline items={[{id:'created',title:'订单已拉取',timestamp:selected.createdAt,tone:'info'},...state.auditLogs.filter(a=>a.entityId===selected.id).map(a=>({id:a.id,title:a.detail,timestamp:a.createdAt,tone:'success' as const})),{id:'now',title:STATUS_LABEL[selected.status],tone:selected.status==='exception'?'danger':'info'}]}/>{state.auditLogs.some(a=>a.entityId===selected.id&&a.action==='ORDER_DISPATCHED')?<p className="success-note">任务已写入操作日志</p>:null}</>}
    </Drawer>
    <ConfirmModal open={cancel} title="确认取消订单" description="取消后该演示订单不能继续履约。" confirmLabel="确认取消" onCancel={()=>setCancel(false)} onConfirm={()=>{if(selected) void runCommand({type:'SET_ORDER_STATUS',orderId:selected.id,status:'cancelled'});setCancel(false);}} />
  </div>;
}
