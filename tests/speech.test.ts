import test from 'node:test';
import assert from 'node:assert/strict';
import { speechFactory, startSpeech } from '../src/ui/speech.ts';
import type { SpeechEngine, SpeechResult } from '../src/ui/speech.ts';

class FakeSpeech implements SpeechEngine {
  static last: FakeSpeech; lang = ''; continuous = true; interimResults = true; maxAlternatives = 9;
  onresult: SpeechEngine['onresult'] = null; onerror: SpeechEngine['onerror'] = null; onend: SpeechEngine['onend'] = null;
  aborted = 0; stopped = 0;
  constructor() { FakeSpeech.last = this; }
  start() {} stop() { this.stopped++; } abort() { this.aborted++; }
}
function setup() {
  const text: string[] = [], states: string[] = [], errors: string[] = [];
  const session = startSpeech(FakeSpeech, { text: value => text.push(value), state: value => states.push(value), error: value => errors.push(value) });
  return { session, engine: FakeSpeech.last, text, states, errors };
}
const result = (transcript: string, isFinal = true): SpeechResult => ({ isFinal, 0: { transcript } });
test('capability detection supports native and prefixed services without constructing a microphone session', () => {
  assert.equal(speechFactory({}), null); assert.equal(speechFactory({ SpeechRecognition: FakeSpeech }), FakeSpeech);
  assert.equal(speechFactory({ webkitSpeechRecognition: FakeSpeech }), FakeSpeech);
});
test('only final results populate text; repeated final events do not duplicate words', () => {
  const c = setup();
  try {
    assert.equal(c.engine.lang, 'zh-CN'); assert.equal(c.engine.continuous, false); assert.equal(c.engine.interimResults, false);
    c.engine.onresult!({ resultIndex: 0, results: [result('三盒牛奶', false)] }); assert.deepEqual(c.text, []);
    c.engine.onresult!({ resultIndex: 0, results: [result('三盒牛奶')] });
    c.engine.onresult!({ resultIndex: 0, results: [result('三盒牛奶')] }); assert.equal(c.text.at(-1), '三盒牛奶');
    c.engine.onend!(); assert.equal(c.states.at(-1), 'idle'); assert.equal(c.engine.aborted, 1);
  } finally { c.session.dispose(); }
});
test('denied permission and network failures do not clear existing text or restart listening', () => {
  for (const error of ['not-allowed', 'network', 'no-speech', 'audio-capture']) {
    const c = setup(); c.engine.onerror!({ error });
    assert.deepEqual(c.text, []); assert.equal(c.states.at(-1), 'idle'); assert.equal(c.errors.length, 1); assert.equal(c.engine.aborted, 1);
    assert.equal(c.engine.onresult, null);
  }
});
test('unmount/cancel aborts capture and even previously queued callbacks cannot replace input', () => {
  const c = setup(); const lateResult = c.engine.onresult!; const lateError = c.engine.onerror!;
  c.session.dispose(); const states = [...c.states]; lateResult({ resultIndex: 0, results: [result('late')] }); lateError({ error: 'network' });
  assert.deepEqual(c.text, []); assert.deepEqual(c.errors, []); assert.deepEqual(c.states, states); assert.equal(c.engine.aborted, 1);
});
test('stop requests final text, and capture timeouts release the microphone without waiting indefinitely', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] }); const c = setup();
  t.mock.timers.tick(30000); assert.equal(c.engine.stopped, 1); assert.equal(c.states.at(-1), 'stopping');
  t.mock.timers.tick(5000); assert.equal(c.engine.aborted, 1); assert.equal(c.states.at(-1), 'idle'); assert.equal(c.errors.length, 1);
});
test('synchronous service failure and oversized results leave the session stopped', () => {
  class Broken extends FakeSpeech { start() { throw new Error('Unavailable'); } }
  const errors: string[] = []; const states: string[] = [];
  startSpeech(Broken, { text() { assert.fail(); }, state: value => states.push(value), error: value => errors.push(value) });
  assert.deepEqual(states, ['listening', 'idle']); assert.equal(errors.length, 1);
  const c = setup(); c.engine.onresult!({ resultIndex: 0, results: [result('字'.repeat(501))] });
  assert.deepEqual(c.text, []); assert.equal(c.errors.length, 1); assert.equal(c.engine.aborted, 1);
});
