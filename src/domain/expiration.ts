import type { DateOnly, Expiration } from './model.ts';

const DAY = 86_400_000;
export function calendarDay(date: DateOnly): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected YYYY-MM-DD');
  const time = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date)
    throw new Error('Invalid calendar date');
  return time / DAY;
}
export function addDays(date: DateOnly, days: number): DateOnly {
  if (!Number.isSafeInteger(days) || days < 0) throw new Error('Invalid duration');
  const result = new Date((calendarDay(date) + days) * DAY).toISOString().slice(0, 10);
  calendarDay(result);
  return result;
}
export function exactExpiration(date: DateOnly, recordedOn: DateOnly, originalInput = date): Expiration {
  calendarDay(date); calendarDay(recordedOn);
  if (!originalInput.trim()) throw new Error('Original input is required');
  return { kind: 'exact', originalInput, recordedOn, date };
}
export function estimatedExpiration(
  value: number, unit: 'days' | 'weeks', recordedOn: DateOnly, originalInput: string,
): Expiration {
  if (!Number.isSafeInteger(value) || value < 0 || !['days', 'weeks'].includes(unit))
    throw new Error('Use a nonnegative whole number of days or weeks');
  if (!originalInput.trim()) throw new Error('Original input is required');
  return { kind: 'estimate', originalInput, recordedOn, duration: { value, unit },
    estimatedDate: addDays(recordedOn, value * (unit === 'weeks' ? 7 : 1)) };
}
export function expirationStatus(expiration: Expiration, today: DateOnly, warningDays = 3) {
  if (!Number.isSafeInteger(warningDays) || warningDays < 0) throw new Error('Invalid warning threshold');
  const date = expiration.kind === 'exact' ? expiration.date : expiration.estimatedDate;
  const daysRemaining = calendarDay(date) - calendarDay(today);
  return {
    date, daysRemaining, isEstimated: expiration.kind === 'estimate',
    status: daysRemaining < 0 ? 'past-date' : daysRemaining <= warningDays ? 'due-soon' : 'later',
  } as const;
}
