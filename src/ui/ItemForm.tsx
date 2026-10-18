import { useState } from 'react';
import type { FormEvent } from 'react';
import type { InventoryItem, InventoryState } from '../domain/model.ts';
import { resolveExpirationInput } from './expirationInput.ts';
import { label, localToday } from './labels.ts';
import { Modal } from './Modal.tsx';

interface Props { state: InventoryState; locationId: string; item?: InventoryItem; busy: boolean; onClose: () => void; onSave: (item: InventoryItem) => Promise<void> }
export function ItemForm({ state, locationId, item, busy, onClose, onSave }: Props) {
  const [name, setName] = useState(item?.name ?? '');
  const [location, setLocation] = useState(item?.locationId ?? locationId);
  const [mode, setMode] = useState<'exact' | 'estimate'>(item?.expiration.kind ?? 'estimate');
  const [date, setDate] = useState(item?.expiration.kind === 'exact' ? item.expiration.date : localToday());
  const [duration, setDuration] = useState(item?.expiration.kind === 'estimate' ? String(item.expiration.duration.value) : '3');
  const [unit, setUnit] = useState<'days' | 'weeks'>(item?.expiration.kind === 'estimate' ? item.expiration.duration.unit : 'days');
  const [expiryChanged, setExpiryChanged] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      if (!name.trim()) throw new Error('请填写食物名称。');
      // Editing only the name or location must never renew an old estimate.
      const expiration = resolveExpirationInput({ existing: item?.expiration, changed: expiryChanged,
        mode, date, duration, unit, today: localToday() });
      await onSave({ id: item?.id ?? crypto.randomUUID(), name: name.trim(), locationId: location, expiration });
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '暂时无法保存，请重试。'); }
  }
  return <Modal title={item ? '编辑食物' : '放入一件食物'} onClose={onClose} busy={busy}><form onSubmit={submit}>
    <fieldset disabled={busy} className="form-fields">
      <label>食物名称<input autoFocus required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="比如：牛奶、草莓、昨天的晚餐" /></label>
      <label>放在哪里<select value={location} onChange={e => setLocation(e.target.value)}>{state.locations.filter(node => node.canHoldItems).map(node => <option key={node.id} value={node.id}>{label(node.label)}</option>)}</select></label>
      <fieldset className="expiry-input"><legend>什么时候到期？</legend><div className="segmented">
        <label><input type="radio" name="expiry-mode" checked={mode === 'estimate'} onChange={() => { setMode('estimate'); setExpiryChanged(true); }} />大约还能放</label>
        <label><input type="radio" name="expiry-mode" checked={mode === 'exact'} onChange={() => { setMode('exact'); setExpiryChanged(true); }} />有明确日期</label>
      </div>{mode === 'estimate' ? <div className="duration-row"><label className="sr-only" htmlFor="duration">剩余时长</label><input id="duration" type="number" required min="0" max="36500" step="1" value={duration} onChange={e => { setDuration(e.target.value); setExpiryChanged(true); }} /><label className="sr-only" htmlFor="unit">时长单位</label><select id="unit" value={unit} onChange={e => { setUnit(e.target.value as 'days' | 'weeks'); setExpiryChanged(true); }}><option value="days">天</option><option value="weeks">周</option></select></div>
        : <label>到期日期<input type="date" required value={date} onInput={e => { setDate(e.currentTarget.value); setExpiryChanged(true); }} onChange={e => { setDate(e.target.value); setExpiryChanged(true); }} /></label>}
        <p className="field-hint">{item && !expiryChanged ? `原记录保留：${item.expiration.originalInput}（记录于 ${item.expiration.recordedOn}）` : mode === 'estimate' ? '从今天起计算，始终标记为“预计”。' : '按照你填写的日期提醒。'}</p>
      </fieldset>
    </fieldset>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>取消</button><button className="primary" disabled={busy}>{busy ? '正在保存…' : '保存食物'}</button></div>
  </form></Modal>;
}
