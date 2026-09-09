import React, { useState } from 'react';
import { DataTable } from '../components/DataTable';
import { useDemo } from '../state/DemoContext';
import type { PageProps } from './types';
import { NEXT_STATUS, Status, STATUS_LABEL, visibleOrders } from './pageUtils';

export function FulfillmentPage({storeId,warehouseId,role}:PageProps){
 const {state,runCommand}=useDemo(); const [manual,setManual]=useState<Record<string,string>>({}); const [busy,setBusy]=useState(false); const [summary,setSummary]=useState<string>();
 const rows=visibleOrders(state.orders,storeId,warehouseId).filter(o=>!['completed','cancelled'].includes(o.status));
 const office=role!=='warehouse';
 const doDispatch=(id:string)=>void runCommand({type:'DISPATCH_ORDER',orderId:id,...(manual[id]?{manualOverride:true as const,warehouseId:manual[id]}:{manualOverride:false as const})});
 const batch=async()=>{setBusy(true);setSummary(undefined);let success=0,failed=0,noop=0;const candidates=rows.filter(o=>['pending-routing','pending-dispatch','exception'].includes(o.status));for(const order of candidates){const result=await runCommand({type:'DISPATCH_ORDER',orderId:order.id,manualOverride:false});if(!result.ok)failed+=1;else if(result.message.includes('已存在'))noop+=1;else success+=1;}setSummary(`批量处理完成：成功 ${success}，失败 ${failed}，无需处理 ${noop}`);setBusy(false)};
 return <div className="page-stack"><div className="alert-strip"><strong>截单提醒</strong><span>请优先处理红色预警订单；库存不足时系统会阻止下发。</span>{office&&<button className="button button--primary" disabled={busy} onClick={()=>void batch()}>{busy?'正在批量下发':'批量下发待处理订单'}</button>}</div>{summary&&<p className="success-note">{summary}</p>}<DataTable caption="出库履约任务" rows={rows} rowKey={o=>o.id} columns={[
  {id:'order',header:'订单',cell:o=><strong>{o.displayNumber}</strong>},{id:'route',header:'分仓',cell:o=>office&&['pending-routing','pending-dispatch','exception'].includes(o.status)?<select aria-label={`手工改仓 ${o.displayNumber}`} value={manual[o.id]??o.assignedWarehouseId??''} onChange={e=>setManual({...manual,[o.id]:e.target.value})}><option value="">自动分仓</option>{state.warehouses.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>:state.warehouses.find(w=>w.id===o.assignedWarehouseId)?.name??'自动选择'},
  {id:'status',header:'进度',cell:o=><Status status={o.status}/>},{id:'action',header:'操作',align:'end',cell:o=>{const next=NEXT_STATUS[o.status];return <div className="row-actions">{office&&['pending-routing','pending-dispatch','exception'].includes(o.status)&&<button className="button button--primary" onClick={()=>doDispatch(o.id)}>{manual[o.id]?'校验并改仓下发':'自动路由并下发云仓'}</button>}{next&&<button className="button button--secondary" aria-label={`${STATUS_LABEL[o.status]} ${o.displayNumber} 推进`} onClick={()=>void runCommand({type:'SET_ORDER_STATUS',orderId:o.id,status:next,warehouseStatus:next})}>推进至{STATUS_LABEL[next]}</button>}</div>}}]} /></div>;
}
