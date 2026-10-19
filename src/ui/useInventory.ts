import { useCallback, useEffect, useRef, useState } from 'react';
import type { InventoryState } from '../domain/model.ts';
import type { BackupRepository } from '../persistence/repository.ts';
import { StorageConflictError } from '../persistence/repository.ts';
import { IndexedDbRepository } from '../persistence/indexeddb.ts';
import { createSampleFridge, upgradeFridgeConfiguration } from '../config/sample-fridge.ts';

export function useInventory() {
  const repository = useRef<BackupRepository | null>(null);
  const current = useRef<InventoryState | null>(null);
  const busy = useRef(false);
  const loadingRef = useRef(true);
  const sequence = useRef(0);
  const activity = useRef(0);
  const checking = useRef(false);
  const channel = useRef<BroadcastChannel | null>(null);
  const [state, setState] = useState<InventoryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState('');
  const [externalNotice, setExternalNotice] = useState('');
  const checkExternal = useCallback(async () => {
    if (busy.current || loadingRef.current || checking.current || !repository.current?.hasExternalChanges) return;
    const started = activity.current; checking.current = true;
    try {
      if (await repository.current.hasExternalChanges() && started === activity.current)
        setExternalNotice('其他页面已更新库存。当前输入会保留；请关闭编辑后重新读取。');
    } catch (cause) {
      if (started === activity.current) setExternalNotice(cause instanceof StorageConflictError ? cause.message : '暂时无法检查本地数据，请保留输入后重新读取。');
    } finally { checking.current = false; }
  }, []);
  const load = useCallback(async () => {
    if (busy.current) return;
    const id = ++sequence.current; activity.current++; loadingRef.current = true;
    setLoading(true); setLoadError(false); setNotice('');
    try {
      repository.current ??= new IndexedDbRepository({ factory: window.indexedDB, legacy: () => window.localStorage });
      const loaded = await repository.current.load();
      if (id !== sequence.current) return;
      const next = loaded ? upgradeFridgeConfiguration(loaded) : createSampleFridge();
      if (loaded && next !== loaded) await repository.current.save(next);
      if (id !== sequence.current) return;
      current.current = next; setState(next); setExternalNotice('');
    } catch {
      if (id === sequence.current) { setLoadError(true); current.current = null; setState(null); }
    } finally {
      if (id === sequence.current) { loadingRef.current = false; setLoading(false); void checkExternal(); }
    }
  }, [checkExternal]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const check = () => { void checkExternal(); };
    try { if (typeof BroadcastChannel !== 'undefined') { channel.current = new BroadcastChannel('brain-off:changes'); channel.current.onmessage = check; } }
    catch { /* Focus, visibility and periodic checks remain available. */ }
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    const legacy = (event: StorageEvent) => { if (event.key === null || event.key === 'brain-off:v1') check(); };
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', visible); window.addEventListener('storage', legacy);
    const timer = window.setInterval(check, 30000);
    return () => { channel.current?.close(); channel.current = null; clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', visible); window.removeEventListener('storage', legacy); };
  }, [checkExternal]);
  function broadcast() { try { channel.current?.postMessage('changed'); } catch { /* Revision checks still protect writes. */ } }
  const commit = useCallback(async (operation: (state: InventoryState) => InventoryState, message: string) => {
    if (busy.current || loadingRef.current || !repository.current || !current.current) throw new Error('暂时无法保存，请稍后重试。');
    busy.current = true; activity.current++; setSaving(true); setNotice('');
    try {
      const next = operation(current.current);
      await repository.current.save(next);
      current.current = next; setState(next); setNotice(message); broadcast();
    } catch (cause) {
      if (cause instanceof StorageConflictError) { setExternalNotice(cause.message); throw cause; }
      throw new Error('保存失败，修改尚未生效。请检查浏览器存储权限或可用空间后重试。');
    } finally { busy.current = false; activity.current++; setSaving(false); void checkExternal(); }
  }, [checkExternal]);
  const readRecovery = useCallback(async () => {
    if (!repository.current) throw new Error('浏览器存储暂时不可用。');
    return repository.current.loadRecovery();
  }, []);
  const replace = useCallback(async (next: InventoryState) => {
    if (busy.current || loadingRef.current || !repository.current) throw new Error('暂时无法恢复，请稍后重试。');
    busy.current = true; activity.current++; setSaving(true); setNotice('');
    try {
      await repository.current.replaceWithRecovery(next, current.current);
      current.current = next; setState(next); setLoadError(false); setExternalNotice(''); setNotice('已恢复备份'); broadcast();
    } catch (cause) {
      if (cause instanceof StorageConflictError) setExternalNotice(cause.message);
      throw cause;
    } finally { busy.current = false; activity.current++; setSaving(false); void checkExternal(); }
  }, [checkExternal]);
  return { state, loading, saving, loadError, load, commit, notice, externalNotice, readRecovery, replace };
}
