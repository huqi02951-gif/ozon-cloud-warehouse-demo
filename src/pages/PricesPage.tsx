import React, { useEffect, useMemo, useState } from 'react';
import { DataTable, type DataTableColumn } from '../components/DataTable';
import { StatusTag } from '../components/StatusTag';
import type { Product } from '../domain/types';
import { useDemo } from '../state/DemoContext';
import { rub } from './pageUtils';
import type { PageProps } from './types';

export function PricesPage({ storeId, warehouseId }: PageProps) {
  const { state, runCommand } = useDemo();
  const [query, setQuery] = useState(''); const [selected, setSelected] = useState<string[]>([]); const [mode, setMode] = useState('percent'); const [value, setValue] = useState(''); const [promotion, setPromotion] = useState(false); const [error, setError] = useState(''); const [result, setResult] = useState('');
  const allowed = useMemo(() => storeId === 'all' ? undefined : new Set(state.skuMappings.filter((item) => item.storeId === storeId).map((item) => item.ozonSku)), [state.skuMappings, storeId]);
  const visible = state.products.filter((product) => (!allowed || allowed.has(product.ozonSku)) && (warehouseId === 'all' || state.inventory.some((record) => record.productId === product.id && record.warehouseId === warehouseId)) && (!query || `${product.name} ${product.merchantSku} ${product.ozonSku}`.toLowerCase().includes(query.toLowerCase()))).slice(0, 20);
  const visibleIds = visible.map((item) => item.id).join(',');
  useEffect(() => {
    const inScope = new Set(visibleIds ? visibleIds.split(',') : []);
    setSelected((current) => current.filter((id) => inScope.has(id)));
  }, [visibleIds]);
  const selectedTargets = visible.filter((item) => selected.includes(item.id));
  const apply = async () => {
    const amount = Number(value);
    if (mode === 'fixed' && (!Number.isSafeInteger(amount) || amount < 1)) { setError('固定价格须为至少 1 卢布的整数'); return; }
    if (mode === 'percent' && (!Number.isFinite(amount) || amount <= 0 || amount > 100)) { setError('百分比须大于 0 且不超过 100'); return; }
    const target = selectedTargets.length ? selectedTargets : visible;
    if (!target.length) { setError('当前范围没有可调价的商品'); return; }
    const updates = target.map((item) => {
      const next = mode === 'fixed' ? amount : Math.round(item.priceRub * (1 + amount / 100));
      return promotion ? { productId: item.id, priceRub: item.priceRub, promotionPriceRub: Math.min(next, item.priceRub - 1) } : { productId: item.id, priceRub: next, promotionPriceRub: item.promotionPriceRub && item.promotionPriceRub < next ? item.promotionPriceRub : undefined };
    });
    const response = await runCommand({ type: 'SET_PRODUCT_PRICES', updates });
    if (!response.ok) { setError(`调价失败：${response.message}`); setResult(''); return; }
    setResult(`批量调价成功：已更新 ${updates.length} 个商品`); setSelected([]);
  };
  const columns: DataTableColumn<Product>[] = [
    { id: 'select', header: '选择', cell: (product) => <input type="checkbox" aria-label={`选择 ${product.name}`} checked={selected.includes(product.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, product.id] : selected.filter((id) => id !== product.id))} /> },
    { id: 'product', header: '商品 / SKU', cell: (product) => <span className="sku-pair"><strong>{product.name}</strong><small>{product.merchantSku} · {product.ozonSku}</small></span> },
    { id: 'price', header: '日常售价', align: 'end', cell: (product) => rub(product.priceRub) },
    { id: 'promotion', header: '活动价', align: 'end', cell: (product) => product.promotionPriceRub ? rub(product.promotionPriceRub) : '—' },
    { id: 'status', header: '价格状态', cell: (product) => <StatusTag tone={product.promotionPriceRub ? 'info' : 'neutral'}>{product.promotionPriceRub ? '活动中' : '日常价'}</StatusTag> },
  ];
  return <div className="page-stack"><section className="action-bar price-batch" aria-label="批量调价"><div><strong>批量价格模拟</strong><p>{selectedTargets.length ? `将应用于已选 ${selectedTargets.length} 个商品` : `未勾选商品，将应用于当前可见 ${visible.length} 行`}</p></div><label>调整方式<select aria-label="调整方式" value={mode} onChange={(event) => setMode(event.target.value)}><option value="percent">日常价上调百分比</option><option value="fixed">设置固定价格</option></select></label><label>调整值<input aria-label="调整值" value={value} onChange={(event) => { setValue(event.target.value); setError(''); }} /></label><label className="inline-check"><input type="checkbox" checked={promotion} onChange={(event) => setPromotion(event.target.checked)} />设置为活动价</label><button className="button button--primary" type="button" onClick={() => void apply()}>应用批量调价</button></section>{error ? <div className="alert-strip" role="alert">{error}</div> : null}{result ? <div className="success-note" role="status"><span>{result}</span><button type="button" onClick={() => setResult('')}>关闭</button></div> : null}<DataTable caption="商品价格列表" columns={columns} rows={visible} rowKey={(row) => row.id} toolbar={<div className="catalog-toolbar"><label>搜索商品<input aria-label="搜索商品" value={query} onChange={(event) => setQuery(event.target.value)} /></label><span>当前可见 {visible.length} 行</span></div>} /></div>;
}
