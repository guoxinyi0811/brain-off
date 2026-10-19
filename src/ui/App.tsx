import { useEffect, useState } from 'react';
import type { InventoryItem, InventoryState } from '../domain/model.ts';
import { addItem, updateItem, removeItem, setPurposes } from '../domain/inventory.ts';
import { useInventory } from './useInventory.ts';
import { expiryLabel, label, localToday, storageLocations } from './labels.ts';
import { Fridge } from './Fridge.tsx';
import { ItemForm } from './ItemForm.tsx';
import { Modal } from './Modal.tsx';
import { InventoryView } from './InventoryView.tsx';
import { emptyInventoryQuery } from '../domain/inventory-query.ts';
import { quantityLabel } from '../domain/quantity.ts';
import { BackupDialog } from './BackupDialog.tsx';

export function App() {
  const { state, loading, saving, loadError, load, commit, notice, readRecovery, replace } = useInventory();
  const [backupOpen, setBackupOpen] = useState(false);
  const [selected, setSelected] = useState('upper-shelf');
  const [today, setToday] = useState(localToday);
  const [form, setForm] = useState<InventoryItem | 'new' | null>(null);
  const [purposes, setPurposeDraft] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<'fridge' | 'inventory'>('fridge');
  const [query, setQuery] = useState({ ...emptyInventoryQuery });
  const [locatedId, setLocatedId] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => setToday(localToday());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const location = state?.locations.find(node => node.id === selected && node.canHoldItems) ?? state?.locations.find(node => node.canHoldItems);
  const selectedId = location?.id ?? '';
  useEffect(() => {
    if (view !== 'fridge' || !locatedId) return;
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-location-id]'))
      .find(node => node.dataset.locationId === selectedId);
    button?.focus({ preventScroll: true });
    button?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, [view, locatedId, selectedId]);
  const items = state?.items.filter(item => item.locationId === selectedId) ?? [];
  const assigned = state?.purposes.filter(p => p.locationId === selectedId).map(p => p.categoryId) ?? [];
  const due = state?.items.filter(item => expiryLabel(item.expiration, today).status !== 'later') ?? [];
  async function saveAction(operation: (state: InventoryState) => InventoryState, message: string, close: () => void) {
    setError('');
    try { await commit(operation, message); close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，请重试。'); }
  }
  function selectLocation(id: string) { setSelected(id); setLocatedId(null); setError(''); }
  function locateItem(item: InventoryItem) {
    setSelected(item.locationId); setLocatedId(item.id); setError(''); setView('fridge');
  }
  return <div className="app">
    <a className="skip-link" href={view === 'fridge' ? '#workspace' : '#inventory'}>跳到内容</a>
    <header className="topbar"><a className="wordmark" href="#" aria-label="brain off 首页">brain off</a>
      <div className="topbar-actions"><button className="text-button" disabled={loading || saving} onClick={() => setBackupOpen(true)}>备份</button><span className="local-badge"><i aria-hidden="true" />本地保存</span></div></header>
    <main>
      <div className="page-heading"><h1>{view === 'fridge' ? '我的冰箱' : '库存'}<span className="heading-period" aria-hidden="true">.</span></h1>{state && <p><strong>{state.items.length.toString().padStart(2, '0')}</strong> 条库存<span aria-hidden="true"> / </span><strong>{due.length.toString().padStart(2, '0')}</strong> 条需留意</p>}</div>
      <nav className="view-switch" aria-label="查看方式"><button aria-pressed={view === 'fridge'} onClick={() => setView('fridge')}>冰箱</button><button aria-pressed={view === 'inventory'} onClick={() => setView('inventory')}>库存</button></nav>
      <div className="status-line" role="status" aria-live="polite">{saving ? '保存中…' : notice}</div>
      {loading ? <div className="loading-state">正在打开冰箱…</div> : loadError || !state ? <section className="load-error" role="alert"><h2>暂时无法读取冰箱</h2><p>浏览器存储不可用或已有数据无法读取。原数据未被覆盖。</p><button className="primary" onClick={() => void load()}>重新读取</button></section> : <>
        {view === 'inventory' ? <InventoryView state={state} today={today} query={query} onQuery={setQuery} busy={saving}
          onLocate={locateItem} onEdit={setForm} onRemove={item => { setError(''); setDeleting(item); }} onAdd={() => setForm('new')} /> : <><section className="workspace" id="workspace" aria-label="冰箱和位置详情">
          <div className="spatial-panel"><Fridge state={state} selected={selectedId} today={today} onSelect={selectLocation} /></div>
          <aside className="detail-panel" aria-label="所选位置详情" tabIndex={-1}>
            {location ? <><div className="location-heading"><div><p className="location-parent">{label(state.locations.find(n => n.id === location.parentId)?.label ?? state.fridge.name)}</p><h2>{label(location.label)}</h2></div><span className="item-count">{items.length} 条</span></div>
              <div className="purpose-row"><div className="purpose-tags">{assigned.map(id => <span key={id}>{label(state.categories.find(c => c.id === id)!.label)}</span>)}</div><button className="text-button" onClick={() => { setError(''); setPurposeDraft(assigned); }}>设置用途</button></div>
              <button className="primary add-button" onClick={() => setForm('new')} disabled={saving}><span aria-hidden="true">＋</span> 添加食物</button>
              <div className="item-list">{items.length ? [...items].sort((a, b) => expiryLabel(a.expiration, today).daysRemaining - expiryLabel(b.expiration, today).daysRemaining).map(item => {
                const expiry = expiryLabel(item.expiration, today);
                return <article key={item.id} className={`item-card ${locatedId === item.id ? 'located' : ''}`}><div className="item-top"><h3>{item.name}{item.quantity && <span className="food-quantity">{quantityLabel(item)}</span>}</h3><p className={`expiry ${expiry.status}`}>{expiry.text}</p></div><div className="item-bottom"><span>{expiry.detail}</span><div><button className="text-button" aria-label={`编辑或移动${item.name}`} onClick={() => setForm(item)}>编辑 / 移动</button><button className="text-button remove-button" aria-label={`移除${item.name}`} onClick={() => { setError(''); setDeleting(item); }}>移除</button></div></div></article>;
              }) : <p className="empty-state">暂无食物</p>}</div>
            </> : <p>示例配置中没有可放食物的位置。</p>}
          </aside>
        </section>
        {due.length > 0 && <section className="reminder" aria-label="到期提醒"><h2>需留意 <small>到期或保质期待确认</small></h2><div className="due-items">{due.map(item => <button key={item.id} onClick={() => locateItem(item)}>{item.name}<span>{expiryLabel(item.expiration, today).text} ↗</span></button>)}</div></section>}</>}
      </>}
      <footer>仅存于此浏览器 · 日期仅供整理参考</footer>
    </main>
    {backupOpen && <BackupDialog state={state} busy={saving} readRecovery={readRecovery} onClose={() => setBackupOpen(false)} onRestore={async next => {
      await replace(next);
      setSelected(previous => next.locations.some(node => node.id === previous && node.canHoldItems)
        ? previous : storageLocations(next)[0]?.id ?? '');
      setLocatedId(null); setQuery({ ...emptyInventoryQuery }); setError('');
    }} />}
    {form && state && <ItemForm state={state} locationId={view === 'inventory' && query.locationId ? query.locationId : selectedId} item={form === 'new' ? undefined : form} busy={saving} onClose={() => setForm(null)} onSave={async item => {
      await commit(s => form === 'new' ? addItem(s, item) : updateItem(s, item.id, { name: item.name, locationId: item.locationId, expiration: item.expiration, quantity: item.quantity }), '已保存');
      setSelected(item.locationId);
    }} />}
    {purposes && state && <Modal title="储存用途" busy={saving} onClose={() => setPurposeDraft(null)}><p className="modal-copy">可多选，不影响已有食物。</p><fieldset className="category-grid" disabled={saving}><legend className="sr-only">储存用途</legend>{state.categories.map(category => <label key={category.id}><input type="checkbox" checked={purposes.includes(category.id)} onChange={e => setPurposeDraft(e.target.checked ? [...purposes, category.id] : purposes.filter(id => id !== category.id))} />{label(category.label)}</label>)}</fieldset>{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" disabled={saving} onClick={() => setPurposeDraft(null)}>取消</button><button className="primary" disabled={saving} onClick={() => void saveAction(s => setPurposes(s, selectedId, purposes), '用途已更新', () => setPurposeDraft(null))}>{saving ? '保存中…' : '保存'}</button></div></Modal>}
    {deleting && <Modal title={`移除“${deleting.name}”？`} busy={saving} onClose={() => setDeleting(null)}>{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" disabled={saving} onClick={() => setDeleting(null)}>保留</button><button className="primary" disabled={saving} onClick={() => void saveAction(s => removeItem(s, deleting.id), '已移除', () => setDeleting(null))}>{saving ? '保存中…' : '确认移除'}</button></div></Modal>}
  </div>;
}
