import { useCallback, useEffect, useRef, useState } from 'react';
import type { InventoryState } from '../domain/model.ts';
import type { BackupRepository } from '../persistence/repository.ts';
import { LocalStorageRepository } from '../persistence/repository.ts';
import { createSampleFridge, upgradeFridgeConfiguration } from '../config/sample-fridge.ts';

export function useInventory() {
  const repository = useRef<BackupRepository | null>(null);
  const current = useRef<InventoryState | null>(null);
  const busy = useRef(false);
  const [state, setState] = useState<InventoryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      repository.current ??= new LocalStorageRepository(window.localStorage);
      const loaded = await repository.current.load();
      const next = loaded ? upgradeFridgeConfiguration(loaded) : createSampleFridge();
      // Persist the upgrade before exposing it. Failed saves leave the old
      // stored snapshot intact and use the existing retry/error flow.
      if (loaded && next !== loaded) await repository.current.save(next);
      current.current = next;
      setState(next);
    } catch {
      setLoadError(true);
      current.current = null;
      setState(null);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const commit = useCallback(async (operation: (state: InventoryState) => InventoryState, message: string) => {
    if (busy.current || !repository.current || !current.current) throw new Error('暂时无法保存，请稍后重试。');
    busy.current = true;
    setSaving(true);
    setNotice('');
    try {
      const next = operation(current.current);
      await repository.current.save(next);
      current.current = next;
      setState(next);
      setNotice(message);
    } catch {
      throw new Error('保存失败，修改尚未生效。请检查浏览器存储权限或可用空间后重试。');
    } finally { busy.current = false; setSaving(false); }
  }, []);
  const readRecovery = useCallback(async () => {
    if (!repository.current) throw new Error('浏览器存储暂时不可用。');
    return repository.current.loadRecovery();
  }, []);
  const replace = useCallback(async (next: InventoryState) => {
    if (busy.current || !repository.current) throw new Error('暂时无法恢复，请稍后重试。');
    busy.current = true; setSaving(true); setNotice('');
    try {
      await repository.current.replaceWithRecovery(next, current.current);
      current.current = next; setState(next); setLoadError(false); setNotice('已恢复备份');
    } finally { busy.current = false; setSaving(false); }
  }, []);
  return { state, loading, saving, loadError, load, commit, notice, readRecovery, replace };
}
