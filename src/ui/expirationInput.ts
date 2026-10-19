import type { Expiration } from '../domain/model.ts';
import { estimatedExpiration, exactExpiration, productionExpiration } from '../domain/expiration.ts';
import { automaticExpiration } from '../domain/food-estimates.ts';

export interface ExpirationInput {
  existing?: Expiration | null;
  changed: boolean;
  mode: 'exact' | 'estimate' | 'production' | 'automatic';
  date: string;
  duration: string;
  unit: 'days' | 'weeks' | 'months';
  today: string;
  foodType?: string;
  basisDate?: string;
  refrigerated?: boolean;
}

export function resolveExpirationInput(input: ExpirationInput): Expiration | null {
  if (input.existing !== undefined && !input.changed) return input.existing;
  if (input.mode === 'exact') return exactExpiration(input.date, input.today, input.date);
  if (input.mode === 'automatic' || !input.duration.trim() && (input.mode === 'estimate' || !input.date))
    return automaticExpiration(input.foodType ?? '', input.basisDate ?? input.today, input.today, input.refrigerated ?? false);
  if (input.mode === 'production') {
    if (!input.date || !input.duration.trim()) throw new Error('请同时填写生产日期和保质期时长。');
    return productionExpiration(input.date, { value: Number(input.duration), unit: input.unit }, input.today);
  }
  if (input.unit === 'months') throw new Error('剩余时长请使用天或周。');
  return estimatedExpiration(Number(input.duration), input.unit, input.today,
    `约 ${input.duration} ${input.unit === 'days' ? '天' : '周'}`);
}
