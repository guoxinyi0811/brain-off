import { useEffect, useState } from 'react';
import type { InventoryItem, InventoryState } from '../domain/model.ts';
import { addItem, updateItem, removeItem, setPurposes } from '../domain/inventory.ts';
import { useInventory } from './useInventory.ts';
import { expiryLabel, label, localToday } from './labels.ts';
import { Fridge } from './Fridge.tsx';
import { ItemForm } from './ItemForm.tsx';
import { Modal } from './Modal.tsx';

export function App() {
  const { state, loading, saving, loadError, load, commit, notice } = useInventory();
  const [selected, setSelected] = useState('upper-shelf');
  const [today, setToday] = useState(localToday);
  const [form, setForm] = useState<InventoryItem | 'new' | null>(null);
  const [purposes, setPurposeDraft] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => setToday(localToday());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const location = state?.locations.find(node => node.id === selected && node.canHoldItems) ?? state?.locations.find(node => node.canHoldItems);
  const selectedId = location?.id ?? '';
  const items = state?.items.filter(item => item.locationId === selectedId) ?? [];
  const assigned = state?.purposes.filter(p => p.locationId === selectedId).map(p => p.categoryId) ?? [];
  const due = state?.items.filter(item => expiryLabel(item.expiration, today).status !== 'later') ?? [];
  async function saveAction(operation: (state: InventoryState) => InventoryState, message: string, close: () => void) {
    setError('');
    try { await commit(operation, message); close(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存失败，请重试。'); }
  }
  function selectLocation(id: string) { setSelected(id); setError(''); }
  return <div className="app">
    <a className="skip-link" href="#workspace">跳到冰箱</a>
    <header className="topbar"><a className="wordmark" href="#" aria-label="brain off 首页"><span className="brand-icon" aria-hidden="true">b.</span>brain off<span className="brand-period">·</span></a>
      <span className="local-badge"><span className="power-dot" aria-hidden="true" />仅存于此浏览器</span></header>
    <main>
      <section className="intro"><div><p className="eyebrow">LESS IN YOUR HEAD. MORE IN ITS PLACE.</p><h1>冰箱有数，<br className="mobile-break" />脑袋放空。</h1><p className="subtitle">记住食物的位置，把心思留给生活。</p></div><div className="edition"><span>MY FRIDGE</span><strong>01</strong><span>一点整理 · 少点惦记</span></div></section>
      <div className="status-line" role="status" aria-live="polite">{notice || (saving ? '正在保存…' : '每一件食物，都有自己的位置。')}</div>
      {loading ? <div className="loading-state">正在打开冰箱…</div> : loadError || !state ? <section className="load-error" role="alert"><h2>暂时无法读取冰箱</h2><p>浏览器存储不可用或已有数据无法读取。原数据未被覆盖。</p><button className="primary" onClick={() => void load()}>重新读取</button></section> : <>
        <div className="overview"><div><span className="stat-number">{state.items.length.toString().padStart(2, '0')}</span><span>件食物在冰箱里</span></div><div><span className={`stat-number ${due.length ? 'amber-text' : ''}`}>{due.length.toString().padStart(2, '0')}</span><span>件需要留意 <small>含已过期</small></span></div><div className="overview-note"><span className="tiny-line" />新鲜的事，慢慢来。</div></div>
        <section className="workspace" id="workspace" aria-label="冰箱和位置详情">
          <div className="spatial-panel"><div className="section-label"><span>01 / 冰箱地图</span><span>正视图</span></div><Fridge state={state} selected={selectedId} today={today} onSelect={selectLocation} /></div>
          <aside className="detail-panel" aria-label="所选位置详情"><div className="section-label"><span>02 / 这里有什么</span><span>{items.length} 件</span></div>
            {location ? <><div className="location-heading"><div><p className="eyebrow">{label(state.locations.find(n => n.id === location.parentId)?.label ?? state.fridge.name)}</p><h2>{label(location.label)}</h2></div><span className="location-symbol" aria-hidden="true">↳</span></div>
              <div className="purpose-row"><div className="purpose-tags">{assigned.length ? assigned.map(id => <span key={id}>{label(state.categories.find(c => c.id === id)!.label)}</span>) : <span>用途待设置</span>}</div><button className="text-button" onClick={() => { setError(''); setPurposeDraft(assigned); }}>设置用途</button></div>
              <button className="primary add-button" onClick={() => setForm('new')} disabled={saving}><span aria-hidden="true">＋</span> 放入食物</button>
              <div className="item-list">{items.length ? [...items].sort((a, b) => expiryLabel(a.expiration, today).daysRemaining - expiryLabel(b.expiration, today).daysRemaining).map(item => {
                const expiry = expiryLabel(item.expiration, today);
                return <article key={item.id} className="item-card"><div className="item-top"><span className="item-initial" aria-hidden="true">{Array.from(item.name)[0]}</span><div><h3>{item.name}</h3><p className={`expiry ${expiry.status}`}>{expiry.text}</p></div></div><div className="item-bottom"><span>{expiry.isEstimated ? '预估' : '到期'} · {expiry.date}</span><div><button className="text-button" aria-label={`编辑或移动${item.name}`} onClick={() => setForm(item)}>编辑 / 移动</button><button className="text-button remove-button" aria-label={`移除${item.name}`} onClick={() => { setError(''); setDeleting(item); }}>移除</button></div></div></article>;
              }) : <div className="empty-state"><div className="empty-drawing" aria-hidden="true"><span /><span /><span /></div><h3>这里，留给下一份新鲜。</h3><p>点“放入食物”，记下名称和保质期。<br />下次打开，就不用靠记忆了。</p></div>}</div>
              <div className="detail-note"><span aria-hidden="true">↗</span><p>用途是给自己的小提示。<br />修改用途不会移动或删除食物。</p></div>
            </> : <p>示例配置中没有可放食物的位置。</p>}
          </aside>
        </section>
        <section className="reminder"><span className="reminder-icon" aria-hidden="true">◷</span><div><h2>先吃哪一件？</h2><p>{due.length ? '这些食物已到期，或将在 3 天内到期。点击后查看所在位置。' : '暂时没有需要优先留意的食物。快到期时，这里会提醒你。'}</p></div>{due.length > 0 && <div className="due-items">{due.map(item => <button key={item.id} onClick={() => selectLocation(item.locationId)}>{item.name}<span>{expiryLabel(item.expiration, today).text} ↗</span></button>)}</div>}</section>
      </>}
      <footer><span>brain off <span className="footer-dot">·</span> 给生活腾点空间。</span><p>日期仅用于整理提醒，不代表食品安全判断。<br />当前数据不会同步到其他设备，请在同一浏览器中查看。</p></footer>
    </main>
    {form && state && <ItemForm state={state} locationId={selectedId} item={form === 'new' ? undefined : form} busy={saving} onClose={() => setForm(null)} onSave={async item => {
      await commit(s => form === 'new' ? addItem(s, item) : updateItem(s, item.id, { name: item.name, locationId: item.locationId, expiration: item.expiration }), '已保存到此浏览器。');
      setSelected(item.locationId);
    }} />}
    {purposes && state && <Modal title="这个位置，用来放什么？" busy={saving} onClose={() => setPurposeDraft(null)}><p className="modal-copy">可以多选，也可以暂时留空。已有食物会留在原处。</p><fieldset className="category-grid" disabled={saving}><legend className="sr-only">储存用途</legend>{state.categories.map(category => <label key={category.id}><input type="checkbox" checked={purposes.includes(category.id)} onChange={e => setPurposeDraft(e.target.checked ? [...purposes, category.id] : purposes.filter(id => id !== category.id))} />{label(category.label)}</label>)}</fieldset>{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" disabled={saving} onClick={() => setPurposeDraft(null)}>取消</button><button className="primary" disabled={saving} onClick={() => void saveAction(s => setPurposes(s, selectedId, purposes), '用途已更新，食物位置保持不变。', () => setPurposeDraft(null))}>{saving ? '正在保存…' : '保存用途'}</button></div></Modal>}
    {deleting && <Modal title={`移除“${deleting.name}”？`} busy={saving} onClose={() => setDeleting(null)}><p className="modal-copy">吃完了，或已经不在冰箱里？确认后将从库存中移除。</p>{error && <p className="error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" disabled={saving} onClick={() => setDeleting(null)}>保留</button><button className="primary" disabled={saving} onClick={() => void saveAction(s => removeItem(s, deleting.id), '已从库存移除。', () => setDeleting(null))}>{saving ? '正在保存…' : '确认移除'}</button></div></Modal>}
  </div>;
}
