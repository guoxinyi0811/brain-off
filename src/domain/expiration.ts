import type { DateOnly, Expiration, ShelfLife } from './model.ts';

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
export function productionExpiration(producedOn: DateOnly, duration: ShelfLife, recordedOn: DateOnly): Expiration {
  calendarDay(producedOn); calendarDay(recordedOn);
  if (producedOn > recordedOn) throw new Error('生产日期不能晚于今天。');
  if (!Number.isSafeInteger(duration.value) || duration.value < 0 || !['days', 'weeks', 'months'].includes(duration.unit))
    throw new Error('请填写非负整数保质期。');
  let date: string;
  if (duration.unit === 'months') {
    const original = new Date(`${producedOn}T00:00:00Z`);
    const target = new Date(original); target.setUTCDate(1); target.setUTCMonth(target.getUTCMonth() + duration.value);
    const end = new Date(target); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0);
    target.setUTCDate(Math.min(original.getUTCDate(), end.getUTCDate()));
    date = target.toISOString().slice(0, 10); calendarDay(date);
  } else date = addDays(producedOn, duration.value * (duration.unit === 'weeks' ? 7 : 1));
  const unit = { days: '天', weeks: '周', months: '个月' }[duration.unit];
  return { kind: 'production', originalInput: `${producedOn} 生产 · 保质期 ${duration.value} ${unit}`,
    recordedOn, producedOn, duration: { ...duration }, date };
}
export function expirationStatus(expiration: Expiration | null, today: DateOnly, warningDays = 3) {
  if (!Number.isSafeInteger(warningDays) || warningDays < 0) throw new Error('Invalid warning threshold');
  calendarDay(today);
  if (expiration === null) return { date: null, daysRemaining: Infinity, isEstimated: false, status: 'unknown' } as const;
  const date = expiration.kind === 'exact' || expiration.kind === 'production' ? expiration.date : expiration.estimatedDate;
  const daysRemaining = calendarDay(date) - calendarDay(today);
  return {
    date, daysRemaining, isEstimated: expiration.kind === 'estimate' || expiration.kind === 'automatic',
    status: daysRemaining < 0 ? 'past-date' : daysRemaining <= warningDays ? 'due-soon' : 'later',
  } as const;
}
