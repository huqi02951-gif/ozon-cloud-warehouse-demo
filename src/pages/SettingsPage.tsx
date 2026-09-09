import React, { useEffect, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { StatusTag } from '../components/StatusTag';
import { useDemo } from '../state/DemoContext';
import type { DemoSettings } from '../domain/types';
import type { PageProps } from './types';

export function SettingsPage({ role }: PageProps) {
  const { state, runCommand, resetDemo } = useDemo();
  const [frequency, setFrequency] = useState(String(state.settings.inventorySyncMinutes));
  const [autoRoute, setAutoRoute] = useState(state.settings.autoRouteEnabled);
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { setFrequency(String(state.settings.inventorySyncMinutes)); setAutoRoute(state.settings.autoRouteEnabled); }, [state.settings]);
  const save = async () => { const result = await runCommand({ type: 'UPDATE_SETTINGS', inventorySyncMinutes: Number(frequency) as DemoSettings['inventorySyncMinutes'], autoRouteEnabled: autoRoute }); setMessage(result.message); };
  const reset = async () => { const result = await resetDemo(); setConfirming(false); setMessage(result.message); };
  return <div className="page-stack settings-layout">
    {message ? <div className="success-note" role="status"><span>{message}</span><button onClick={() => setMessage('')}>关闭</button></div> : null}
    <section className="panel settings-panel"><div className="panel__head"><div><h2>同步与路由</h2><p>配置保存在当前浏览器中。</p></div><StatusTag tone="success">本地持久化</StatusTag></div><div className="settings-body"><label>库存同步频率<select aria-label="库存同步频率" value={frequency} disabled={role !== 'admin'} onChange={event => setFrequency(event.target.value)}><option value="5">每 5 分钟</option><option value="15">每 15 分钟</option><option value="30">每 30 分钟</option><option value="60">每 60 分钟</option></select></label><label className="check-row"><input type="checkbox" checked={autoRoute} disabled={role !== 'admin'} onChange={event => setAutoRoute(event.target.checked)} />启用自动仓库路由</label>{role === 'admin' ? <button className="button button--primary" onClick={() => void save()}>保存设置</button> : <small>运营人员仅可查看配置</small>}</div></section>
    <section className="panel settings-panel"><div className="panel__head"><div><h2>店铺授权</h2><p>模拟 Ozon 店铺连接状态。</p></div></div><div className="store-connections">{state.stores.map(store => <article key={store.id}><div><strong>{store.name}</strong><small>{store.ozonSellerCode}</small></div><StatusTag tone={store.connected ? 'success' : 'warning'}>{store.connected ? '已授权' : '未授权'}</StatusTag>{role === 'admin' ? <button className="button button--secondary" onClick={() => void runCommand({ type: 'UPDATE_STORE_CONNECTION', storeId: store.id, connected: !store.connected })}>{store.connected ? '取消授权' : '模拟授权'}</button> : null}</article>)}</div></section>
    <section className="panel settings-panel"><div className="panel__head"><div><h2>角色与路由规则</h2><p>页面按角色控制操作权限。</p></div></div><div className="settings-body"><table className="role-matrix"><thead><tr><th>角色</th><th>配置</th><th>异常重试</th><th>仓库范围</th></tr></thead><tbody><tr><td>管理员</td><td>可编辑</td><td>可执行</td><td>全部</td></tr><tr><td>运营人员</td><td>只读</td><td>可执行</td><td>全部</td></tr><tr><td>仓库人员</td><td>不可访问</td><td>只读</td><td>关联仓库</td></tr></tbody></table><p>路由顺序：店铺首选仓 → 区域覆盖 → 仓库优先级；SKU 映射和安全库存校验必须通过。</p></div></section>
    {role === 'admin' ? <section className="panel danger-zone"><div><h2>重置演示数据</h2><p>恢复订单、任务、授权和设置的初始状态。</p></div><button className="button button--danger" onClick={() => setConfirming(true)}>重置演示数据</button></section> : null}
    <ConfirmModal open={confirming} title="重置演示数据" description="此操作会恢复所有演示数据和本地配置。" confirmLabel="确认重置" onCancel={() => setConfirming(false)} onConfirm={() => void reset()} />
  </div>;
}
