import { Drawer } from '../components/Drawer';
import React, { useMemo, useState, useEffect } from 'react';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { StatusTag } from '../components/StatusTag';
import type { SkuMapping } from '../domain/types';
import { useDemo } from '../state/DemoContext';
import type { PageProps } from './types';

const SAMPLE_SKU = 'CW-9008';

export function SkuMappingPage({ storeId, warehouseId, role }: PageProps) {
  const { state, runCommand } = useDemo();
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string>();
  const [warehouseSku, setWarehouseSku] = useState(SAMPLE_SKU);
  const [previewMappingId, setPreviewMappingId] = useState<string>();
  const [message, setMessage] = useState('');
  const rows = useMemo(() => state.skuMappings.filter((mapping) =>
    (storeId === 'all' || mapping.storeId === storeId) &&
    (warehouseId === 'all' || mapping.warehouseId === warehouseId || (mapping.status === 'unmapped' && state.stores.find(item => item.id === mapping.storeId)?.preferredWarehouseId === warehouseId)) &&
    (status === 'all' || mapping.status === status) &&
    (!query || `${mapping.ozonSku} ${mapping.warehouseSku ?? ''}`.toLowerCase().includes(query.toLowerCase())),
  ), [query, state.skuMappings, state.stores, status, storeId, warehouseId]);
  useEffect(() => { setEditingId(undefined); setPreviewMappingId(undefined); }, [storeId, warehouseId, role]);
  const editing = state.skuMappings.find((item) => item.id === editingId);
  const visibleMissing = rows.filter((item) => item.status === 'unmapped');
  const saveAndRetry = async () => {
    if (!editing) return;
    const order = state.orders.find((item) => item.storeId === editing.storeId && item.exceptionReason === 'mapping' && item.items.some((part) => part.ozonSku === editing.ozonSku));
    const selectedWarehouse = warehouseId !== 'all' ? warehouseId : state.stores.find((item) => item.id === editing.storeId)?.preferredWarehouseId;
    if (!selectedWarehouse) { setMessage('未找到可用云仓'); return; }
    const repaired = await runCommand({ type: 'REPAIR_SKU_MAPPING', mappingId: editing.id, warehouseSku, warehouseId: selectedWarehouse });
    if (!repaired.ok) { setMessage(`保存失败：${repaired.message}`); return; }
    if (order) {
      const dispatched = await runCommand({ type: 'DISPATCH_ORDER', orderId: order.id });
      if (!dispatched.ok) { setMessage(`映射已保存，订单重试失败：${dispatched.message}`); return; }
      setMessage('订单已恢复履约');
    } else setMessage('映射已保存');
    setEditingId(undefined);
  };
  const applySample = async () => {
    const missing = rows.find((item) => item.id === previewMappingId && item.status === 'unmapped');
    if (!missing) { setMessage('当前筛选范围没有待导入映射'); setPreviewMappingId(undefined); return; }
    const target = warehouseId !== 'all' ? warehouseId : state.stores.find((item) => item.id === missing.storeId)?.preferredWarehouseId;
    if (!target) return;
    const result = await runCommand({ type: 'REPAIR_SKU_MAPPING', mappingId: missing.id, warehouseSku: SAMPLE_SKU, warehouseId: target });
    setMessage(result.ok ? '已应用 1 条演示映射' : `导入失败：${result.message}`); setPreviewMappingId(undefined);
  };
  const columns: DataTableColumn<SkuMapping>[] = [
    { id: 'store', header: '店铺', cell: row => state.stores.find(item => item.id === row.storeId)?.name },
    { id: 'ozon', header: 'Ozon SKU', cell: row => row.ozonSku },
    { id: 'warehouseSku', header: '云仓货号', cell: row => row.warehouseSku ?? '缺失' },
    { id: 'warehouse', header: '云仓', cell: row => state.warehouses.find(item => item.id === row.warehouseId)?.name ?? '待选择' },
    { id: 'status', header: '状态', cell: row => <StatusTag tone={row.status === 'mapped' ? 'success' : 'danger'}>{row.status === 'mapped' ? '已映射' : '缺失映射'}</StatusTag> },
    { id: 'action', header: '操作', align: 'end', cell: row => <button className="button button--secondary" type="button" onClick={() => { setEditingId(row.id); setWarehouseSku(row.warehouseSku ?? SAMPLE_SKU); }}>{row.status === 'unmapped' ? '建立映射' : '编辑映射'}</button> },
  ];
  return <div className="page-stack">{message ? <div className="success-note" role="status"><span>{message}</span><button onClick={() => setMessage('')}>关闭</button></div> : null}<DataTable caption="SKU 映射列表" rows={rows} columns={columns} rowKey={row => row.id} toolbar={<div className="catalog-toolbar"><label>状态<select aria-label="映射状态" value={status} onChange={e => setStatus(e.target.value)}><option value="all">全部</option><option value="unmapped">缺失映射</option><option value="mapped">已映射</option></select></label><label>搜索<input aria-label="搜索 SKU" value={query} onChange={e => setQuery(e.target.value)} /></label><button className="button button--primary" type="button" disabled={visibleMissing.length === 0} onClick={() => setPreviewMappingId(visibleMissing[0]?.id)}>批量导入</button><span>缺失 {visibleMissing.length} 条</span></div>} />
  {editing ? <Drawer open title="建立 SKU 映射" onClose={() => setEditingId(undefined)}><h2>建立映射</h2><p>{editing.ozonSku} 将写入共享映射并重试受阻订单。</p><label>云仓货号<select aria-label="云仓货号" value={warehouseSku} onChange={e => setWarehouseSku(e.target.value)}><option value="CW-9008">CW-9008</option><option value="CW-9012">CW-9012</option></select></label><div className="confirm-modal__actions"><button className="button button--secondary" onClick={() => setEditingId(undefined)}>取消</button><button className="button button--primary" onClick={() => void saveAndRetry()}>保存并重试</button></div></Drawer> : null}
  {previewMappingId ? <Drawer open title="批量导入预览" onClose={() => setPreviewMappingId(undefined)}><h2>批量导入预览</h2><p>演示样例：当前范围首条缺失 SKU → <strong>{SAMPLE_SKU}</strong>。应用前不会修改数据。</p><div className="confirm-modal__actions"><button className="button button--secondary" onClick={() => setPreviewMappingId(undefined)}>取消</button><button className="button button--primary" onClick={() => void applySample()}>应用 1 条映射</button></div></Drawer> : null}</div>;
}
