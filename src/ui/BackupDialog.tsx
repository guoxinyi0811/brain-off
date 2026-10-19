import { useEffect, useRef, useState } from 'react';
import type { InventoryState } from '../domain/model.ts';
import { MAX_BACKUP_BYTES, parseBackup, serializeBackup } from '../domain/backup.ts';
import { upgradeFridgeConfiguration } from '../config/sample-fridge.ts';
import type { RecoveryPoint } from '../persistence/repository.ts';
import { Modal } from './Modal.tsx';

interface Props {
  state: InventoryState | null; busy: boolean;
  readRecovery: () => Promise<RecoveryPoint | null>;
  onRestore: (state: InventoryState) => Promise<void>; onClose: () => void;
}
interface Preview { name: string; snapshot: InventoryState; date: string | null; upgraded: boolean }
const displayDate = (date: string) => new Date(date).toLocaleString('zh-CN', { hour12: false });
function download(text: string, suffix: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = `brain-off-${new Date().toISOString().replace(/[:.]/g, '-')}-${suffix}`;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BackupDialog({ state, busy, readRecovery, onRestore, onClose }: Props) {
  const [recovery, setRecovery] = useState<RecoveryPoint | null>(null);
  const [checking, setChecking] = useState(true);
  const [reading, setReading] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const ticket = useRef(0);
  useEffect(() => {
    let active = true;
    void readRecovery().then(point => { if (active) setRecovery(point); })
      .catch(() => { if (active) setError('无法读取恢复副本；副本未被更改，仍可选择备份文件。'); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; ticket.current++; };
  }, [readRecovery]);
  function prepare(snapshot: InventoryState, name: string, date: string | null) {
    const next = upgradeFridgeConfiguration(snapshot);
    setPreview({ snapshot: next, name, date, upgraded: next !== snapshot });
  }
  async function choose(file: File | undefined) {
    if (!file) return;
    const id = ++ticket.current;
    setError(''); setNotice(''); setPreview(null); setReading(true);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error('备份文件不能超过 5 MB。');
      const parsed = parseBackup(await file.text());
      if (ticket.current === id) prepare(parsed.snapshot, file.name, parsed.exportedAt);
    } catch (cause) {
      if (ticket.current === id) setError(cause instanceof Error ? cause.message : '无法读取这份备份。');
    } finally { if (ticket.current === id) setReading(false); }
  }
  function exportData(snapshot: InventoryState | null, raw?: string | null) {
    setError(''); setNotice('');
    try {
      if (snapshot) download(serializeBackup(snapshot), 'backup.json');
      else if (raw != null) download(raw, 'recovery-raw.txt');
      else throw new Error('暂无可导出的数据。');
      setNotice('已请求下载，请确认文件已保存。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '暂时无法导出。'); }
  }
  async function restore() {
    if (!preview) return;
    setError(''); setNotice('');
    try { await onRestore(preview.snapshot); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '恢复失败，原库存未被替换。'); }
  }
  return <Modal title="备份与恢复" onClose={onClose} busy={busy || reading}>
    <fieldset disabled={busy || reading} className="backup-tools">
      <button className="secondary" disabled={!state} onClick={() => exportData(state)}>导出当前数据</button>
      <label className="backup-file">选择备份文件<input type="file" accept=".json,application/json" onChange={event => { void choose(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <p className="field-hint">JSON · 最大 5 MB · 文件仅在本机读取</p>
      <section className="recovery-section" aria-label="上次恢复副本"><h3>上次恢复副本</h3>
        {checking ? <p>正在读取…</p> : recovery ? <>
          <p>{displayDate(recovery.capturedAt)}{recovery.snapshot ? ` · ${recovery.snapshot.items.length} 条库存` : ' · 原始数据不可直接恢复'}</p>
          <div className="recovery-actions">
            {recovery.snapshot && <button className="text-button" onClick={() => { setError(''); setNotice(''); prepare(recovery.snapshot!, '上次恢复副本', recovery.capturedAt); }}>预览恢复副本</button>}
            {(recovery.snapshot || recovery.raw !== null) && <button className="text-button" onClick={() => exportData(recovery.snapshot, recovery.raw)}>导出恢复副本</button>}
          </div>
        </> : <p>暂无副本</p>}
        <p className="field-hint">只保留最近一份，清除浏览器数据也会清除它。</p>
      </section>
    </fieldset>
    {reading && <p className="field-hint" role="status">正在校验备份…</p>}
    {preview && <section className="backup-preview" aria-label="恢复预览">
      <h3>{preview.name}</h3><p>{preview.snapshot.fridge.name}</p>
      <p>{preview.snapshot.items.length} 条库存 · {preview.snapshot.locations.filter(n => n.canHoldItems).length} 个储存位置</p>
      <p>{preview.date ? displayDate(preview.date) : '旧版数据 · 无导出时间'}</p>
      {preview.upgraded && <p>旧版示例布局将补全；食物和原日期保持不变。</p>}
      <p className="backup-replace-copy">将替换{state ? `当前 ${state.items.length} 条库存及冰箱配置` : '当前冰箱数据'}。替换前保留一份本地恢复副本。</p>
      <div className="modal-actions"><button className="secondary" disabled={busy || reading} onClick={() => setPreview(null)}>取消选择</button><button className="primary" disabled={busy || reading} onClick={() => void restore()}>{busy ? '正在恢复…' : '恢复这份备份'}</button></div>
    </section>}
    {notice && <p className="field-hint" role="status">{notice}</p>}
    {error && <p className="error" role="alert">{error}</p>}
  </Modal>;
}
