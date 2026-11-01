import { useEffect, useRef, useState } from 'react';
import type { InventoryState } from '../domain/model.ts';
import { parseEntryDraft } from '../domain/entry-draft.ts';
import type { EntryDraft } from '../domain/entry-draft.ts';
import { localToday } from './labels.ts';
import { speechFactory, startSpeech } from './speech.ts';

interface Props { state: InventoryState; locationId: string; busy: boolean; onDraft: (draft: EntryDraft) => void; onListening: (listening: boolean) => void }
export function QuickEntry({ state, locationId, busy, onDraft, onListening }: Props) {
  const [text, setText] = useState(''); const [kind, setKind] = useState<'speech' | 'text'>('text');
  const [status, setStatus] = useState<'idle' | 'listening' | 'stopping'>('idle');
  const [error, setError] = useState(''); const [issues, setIssues] = useState<string[]>([]);
  const capture = useRef<ReturnType<typeof startSpeech> | null>(null);
  const factory = speechFactory(window);
  const supported = !!factory && window.isSecureContext;
  useEffect(() => () => { capture.current?.dispose(); }, []);
  function start() {
    if (!factory || !supported || status !== 'idle') return;
    setError(''); setIssues([]); capture.current?.dispose();
    capture.current = startSpeech(factory, { text(value) { setText(value); setKind('speech'); },
      state(value) { setStatus(value); onListening(value !== 'idle'); }, error: setError });
  }
  function apply() {
    setError(''); setIssues([]);
    try { const draft = parseEntryDraft(text, kind, state, locationId, localToday()); onDraft(draft); setIssues(['草稿已填入下方，检查后保存。', ...draft.issues]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法整理这句话，请修改文字。'); }
  }
  return <details className="quick-entry" onToggle={event => { if (!event.currentTarget.open && status !== 'idle') { capture.current?.dispose(); setStatus('idle'); onListening(false); } }}><summary>语音 / 一句话录入</summary><div>
    <label>录入原句<textarea maxLength={500} value={text} disabled={busy || status !== 'idle'} onChange={event => { setText(event.target.value); setKind('text'); }} placeholder="三盒牛奶还有七天放冷藏第二层" /></label>
    <div className="quick-entry-actions"><button type="button" className="secondary" disabled={busy || !supported || status === 'stopping'} onClick={() => status === 'idle' ? start() : capture.current?.stop()}>{status === 'listening' ? '结束语音' : status === 'stopping' ? '正在结束…' : '开始语音'}</button>
      <button type="button" className="secondary" disabled={busy || status !== 'idle' || !text.trim()} onClick={apply}>填入表单</button></div>
    <p className="field-hint">{supported ? '语音可能由浏览器的在线服务处理；点击后请求麦克风权限。' : '当前浏览器不支持语音，可直接输入原句。'} 一次一种食物。</p>
    <div role="status" aria-live="polite">{status !== 'idle' && <p className="field-hint">{status === 'listening' ? '正在听，最长 30 秒…' : '正在结束识别…'}</p>}{issues.map(issue => <p key={issue} className="field-hint">{issue}</p>)}</div>
    {error && <p className="error" role="alert">{error}</p>}
  </div></details>;
}
