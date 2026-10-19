import { useState } from 'react';
import type { FormEvent } from 'react';
import type { InventoryItem, InventoryState, ShelfLife } from '../domain/model.ts';
import { resolveExpirationInput } from './expirationInput.ts';
import type { ExpirationInput } from './expirationInput.ts';
import { foodTypes, inferFoodType, isRefrigerated, estimateSource } from '../domain/food-estimates.ts';
import { expiryLabel, locationName, localToday, storageLocations } from './labels.ts';
import { Modal } from './Modal.tsx';

interface Props { state: InventoryState; locationId: string; item?: InventoryItem; busy: boolean; onClose: () => void; onSave: (item: InventoryItem) => Promise<void> }
export function ItemForm({ state, locationId, item, busy, onClose, onSave }: Props) {
  const expiry = item?.expiration;
  const [name, setName] = useState(item?.name ?? '');
  const [location, setLocation] = useState(item?.locationId ?? locationId);
  const [mode, setMode] = useState<ExpirationInput['mode']>(expiry?.kind === 'automatic' || !expiry ? 'automatic' : expiry.kind);
  const [date, setDate] = useState(expiry?.kind === 'exact' ? expiry.date : expiry?.kind === 'production' ? expiry.producedOn : '');
  const [duration, setDuration] = useState(expiry?.kind === 'estimate' || expiry?.kind === 'production' ? String(expiry.duration.value) : '');
  const [unit, setUnit] = useState<ShelfLife['unit']>(expiry?.kind === 'estimate' || expiry?.kind === 'production' ? expiry.duration.unit : 'days');
  const [foodType, setFoodType] = useState(expiry?.kind === 'automatic' ? expiry.foodType : inferFoodType(item?.name ?? ''));
  const [typeChosen, setTypeChosen] = useState(false);
  const [basisDate, setBasisDate] = useState(expiry?.kind === 'automatic' ? expiry.basisDate : localToday());
  const [expiryChanged, setExpiryChanged] = useState(false);
  const [error, setError] = useState('');
  const automatic = mode === 'automatic' || !duration.trim() && (mode === 'estimate' || mode === 'production' && !date);
  function input(changed = expiryChanged): ExpirationInput {
    return { existing: item?.expiration, changed, mode, date, duration, unit, today: localToday(),
      foodType, basisDate, refrigerated: isRefrigerated(state, location) };
  }
  let preview: string;
  try { preview = expiryLabel(resolveExpirationInput(input()), localToday()).detail; }
  catch { preview = '填写完整后显示到期日'; }
  function changeMode(next: ExpirationInput['mode']) {
    setMode(next); setExpiryChanged(true); setDuration(''); setDate(''); setUnit('days');
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      if (!name.trim()) throw new Error('请填写食物名称。');
      const expiration = resolveExpirationInput(input());
      await onSave({ id: item?.id ?? crypto.randomUUID(), name: name.trim(), locationId: location, expiration });
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '暂时无法保存，请重试。'); }
  }
  return <Modal title={item ? '编辑食物' : '添加食物'} onClose={onClose} busy={busy}><form onSubmit={submit}>
    <fieldset disabled={busy} className="form-fields">
      <label>食物名称<input autoFocus required maxLength={100} value={name} onChange={e => {
        setName(e.target.value); if (!typeChosen && !item) setFoodType(inferFoodType(e.target.value));
      }} placeholder="名称" /></label>
      <label>位置<select value={location} onChange={e => setLocation(e.target.value)}>{storageLocations(state).map(node => <option key={node.id} value={node.id}>{locationName(state, node.id)}</option>)}</select></label>
      <fieldset className="expiry-input"><legend>保质期</legend><div className="segmented">
        <label><input type="radio" name="expiry-mode" checked={mode === 'estimate'} onChange={() => changeMode('estimate')} />预估剩余</label>
        <label><input type="radio" name="expiry-mode" checked={mode === 'production'} onChange={() => changeMode('production')} />生产日期＋时长</label>
        <label><input type="radio" name="expiry-mode" checked={mode === 'automatic'} onChange={() => changeMode('automatic')} />自动估算</label>
        {mode === 'exact' && <label><input type="radio" name="expiry-mode" checked readOnly />原到期日</label>}
      </div>
      {(mode === 'production' || mode === 'exact') && <label>{mode === 'production' ? '生产日期' : '到期日期'}<input type="date" required={mode === 'exact' || !!duration} max={mode === 'production' ? localToday() : undefined} value={date} onInput={e => { setDate(e.currentTarget.value); setExpiryChanged(true); }} onChange={e => { setDate(e.target.value); setExpiryChanged(true); }} /></label>}
      {(mode === 'estimate' || mode === 'production') && <div className="duration-row"><label className="sr-only" htmlFor="duration">{mode === 'production' ? '保质期时长' : '剩余时长'}</label><input id="duration" type="number" min="0" max="36500" step="1" value={duration} onChange={e => { setDuration(e.target.value); setExpiryChanged(true); }} placeholder="不填则自动估算" /><label className="sr-only" htmlFor="unit">时长单位</label><select id="unit" value={unit} onChange={e => { setUnit(e.target.value as ShelfLife['unit']); setExpiryChanged(true); }}><option value="days">天</option><option value="weeks">周</option>{mode === 'production' && <option value="months">个月</option>}</select></div>}
      {automatic && <div className="automatic-fields">
        <label>食物种类<select value={foodType} onChange={e => { setFoodType(e.target.value); setTypeChosen(true); setExpiryChanged(true); }}><option value="">其他 / 尚不确定</option>{foodTypes.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
        {foodType && <label>购入 / 做好日期<input type="date" required max={localToday()} value={basisDate} onInput={e => { setBasisDate(e.currentTarget.value); setExpiryChanged(true); }} onChange={e => { setBasisDate(e.target.value); setExpiryChanged(true); }} /></label>}
        <p className="field-hint">{!isRefrigerated(state, location) ? '冷冻暂不自动估算，可手动填写。' : '按持续冷藏 ≤4°C 的参考时长估算；包装和实际储存情况优先。'} <a href={estimateSource} target="_blank" rel="noreferrer">依据 ↗</a></p>
      </div>}
      <p className="field-hint" role="status">{preview}</p>
      {item && !expiryChanged && <p className="field-hint">{expiry ? `${expiry.originalInput} · 记录于 ${expiry.recordedOn}` : '尚无足够信息估算'} · 保留原记录</p>}
      {mode === 'estimate' && duration && <p className="field-hint">从今天起估算</p>}
      </fieldset>
    </fieldset>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose} disabled={busy}>取消</button><button className="primary" disabled={busy}>{busy ? '正在保存…' : '保存食物'}</button></div>
  </form></Modal>;
}
