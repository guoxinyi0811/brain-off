import test from 'node:test';
import assert from 'node:assert/strict';
import { productionExpiration, expirationStatus } from '../src/domain/expiration.ts';
import { automaticExpiration, inferFoodType, isRefrigerated } from '../src/domain/food-estimates.ts';
import { resolveExpirationInput } from '../src/ui/expirationInput.ts';
import { createSampleFridge } from '../src/config/sample-fridge.ts';
import { validateState } from '../src/domain/validation.ts';
import { queryInventory, emptyInventoryQuery } from '../src/domain/inventory-query.ts';
import { LocalStorageRepository, MemoryStorage } from '../src/persistence/repository.ts';
import { expiryLabel } from '../src/ui/labels.ts';

const input = { changed: true, mode: 'production' as const, date: '2026-10-19', duration: '7', unit: 'days' as const, today: '2026-10-19' };

test('production date plus shelf life preserves inputs and uses the production date rather than entry date', () => {
  const result = productionExpiration('2026-10-19', { value: 7, unit: 'days' }, '2026-10-22');
  assert.deepEqual(result, { kind: 'production', producedOn: '2026-10-19', recordedOn: '2026-10-22',
    duration: { value: 7, unit: 'days' }, date: '2026-10-26', originalInput: '2026-10-19 生产 · 保质期 7 天' });
  assert.equal(expirationStatus(result, '2026-10-22').daysRemaining, 4);
  assert.equal(expirationStatus(result, '2026-10-22').isEstimated, false);
});

test('month durations clamp to month end and handle leap years, weeks and zero days', () => {
  const date = (start: string, value: number, unit: 'days' | 'weeks' | 'months') => expirationStatus(productionExpiration(start, { value, unit }, '2026-10-19'), '2026-10-19').date;
  assert.equal(date('2024-01-31', 1, 'months'), '2024-02-29');
  assert.equal(date('2025-01-31', 1, 'months'), '2025-02-28');
  assert.equal(date('2024-02-29', 12, 'months'), '2025-02-28');
  assert.equal(date('2025-12-31', 2, 'weeks'), '2026-01-14');
  assert.equal(date('2026-10-19', 0, 'days'), '2026-10-19');
  for (const value of [-1, 1.5, Infinity]) assert.throws(() => date('2026-01-01', value, 'days'));
  assert.throws(() => date('2026-10-20', 3, 'days'));
  assert.throws(() => date('2026-02-30', 3, 'days'));
});

test('incomplete production input fails while both missing invokes automatic fallback', () => {
  assert.equal(expirationStatus(resolveExpirationInput(input), input.today).date, '2026-10-26');
  assert.throws(() => resolveExpirationInput({ ...input, duration: '' }), /同时填写/);
  assert.throws(() => resolveExpirationInput({ ...input, date: '' }), /同时填写/);
  const result = resolveExpirationInput({ ...input, date: '', duration: '', foodType: 'raw-poultry', refrigerated: true });
  assert.equal(result?.kind, 'automatic');
  assert.equal(expirationStatus(result, input.today).date, '2026-10-20');
});

test('automatic records retain category, actual start date, rule version and source', () => {
  const result = automaticExpiration('shell-eggs', '2026-10-01', '2026-10-19', true);
  assert.equal(result?.kind, 'automatic');
  if (result?.kind !== 'automatic') assert.fail();
  assert.equal(result.estimatedDate, '2026-10-22');
  assert.equal(result.days, 21);
  assert.equal(result.ruleId, 'shell-eggs:refrigerated:v1');
  assert.match(result.source, /^https:\/\/www.foodsafety.gov\//);
  assert.equal(expirationStatus(result, '2026-10-19').isEstimated, true);
  assert.throws(() => automaticExpiration('shell-eggs', '2026-10-20', '2026-10-19', true));
});

test('unknown categories and unsupported frozen storage stay unknown, independent of shelf purposes', () => {
  const state = createSampleFridge();
  assert.equal(isRefrigerated(state, 'lower-shelf'), true);
  assert.equal(isRefrigerated(state, 'door-right-tall'), true);
  assert.equal(isRefrigerated(state, 'freezer-drawer-3'), false);
  assert.equal(isRefrigerated(state, 'missing'), false);
  assert.equal(automaticExpiration('groceries', '2026-10-19', '2026-10-19', true), null);
  assert.equal(automaticExpiration('shell-eggs', '2026-10-19', '2026-10-19', false), null);
  assert.equal(expirationStatus(null, '2026-10-19').status, 'unknown');
  assert.equal(expiryLabel(null, '2026-10-19').text, '保质期待确认');
});

test('name inference is conservative and does not guess ambiguous foods', () => {
  assert.equal(inferFoodType(' 鸡蛋 '), 'shell-eggs');
  assert.equal(inferFoodType('ＥＧＧＳ'), 'shell-eggs');
  assert.equal(inferFoodType('水煮蛋'), 'cooked-eggs');
  for (const name of ['鸡肉', '剩菜', '牛奶', '鸡蛋酱', '调味料']) assert.equal(inferFoodType(name), '');
});

test('untouched automatic, production and unknown records never renew during later edits', () => {
  for (const existing of [automaticExpiration('soup', '2026-10-10', '2026-10-11', true), productionExpiration('2026-10-10', { value: 7, unit: 'days' }, '2026-10-11'), null]) {
    assert.strictEqual(resolveExpirationInput({ ...input, existing, changed: false }), existing);
  }
});

test('all new variants survive storage and reject inconsistent derived dates', async () => {
  const state = createSampleFridge();
  state.items = [null, productionExpiration('2026-10-19', { value: 7, unit: 'days' }, '2026-10-19'), automaticExpiration('soup', '2026-10-18', '2026-10-19', true)]
    .map((expiration, index) => ({ id: String(index), name: String(index), locationId: 'upper-shelf', expiration }));
  const repo = new LocalStorageRepository(new MemoryStorage()); await repo.save(state);
  assert.deepEqual(await repo.load(), state);
  for (const index of [1, 2]) {
    const broken = structuredClone(state); const expiry = broken.items[index]!.expiration;
    if (expiry?.kind === 'production') expiry.date = '2026-10-30';
    if (expiry?.kind === 'automatic') expiry.estimatedDate = '2026-10-30';
    assert.throws(() => validateState(broken), /Inconsistent/);
  }
});

test('unknowns sort after dated food and are excluded from known date filters', () => {
  const state = createSampleFridge();
  state.items = [null, productionExpiration('2026-10-19', { value: 7, unit: 'days' }, '2026-10-19'), null]
    .map((expiration, index) => ({ id: String(index), name: String(index), locationId: 'upper-shelf', expiration }));
  assert.deepEqual(queryInventory(state.items, emptyInventoryQuery, '2026-10-19').map(i => i.id), ['1', '0', '2']);
  assert.deepEqual(queryInventory(state.items, { ...emptyInventoryQuery, expiration: 'unknown' }, '2026-10-19').map(i => i.id), ['0', '2']);
  assert.deepEqual(queryInventory(state.items, { ...emptyInventoryQuery, expiration: 'later' }, '2026-10-19').map(i => i.id), ['1']);
});
