import { useState } from 'react';
import type { FormEvent } from 'react';
import type { InventoryItem, InventoryState } from '../domain/model.ts';
import { resolveExpirationInput } from './expirationInput.ts';
import { locationName, localToday, storageLocations } from './labels.ts';
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
  return <Modal title={item ? '编辑食物' : '添加食物'} onClose={onClose} busy={busy}><form onSubmit={submit}>
    <fieldset disabled={busy} className="form-fields">
      <label>食物名称<input autoFocus required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="名称" /></label>
      <label>位置<select value={location} onChange={e => setLocation(e.target.value)}>{storageLocations(state).map(node => <option key={node.id} value={node.id}>{locationName(state, node.id)}</option>)}</select></label>
      <fieldset className="expiry-input"><legend>保质期</legend><div className="segmented">
        <label><input type="radio" name="expiry-mode" checked={mode === 'estimate'} onChange={() => { setMode('estimate'); setExpiryChanged(true); }} />预计时长</label>
        <label><input type="radio" name="expiry-mode" checked={mode === 'exact'} onChange={() => { setMode('exact'); setExpiryChanged(true); }} />准确日期</label>
      </div>{mode === 'estimate' ? <div className="duration-row"><label className="sr-only" htmlFor="duration">剩余时长</label><input id="duration" type="number" required min="0" max="36500" step="1" value={duration} onChange={e => { setDuration(e.target.value); setExpiryChanged(true); }} /><label className="sr-only" htmlFor="unit">时长单位</label><select id="unit" value={unit} onChange={e => { setUnit(e.target.value as 'days' | 'weeks'); setExpiryChanged(true); }}><option value="days">天</option><option value="weeks">周</option></select></div>
        : <label>到期日期<input type="date" required value={date} onInput={e => { setDate(e.currentTarget.value); setExpiryChanged(true); }} onChange={e => { setDate(e.target.value); setExpiryChanged(true); }} /></label>}
        {(item && !expiryChanged || mode === 'estimate') && <p className="field-hint">{item && !expiryChanged ? `${item.expiration.originalInput} · 记录于 ${item.expiration.recordedOn}` : '从今天起估算'}</p>}
      </fieldset>
    </fieldset>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>取消</button><button className="primary" disabled={busy}>{busy ? '正在保存…' : '保存食物'}</button></div>
  </form></Modal>;
}
