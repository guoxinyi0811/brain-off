import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveExpirationInput } from '../src/ui/expirationInput.ts';
import { estimatedExpiration } from '../src/domain/expiration.ts';

const input = { changed: false, mode: 'estimate' as const, date: '2026-10-18', duration: '3', unit: 'days' as const, today: '2026-10-18' };

test('editing a name or moving food days later preserves the original expiration and provenance', () => {
  const existing = estimatedExpiration(3, 'days', '2026-10-15', 'roughly three days');
  assert.strictEqual(resolveExpirationInput({ ...input, existing }), existing);
});

test('explicitly changing an estimate records the new input and current date', () => {
  const existing = estimatedExpiration(3, 'days', '2026-10-15', 'roughly three days');
  assert.deepEqual(resolveExpirationInput({ ...input, existing, changed: true, duration: '1', unit: 'weeks' }), {
    kind: 'estimate', originalInput: '约 1 周', recordedOn: '2026-10-18',
    duration: { value: 1, unit: 'weeks' }, estimatedDate: '2026-10-25',
  });
});

test('exact-date input preserves the chosen date and rejects missing estimate values', () => {
  assert.deepEqual(resolveExpirationInput({ ...input, mode: 'exact', date: '2026-10-17' }), {
    kind: 'exact', originalInput: '2026-10-17', recordedOn: '2026-10-18', date: '2026-10-17',
  });
  assert.throws(() => resolveExpirationInput({ ...input, duration: '' }));
});
