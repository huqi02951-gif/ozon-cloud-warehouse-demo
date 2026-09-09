import { Drawer } from '../components/Drawer';
import React, { useMemo, useState, useEffect } from 'react';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { StatusTag } from '../components/StatusTag';
import type { InventoryRecord } from '../domain/types';
import { ozonAvailable } from '../domain/routing';
import { useDemo } from '../state/DemoContext';
import type { PageProps } from './types';

export function InventoryPage({ storeId, warehouseId, role }: PageProps) {
  const { state, runCommand } = useDemo();
  const [editing, setEditing] = useState<InventoryRecord>();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const allowedProducts = useMemo(() => storeId === 'all' ? undefined : new Set(state.skuMappings.filter((item) => item.storeId === storeId && item.status === 'mapped').map((item) => item.ozonSku)), [state.skuMappings, storeId]);
  const rows = state.inventory.filter((record) => (warehouseId === 'all' || record.warehouseId === warehouseId) && (!allowedProducts || allowedProducts.has(state.products.find((product) => product.id === record.productId)?.ozonSku ?? '')));
  useEffect(() => { setEditing(undefined); }, [storeId, warehouseId, role]);
  const canEdit = role !== 'warehouse';
  const sync = async (ids: string[]) => { const response = await runCommand({ type: 'SYNC_INVENTORY', inventoryIds: ids }); setResult(response.ok ? '已同步至Ozon' : `同步失败：${response.message}`); };
  const save = async () => { if (!canEdit || !editing || !rows.some(row => row.id === editing.id)) return; const number = Number(value); if (!/^\d+$/.test(value) || !Number.isSafeInteger(number)) { setError('请输入非负整数'); return; } const response = await runCommand({ type: 'SET_SAFETY_STOCK', inventoryId: editing!.id, safetyStock: number }); if (!response.ok) { setError(`保存失败：${response.message}`); return; } await sync([editing!.id]); setEditing(undefined); };
  const columns: DataTableColumn<InventoryRecord>[] = [
    { id: 'product', header: '商品 / SKU', cell: (row) => { const product = state.products.find((item) => item.id === row.productId)!; return <span className="sku-pair"><strong>{product.name}</strong><small>{product.merchantSku}</small></span>; } },
    { id: 'warehouse', header: '云仓', cell: (row) => state.warehouses.find((item) => item.id === row.warehouseId)?.name },
    { id: 'composition', header: '库存构成', cell: (row) => <span className="stock-composition">在库 {row.onHand} · 锁定 {row.reserved} · 残次 {row.damaged} · 在途 {row.inTransit}</span> },
    { id: 'available', header: '可用', align: 'end', cell: (row) => row.available },
    { id: 'safety', header: '安全库存', align: 'end', cell: (row) => row.safetyStock },
    { id: 'ozon', header: 'Ozon 可售', align: 'end', cell: (row) => <strong data-testid="ozon-stock">{ozonAvailable(row)}</strong> },
    { id: 'status', header: '状态', cell: (row) => <StatusTag tone={row.available - row.safetyStock <= 3 ? 'warning' : 'success'}>{row.available - row.safetyStock <= 3 ? '库存预警' : '库存正常'}</StatusTag> },
    ...(canEdit ? [{ id: 'action', header: '操作', align: 'end' as const, cell: (row: InventoryRecord) => <button className="button button--secondary" type="button" onClick={() => { setEditing(row); setValue(String(row.safetyStock)); setError(''); }}>编辑安全库存</button> }] : []),
  ];
  return <div className="page-stack">{result ? <div className="success-note" role="status"><span>{result}</span><button type="button" onClick={() => setResult('')}>关闭</button></div> : null}<DataTable caption="多仓库存列表" columns={columns} rows={rows} rowKey={(row) => row.id} toolbar={<div className="catalog-toolbar"><strong>可见库存 {rows.length} 条</strong>{canEdit ? <button className="button button--primary" type="button" onClick={() => void sync(rows.map((row) => row.id))}>同步可见库存</button> : <span>仓库人员仅可查看库存</span>}</div>} />
    {editing ? <Drawer open title="编辑安全库存" onClose={() => setEditing(undefined)}><h2>编辑安全库存</h2><p>Ozon 可售库存将按“可用库存 − 安全库存”计算，最低为 0。</p><label>安全库存<input aria-label="安全库存" inputMode="numeric" value={value} onChange={(event) => { setValue(event.target.value); setError(''); }} /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="confirm-modal__actions"><button className="button button--secondary" type="button" onClick={() => setEditing(undefined)}>取消</button><button className="button button--primary" type="button" onClick={() => void save()}>保存并同步</button></div></Drawer> : null}
  </div>;
}
