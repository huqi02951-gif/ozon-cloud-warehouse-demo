import React, { useState } from 'react';
import { DataTable } from '../components/DataTable';
import { Drawer } from '../components/Drawer';
import type { DemoLabel } from '../integrations/ozonAdapter';
import { useDemo } from '../state/DemoContext';
import type { PageProps } from './types';
import { Status, visibleOrders } from './pageUtils';

export function LabelsPage({storeId,warehouseId}:PageProps){
 const {state,runCommand}=useDemo(); const [label,setLabel]=useState<DemoLabel>(); const [printed,setPrinted]=useState(false); const [busy,setBusy]=useState(false); const [batchSummary,setBatchSummary]=useState<string>();
 const rows=visibleOrders(state.orders,storeId,warehouseId).filter(o=>o.fulfillmentType==='FBS').slice(0,18);
 const preview=async(id:string)=>{setBusy(true);const r=await runCommand({type:'GET_LABEL',orderId:id});if(r.ok){setLabel(r.data as DemoLabel);setPrinted(false)}setBusy(false)};
 const batch=async()=>{setBusy(true);setBatchSummary(undefined);const results=await Promise.all(rows.map(o=>runCommand({type:'GET_LABEL',orderId:o.id})));const succeeded=results.filter(r=>r.ok).length;setBatchSummary(`批量获取完成：成功 ${succeeded}，失败 ${results.length-succeeded}`);setBusy(false)};
 return <div className="page-stack"><div className="action-bar"><div><strong>Ozon 演示面单</strong><p>获取、预览并随出库任务交付云仓</p></div><button className="button button--primary" disabled={busy} onClick={()=>void batch()}>{busy?'正在批量获取':'批量获取面单'}</button></div>{batchSummary&&<p className="success-note">{batchSummary}</p>}<DataTable caption="面单列表" rows={rows} rowKey={o=>o.id} columns={[
  {id:'order',header:'订单',cell:o=><strong>{o.displayNumber}</strong>},{id:'warehouse',header:'打印云仓',cell:o=>state.warehouses.find(w=>w.id===o.assignedWarehouseId)?.name??'待分仓'},{id:'status',header:'订单状态',cell:o=><Status status={o.status}/>},{id:'action',header:'操作',align:'end',cell:o=><button className="button button--secondary" aria-label={`预览 ${o.displayNumber}`} onClick={()=>void preview(o.id)}>预览面单</button>}]} />
 <Drawer open={!!label} title="演示面单预览" onClose={()=>setLabel(undefined)} footer={<button className="button button--primary" onClick={()=>setPrinted(true)}>模拟打印</button>}><div className="label-preview"><span className="label-watermark">DEMO / 演示数据</span><strong>云仓履约 · 演示物流面单</strong><p>订单：{state.orders.find(o=>o.id===label?.orderId)?.displayNumber}</p><div className="fake-barcode" aria-label="非真实条码"/><small>仅用于产品演示，不可用于真实发货</small></div>{printed?<p className="success-note">面单已进入模拟打印队列</p>:null}</Drawer></div>;
}
