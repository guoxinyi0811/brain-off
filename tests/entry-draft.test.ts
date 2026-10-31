import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntryDraft, spokenNumber } from '../src/domain/entry-draft.ts';
import { createSampleFridge } from '../src/config/sample-fridge.ts';
import { validateState } from '../src/domain/validation.ts';
import { addItem, updateItem } from '../src/domain/inventory.ts';
import { resolveExpirationInput } from '../src/ui/expirationInput.ts';
import { parseBackup, serializeBackup } from '../src/domain/backup.ts';

const today = '2026-10-31';
const parse = (text: string) => parseEntryDraft(text, 'speech', createSampleFridge(), 'upper-shelf', today);
test('spoken integers and decimal quantities are explicit, with ambiguous shorthand rejected', () => {
  for (const [text, value] of [['三', 3], ['两', 2], ['十二', 12], ['二十一', 21], ['一百零二', 102], ['二零二六', 2026], ['半', .5], ['零点五', .5], ['1.25', 1.25]] as const)
    assert.equal(spokenNumber(text), value);
  for (const text of ['一百二', '两百五', '十百', '一万', '负三']) assert.throws(() => spokenNumber(text));
});
test('one sentence maps quantity, remaining time and explicit physical location into an editable draft', () => {
  const draft = parse('三盒牛奶，还有七天，放冷藏第二层');
  assert.equal(draft.name, '牛奶'); assert.deepEqual(draft.quantity, { value: 3, unit: '盒' });
  assert.equal(draft.locationId, 'lower-shelf'); assert.equal(draft.mode, 'estimate'); assert.equal(draft.duration, '7');
  assert.equal(draft.reviewExpiration, false); assert.equal(draft.reviewLocation, false);
  assert.equal(draft.entry.text, '三盒牛奶，还有七天，放冷藏第二层'); assert.equal(draft.entry.recordedOn, today);
});
test('suffix quantities, fractional weights and full-width digits are supported without altering food names', () => {
  assert.deepEqual(parse('牛奶３盒，还有１周').quantity, { value: 3, unit: '盒' });
  assert.deepEqual(parse('半公斤牛肉').quantity, { value: .5, unit: '公斤' });
  assert.deepEqual(parse('零点五kg黄油').quantity, { value: .5, unit: 'kg' });
  assert.equal(parse('三文鱼').name, '三文鱼'); assert.equal(parse('四季豆').name, '四季豆');
  assert.equal(parse('四季豆').quantity, undefined);
});
test('production date and shelf life retain the manufacturing basis rather than assuming an expiry date', () => {
  const draft = parse('牛奶三盒，二零二六年十月一日生产，保质期一个月');
  assert.equal(draft.mode, 'production'); assert.equal(draft.date, '2026-10-01'); assert.equal(draft.unit, 'months'); assert.equal(draft.duration, '1');
  const expiry = resolveExpirationInput({ ...draft, changed: true, today });
  assert.equal(expiry?.kind, 'production'); if (expiry?.kind === 'production') assert.equal(expiry.date, '2026-11-01');
});
test('missing, invalid or future production dates require review and never guess the year', () => {
  for (const text of ['牛奶，十月一日生产，保质期七天', '牛奶，2026年2月30日生产，保质期七天', '牛奶，2026年11月1日生产，保质期七天', '牛奶，保质期七天']) {
    const draft = parse(text); assert.equal(draft.reviewExpiration, true); assert.equal(draft.date, '');
  }
});
test('ranges, duplicate times, fractional days and conflicting sources require explicit review', () => {
  for (const text of ['牛奶，还有三到五天', '牛奶，还有两三天', '牛奶，还有三天，还有七天', '牛奶，还有半天', '牛奶，还有一个月', '牛奶，2026-10-01生产，保质期七天，还有三天'])
    assert.equal(parse(text).reviewExpiration, true);
  assert.equal(parse('牛奶，还有零天').duration, '0');
});
test('omitted shelf life uses automatic mode without inventing quantity or expiration', () => {
  for (const text of ['鸡蛋', '鸡蛋，保质期不知道']) {
    const draft = parse(text); assert.equal(draft.mode, 'automatic'); assert.equal(draft.quantity, undefined);
    assert.equal(draft.locationId, 'lower-shelf'); assert.equal(draft.date, ''); assert.equal(draft.duration, '');
  }
});
test('only a unique configured recommendation is prefilled; ambiguous or unknown explicit locations need review', () => {
  assert.equal(parse('黄油').locationId, 'door-upper-left');
  assert.equal(parse('牛奶，放冷藏第九层').reviewLocation, true);
  const state = createSampleFridge(); state.locations.find(n => n.id === 'shelf-3')!.label = '第 2 层';
  assert.equal(parseEntryDraft('鸡蛋，放第二层', 'text', state, 'upper-shelf', today).reviewLocation, true);
  state.purposes.push({ locationId: 'upper-shelf', categoryId: 'eggs' });
  assert.equal(parseEntryDraft('鸡蛋', 'text', state, 'door-top', today).locationId, 'door-top');
});
test('multi-food or malformed input is rejected rather than silently saving a partial list', () => {
  for (const text of ['', '牛奶，鸡蛋', '牛奶和鸡蛋', '三盒牛奶两盒鸡蛋', '0盒牛奶', '两三盒牛奶', '牛奶三到五盒', '一斤半牛肉', '-2盒牛奶', '三'.repeat(501)]) assert.throws(() => parse(text));
});
test('parsing never mutates stock or purposes, and draft provenance survives edits and backup round trips', () => {
  const state = createSampleFridge(); const original = structuredClone(state);
  const draft = parseEntryDraft('三盒牛奶，还有七天', 'text', state, 'upper-shelf', today); assert.deepEqual(state, original);
  const expiration = resolveExpirationInput({ ...draft, changed: true, today });
  const saved = addItem(state, { id: 'draft-food', name: draft.name, locationId: draft.locationId, expiration, quantity: draft.quantity, entry: draft.entry });
  const edited = updateItem(saved, 'draft-food', { quantity: { value: 2, unit: '盒' } });
  assert.deepEqual(edited.items[0]!.entry, draft.entry); assert.deepEqual(edited.items[0]!.expiration, expiration);
  assert.deepEqual(parseBackup(serializeBackup(edited)).snapshot, edited);
  for (const entry of [{ kind: 'unknown', text: '牛奶', recordedOn: today }, { kind: 'speech', text: '', recordedOn: today }, { kind: 'text', text: '牛奶', recordedOn: '2026-02-30' }])
    assert.throws(() => validateState({ ...state, items: [{ id: 'bad', name: '牛奶', locationId: 'upper-shelf', expiration: null, entry }] }));
});
