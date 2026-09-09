import React, { useMemo, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { Drawer } from '../components/Drawer';
import { StatusTag } from '../components/StatusTag';
import type { ReturnCase } from '../domain/types';
import { useDemo } from '../state/DemoContext';
import type { PageProps } from './types';

const STATUS: Record<ReturnCase['status'], string> = { requested: '待审核', approved: '已同意', rejected: '已拒绝', 'in-transit': '退回途中', received: '已签收', inspected: '已验货' };
const ROLE_ACTOR = { admin: '管理员', operator: '运营人员', warehouse: '仓库人员' } as const;

export function ReturnsPage({ storeId, warehouseId, role }: PageProps) {
  const { state, runCommand } = useDemo();
  const [selectedId, setSelectedId] = useState<string>();
  const [returnWarehouseId, setReturnWarehouseId] = useState('');
  const [decision, setDecision] = useState<'approved' | 'rejected'>();
  const [message, setMessage] = useState('');
  const rows = state.returns.filter(item => (storeId === 'all' || item.storeId === storeId) && (warehouseId === 'all' || item.returnWarehouseId === warehouseId));
  const selected = state.returns.find(item => item.id === selectedId);
  const product = selected ? state.products.find(item => item.id === selected.productId) : undefined;
  const eligible = useMemo(() => selected ? state.warehouses.filter(warehouse => warehouse.connected && warehouse.capabilities.includes('rfbs-return') && state.inventory.some(record => record.productId === selected.productId && record.warehouseId === warehouse.id)) : [], [selected, state.inventory, state.warehouses]);
  const act = async (type: 'RECEIVE_RETURN' | 'INSPECT_RETURN', condition?: 'sellable' | 'damaged') => {
    if (!selected) return;
    const command = type === 'RECEIVE_RETURN' ? { type, returnCaseId: selected.id, actor: ROLE_ACTOR[role] } as const : { type, returnCaseId: selected.id, condition: condition!, actor: ROLE_ACTOR[role] } as const;
    const result = await runCommand(command);
    setMessage(result.ok ? (type === 'RECEIVE_RETURN' ? '退货已签收' : condition === 'sellable' ? '验货完成，已恢复可售库存' : '验货完成，已计入残次库存') : `操作失败：${result.message}`);
  };
  const confirmDecision = async () => {
    if (!selected || !decision) return;
    const result = await runCommand({ type: 'DECIDE_RETURN', returnCaseId: selected.id, decision, warehouseId: decision === 'approved' ? returnWarehouseId : undefined, actor: role === 'admin' ? '管理员' : '运营人员' });
    setDecision(undefined); setMessage(result.ok ? (decision === 'approved' ? '退货申请已同意' : '退货申请已拒绝') : `审核失败：${result.message}`);
  };
  const columns: DataTableColumn<ReturnCase>[] = [
    { id: 'id', header: '退货单', cell: row => <span className="sku-pair"><strong>{row.id}</strong><small>{state.orders.find(item => item.id === row.orderId)?.displayNumber}</small></span> },
    { id: 'product', header: '商品', cell: row => state.products.find(item => item.id === row.productId)?.name },
    { id: 'reason', header: '退货原因', cell: row => row.reason },
    { id: 'warehouse', header: '退回云仓', cell: row => state.warehouses.find(item => item.id === row.returnWarehouseId)?.name ?? '待选择' },
    { id: 'status', header: '状态', cell: row => <StatusTag tone={row.status === 'rejected' ? 'danger' : row.status === 'inspected' ? 'success' : 'info'}>{STATUS[row.status]}</StatusTag> },
    { id: 'action', header: '操作', align: 'end', cell: row => <button className="button button--secondary" aria-label={`查看 ${row.id}`} onClick={() => { setSelectedId(row.id); setReturnWarehouseId(row.returnWarehouseId ?? ''); }}>查看</button> },
  ];
  const footer = selected ? <>{role !== 'warehouse' && selected.status === 'requested' ? <><button className="button button--danger" onClick={() => setDecision('rejected')}>拒绝退货</button><button className="button button--primary" disabled={!returnWarehouseId} onClick={() => setDecision('approved')}>同意退货</button></> : null}{selected.status === 'approved' || selected.status === 'in-transit' ? <button className="button button--primary" onClick={() => void act('RECEIVE_RETURN')}>确认签收</button> : null}{selected.status === 'received' ? <><button className="button button--secondary" onClick={() => void act('INSPECT_RETURN', 'damaged')}>验货：计入残次</button><button className="button button--primary" onClick={() => void act('INSPECT_RETURN', 'sellable')}>验货：恢复可售</button></> : null}</> : undefined;
  return <div className="page-stack">{message ? <div className="success-note" role="status"><span>{message}</span><button onClick={() => setMessage('')}>关闭</button></div> : null}<DataTable caption="rFBS 退货列表" rows={rows} columns={columns} rowKey={row => row.id} toolbar={<div className="catalog-toolbar"><strong>当前范围 {rows.length} 笔退货</strong><span>审核、签收和验货会同步共享库存与日志</span></div>} />
  <Drawer open={Boolean(selected)} title={selected ? `退货 ${selected.id}` : '退货详情'} onClose={() => setSelectedId(undefined)} description="全部为虚构演示退货数据" footer={footer}>{selected ? <><div className="detail-grid"><span>商品<strong>{product?.name}<br />{product?.ozonSku}</strong></span><span>申请原因<strong>{selected.reason}</strong></span><span>申请时间<strong>{selected.requestedAt} ({selected.timezone})</strong></span><span>当前状态<strong>{STATUS[selected.status]}</strong></span></div><h3>举证材料</h3><div className="evidence-list">{selected.evidence.map(item => <span key={item}>演示图片 · {item}</span>)}</div>{role !== 'warehouse' && selected.status === 'requested' ? <label className="form-field">退回云仓<select aria-label="退回云仓" value={returnWarehouseId} onChange={e => setReturnWarehouseId(e.target.value)}><option value="">请选择已连接且支持退货的云仓</option>{eligible.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : null}<h3>物流节点</h3><p className="empty-text">申请已提交 → 审核 → 云仓签收 → 验货回传</p></> : null}</Drawer>
  <ConfirmModal open={Boolean(decision)} title={decision === 'approved' ? '确认同意退货' : '确认拒绝退货'} description={decision === 'approved' ? `退货将退回${eligible.find(item => item.id === returnWarehouseId)?.name ?? '所选云仓'}并创建签收任务。` : '拒绝后该退货流程将结束。'} confirmLabel={decision === 'approved' ? '确认同意' : '确认拒绝'} tone={decision === 'approved' ? 'primary' : 'danger'} onCancel={() => setDecision(undefined)} onConfirm={() => void confirmDecision()} /></div>;
}
