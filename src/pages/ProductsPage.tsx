import React, { useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { Drawer } from '../components/Drawer';
import { StatusTag } from '../components/StatusTag';
import type { Product } from '../domain/types';
import { ozonAvailable } from '../domain/routing';
import { useDemo } from '../state/DemoContext';
import { rub } from './pageUtils';
import type { PageProps } from './types';

export function ProductsPage({ storeId, warehouseId }: PageProps) {
  const { state, runCommand } = useDemo();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<Product>();
  const productIds = useMemo(() => storeId === 'all' ? undefined : new Set(state.skuMappings.filter((item) => item.storeId === storeId).map((item) => item.ozonSku)), [state.skuMappings, storeId]);
  const rows = state.products.filter((product) => (!productIds || productIds.has(product.ozonSku))
    && (warehouseId === 'all' || state.inventory.some((record) => record.productId === product.id && record.warehouseId === warehouseId))
    && (!query || `${product.name} ${product.ozonSku} ${product.merchantSku}`.toLowerCase().includes(query.toLowerCase()))
    && (status === 'all' || (status === 'active') === product.active));
  const columns: DataTableColumn<Product>[] = [
    { id: 'product', header: '商品', cell: (product) => <button className="product-cell" type="button" onClick={() => setSelected(product)}><span className="product-thumb" style={{ background: product.display.color }}>{product.display.initials}</span><span><strong>{product.name}</strong><small>{product.category}</small></span></button> },
    { id: 'sku', header: 'SKU', cell: (product) => <span className="sku-pair"><strong>{product.merchantSku}</strong><small>{product.ozonSku}</small></span> },
    { id: 'price', header: '售价', align: 'end', cell: (product) => rub(product.priceRub) },
    { id: 'status', header: '状态', cell: (product) => <StatusTag tone={product.active ? 'success' : 'neutral'}>{product.active ? '销售中' : '已停用'}</StatusTag> },
    { id: 'action', header: '操作', align: 'end', cell: (product) => <button className="button button--secondary" type="button" onClick={() => void runCommand({ type: 'SET_PRODUCT_ACTIVE', productId: product.id, active: !product.active })}>{product.active ? '停用商品' : '启用商品'}</button> },
  ];
  return <div className="page-stack">
    <DataTable caption="商品列表" columns={columns} rows={rows.slice(0, 20)} rowKey={(row) => row.id} emptyText="没有符合条件的商品" toolbar={<div className="catalog-toolbar"><label>搜索 SKU 或名称<input aria-label="搜索 SKU 或名称" value={query} onChange={(event) => setQuery(event.target.value)} /></label><label>商品状态<select aria-label="商品状态" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option><option value="active">销售中</option><option value="inactive">已停用</option></select></label><span>显示 {Math.min(rows.length, 20)} / {rows.length} 个商品</span></div>} />
    <Drawer open={Boolean(selected)} title={selected?.name ?? '商品详情'} onClose={() => setSelected(undefined)} description="虚构商品资料与多仓库存">
      {selected ? <><div className="product-hero"><span className="product-thumb product-thumb--large" style={{ background: selected.display.color }}>{selected.display.initials}</span><div><StatusTag tone={selected.active ? 'success' : 'neutral'}>{selected.active ? '销售中' : '已停用'}</StatusTag><p>{selected.category}</p></div></div><div className="detail-grid"><span>商家 SKU<strong>{selected.merchantSku}</strong></span><span>Ozon SKU<strong>{selected.ozonSku}</strong></span><span>日常售价<strong>{rub(selected.priceRub)}</strong></span><span>活动价<strong>{selected.promotionPriceRub ? rub(selected.promotionPriceRub) : '未设置'}</strong></span></div><h3>多仓库存</h3>{state.inventory.filter((item) => item.productId === selected.id && (warehouseId === 'all' || item.warehouseId === warehouseId)).map((item) => <div className="stock-line" key={item.id}><strong>{state.warehouses.find((warehouse) => warehouse.id === item.warehouseId)?.name}</strong><span>可用 {item.available} · 安全库存 {item.safetyStock} · Ozon {ozonAvailable(item)}</span></div>)}</> : null}
    </Drawer>
  </div>;
}
