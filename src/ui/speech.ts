export interface SpeechResult { isFinal: boolean; [index: number]: { transcript: string } }
export interface SpeechEngine {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
export type SpeechFactory = new () => SpeechEngine;
export function speechFactory(target: unknown): SpeechFactory | null {
  const browser = target as { SpeechRecognition?: SpeechFactory; webkitSpeechRecognition?: SpeechFactory };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition ?? null;
}
export function speechError(code: string): string {
  return ({ 'not-allowed': '麦克风或语音服务未获授权，可继续输入文字。', 'service-not-allowed': '语音服务不可用，可继续输入文字。',
    'audio-capture': '没有可用的麦克风，可继续输入文字。', network: '语音服务连接失败，已保留现有文字。',
    'no-speech': '没有听清，请重试或输入文字。', 'language-not-supported': '当前服务不支持中文识别，请输入文字。' } as Record<string, string>)[code] ?? '语音识别未完成，已保留现有文字。';
}
export interface SpeechCallbacks { text: (text: string) => void; state: (state: 'idle' | 'listening' | 'stopping') => void; error: (message: string) => void }

/** Only constructed by an explicit button click. dispose detaches late callbacks and releases capture. */
export function startSpeech(factory: SpeechFactory, callbacks: SpeechCallbacks): { stop: () => void; dispose: () => void } {
  let engine: SpeechEngine | null = null; let active = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finals = new Map<number, string>();
  function finish(message?: string) {
    if (!active) return;
    active = false; clearTimeout(timer);
    if (engine) { engine.onresult = null; engine.onerror = null; engine.onend = null; try { engine.abort(); } catch { /* Already ended. */ } }
    callbacks.state('idle'); if (message) callbacks.error(message);
  }
  function stop() {
    if (!active) return;
    callbacks.state('stopping'); clearTimeout(timer);
    timer = setTimeout(() => finish('语音服务未及时结束，请重试或输入文字。'), 5000);
    try { engine?.stop(); } catch { finish(speechError('stop')); }
  }
  try {
    engine = new factory(); engine.lang = 'zh-CN'; engine.continuous = false; engine.interimResults = false; engine.maxAlternatives = 1;
    engine.onresult = event => {
      if (!active) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal && typeof result[0]?.transcript === 'string') finals.set(i, result[0].transcript.trim());
      }
      const text = [...finals.entries()].sort((a, b) => a[0] - b[0]).map(([, value]) => value).join(' ').trim();
      if (text.length > 500) { finish('一次请说一种食物，最多 500 个字符。'); return; }
      if (text) callbacks.text(text);
    };
    engine.onerror = event => { if (active) finish(speechError(event.error)); };
    engine.onend = () => finish();
    callbacks.state('listening'); timer = setTimeout(stop, 30000); engine.start();
  } catch { finish(speechError('start')); }
  return { stop, dispose() {
    if (!active) return;
    // Do not notify a component that has unmounted.
    active = false; clearTimeout(timer);
    if (engine) { engine.onresult = null; engine.onerror = null; engine.onend = null; try { engine.abort(); } catch { /* Already ended. */ } }
  } };
}
