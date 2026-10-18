import type { Expiration } from '../domain/model.ts';
import { estimatedExpiration, exactExpiration } from '../domain/expiration.ts';

export interface ExpirationInput {
  existing?: Expiration;
  changed: boolean;
  mode: 'exact' | 'estimate';
  date: string;
  duration: string;
  unit: 'days' | 'weeks';
  today: string;
}

export function resolveExpirationInput(input: ExpirationInput): Expiration {
  if (input.existing && !input.changed) return input.existing;
  if (input.mode === 'exact') return exactExpiration(input.date, input.today, input.date);
  if (!input.duration.trim()) throw new Error('请填写预计剩余时长。');
  return estimatedExpiration(Number(input.duration), input.unit, input.today,
    `约 ${input.duration} ${input.unit === 'days' ? '天' : '周'}`);
}
