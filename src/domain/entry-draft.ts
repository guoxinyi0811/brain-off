import type { InventoryItem, InventoryState, ShelfLife } from './model.ts';
import { calendarDay } from './expiration.ts';
import { orderedStorageLocations, suggestLocations } from './placement.ts';
import { quantityInput } from './quantity.ts';

export interface EntryDraft {
  name: string; quantity: InventoryItem['quantity']; locationId: string;
  mode: 'automatic' | 'estimate' | 'production'; date: string; duration: string; unit: ShelfLife['unit'];
  reviewExpiration: boolean; reviewLocation: boolean; issues: string[];
  entry: NonNullable<InventoryItem['entry']>;
}
const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function spokenNumber(text: string): number {
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text === '半') return .5;
  const parts = text.split('点');
  if (parts.length > 2 || !parts[0]) throw new Error('数字不明确');
  const integer = parts[0]; let value = 0;
  if (/^[零〇一二两三四五六七八九]+$/.test(integer)) value = Number([...integer].map(c => digits[c]).join(''));
  else {
    let pending = 0; let lastUnit = Infinity;
    for (const c of integer) {
      if (c in digits) { if (pending && digits[c]) throw new Error('数字不明确'); pending = digits[c]!; }
      else {
        const unit = ({ 十: 10, 百: 100, 千: 1000 } as Record<string, number>)[c];
        if (!unit || unit >= lastUnit) throw new Error('数字不明确');
        value += (pending || 1) * unit; pending = 0; lastUnit = unit;
      }
    }
    if (pending && lastUnit >= 100 && !/[零〇]/.test(integer)) throw new Error('数字不明确，请使用完整数字或阿拉伯数字。');
    value += pending;
  }
  if (parts[1] !== undefined) {
    if (!/^[零〇一二两三四五六七八九]+$/.test(parts[1])) throw new Error('小数不明确');
    value += Number(`0.${[...parts[1]].map(c => digits[c]).join('')}`);
  }
  if (!Number.isFinite(value)) throw new Error('数字无效');
  return value;
}
const number = '[0-9零〇一二两三四五六七八九十百千点半]+(?:\\.[0-9]+)?';
const fullDate = `${number}\\s*[年/-]\\s*${number}\\s*[月/-]\\s*${number}\\s*日?`;
const partialDate = `${number}\\s*月\\s*${number}\\s*日?`;
const productionPrefix = '生产(?:日期)?(?:是|为|于)?';
const uncertainDate = '(?:可能(?:是)?|也许|大概|大约|约|不确定|好像(?:是)?|或许|差不多(?:是)?|估计(?:是)?)';
const productionClause = `(?:(?:${uncertainDate}\\s*)?(?:${fullDate}|${partialDate})\\s*生产(?:的)?|${productionPrefix}\\s*(?:${uncertainDate}\\s*)?(?:${fullDate}|${partialDate}))`;
const unknownClause = '(?:保质期(?:不清楚|不知道|未知|不确定)|(?:没有|不知道|不清楚)保质期)';
const remainingPrefix = '(?:保质期)?(?:预计)?(?:剩余|还剩|还有|还能放|可放|能放)';
const locationPrefix = '(?:放到|放在?|存到|位置(?:是|为)?)';

/** Split only explicit field phrases; complete production phrases keep their date together. */
function spokenClauses(text: string): string[] {
  const boundary = new RegExp(`(${productionClause})|${unknownClause}|${remainingPrefix}|保质期(?:为|是)?|${locationPrefix}|生产日期(?:是|为)?|生产于`, 'g');
  return text.split(/[，,。；;\n]+/).flatMap(clause => clause
    .replace(boundary, (match: string, production: string | undefined) => production ? `,${match},` : `,${match}`)
    .split(',').map(value => value.trim()).filter(Boolean));
}
function duration(text: string): { duration: string; unit: ShelfLife['unit'] } | null {
  const match = text.trim().match(new RegExp(`^(${number})\\s*(天|日|周|星期|个月|月)$`));
  if (!match) return null;
  if (/^[零〇一二两三四五六七八九]{2,}$/.test(match[1]!)) return null; // 两三天 is a range, not 23 days.
  const value = spokenNumber(match[1]!);
  if (!Number.isSafeInteger(value) || value < 0) return null;
  return { duration: String(value), unit: /月/.test(match[2]!) ? 'months' : /周|星期/.test(match[2]!) ? 'weeks' : 'days' };
}
function locationKey(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/refrigerator/g, '冷藏室').replace(/freezer/g, '冷冻室')
    .replace(/[零〇一二两三四五六七八九十百千]+/g, value => String(spokenNumber(value)))
    .replace(/[\s/·第室]/g, '');
}
function locationMatches(state: InventoryState, text: string): string[] {
  const key = locationKey(text);
  return orderedStorageLocations(state).filter(node => {
    const parent = state.locations.find(n => n.id === node.parentId);
    return [node.label, `${parent?.label ?? ''}/${node.label}`].some(name => locationKey(name) === key);
  }).map(node => node.id);
}

/** Deliberately limited, deterministic one-food grammar. Never writes inventory. */
export function parseEntryDraft(raw: string, kind: 'speech' | 'text', state: InventoryState, currentLocation: string, today: string): EntryDraft {
  const text = raw.normalize('NFKC').trim(); calendarDay(today);
  if (!text || text.length > 500 || raw.trim().length > 500) throw new Error('请输入一句话，最多 500 个字符。');
  const result: EntryDraft = { name: '', quantity: undefined, locationId: currentLocation, mode: 'automatic', date: '', duration: '', unit: 'days',
    reviewExpiration: false, reviewLocation: false, issues: [], entry: { kind, text: raw.trim(), recordedOn: today } };
  const foods: string[] = []; const remains: string[] = []; const shelfLives: string[] = []; const productions: string[] = []; const locations: string[] = [];
  for (const clause of spokenClauses(text)) {
    if (new RegExp(`^${unknownClause}$`).test(clause)) continue;
    if (new RegExp(`^${locationPrefix}`).test(clause)) {
      locations.push(clause.replace(new RegExp(`^${locationPrefix}`), '')); continue;
    }
    if (/生产/.test(clause)) { productions.push(clause); continue; }
    const remaining = clause.match(new RegExp(`^${remainingPrefix}(.*)$`));
    if (remaining) {
      remains.push(remaining[1]!); continue;
    }
    if (/^保质期/.test(clause)) { shelfLives.push(clause.replace(/^保质期(?:为|是)?/, '')); continue; }
    foods.push(clause.replace(/^(?:我买了|买了|添加)\s*/, ''));
  }
  if (foods.length !== 1 || /[、和]|以及/.test(foods[0]!)) throw new Error('目前一次录入一种食物；复杂表达请用逗号分隔食物、保质期和位置。');
  const food = foods[0]!;
  if (productions.length && (new RegExp(fullDate).test(food) || new RegExp(`${uncertainDate}$|(?:或者?|到|至)$`).test(food)))
    throw new Error('日期或食物不明确，请用逗号分隔并填写唯一的完整生产日期。');
  const units = '千克|公斤|毫升|升|kg|ml|g|l|个|盒|瓶|袋|份|罐|包|斤';
  if (new RegExp(`(?:${number})\\s*(?:到|至|[-~～—])\\s*(?:${number})\\s*(?:${units})|[-负]\\s*(?:${number})\\s*(?:${units})`, 'i').test(food))
    throw new Error('数量有范围或符号歧义，请填写明确的正数。');
  const prefix = food.match(new RegExp(`^(${number})\\s*(${units})\\s*(.+)$`, 'i'));
  const suffix = prefix ? null : food.match(new RegExp(`^(.+?)\\s*(${number})\\s*(${units})$`, 'i'));
  result.name = (prefix?.[3] ?? suffix?.[1] ?? food).trim();
  if (prefix || suffix) {
    const spokenAmount = (prefix?.[1] ?? suffix?.[2])!;
    if (/^[零〇一二两三四五六七八九]{2,}$/.test(spokenAmount) || prefix && /^半/.test(result.name)) throw new Error('数量不明确，请使用明确数字或小数。');
    const amount = spokenNumber(spokenAmount); const unit = (prefix?.[2] ?? suffix?.[3])!;
    if (new RegExp(`${number}\\s*(?:${units})`, 'i').test(result.name)) throw new Error('数量或食物不明确，请一次录入一种食物。');
    result.quantity = quantityInput(String(amount), unit);
  }
  if (!result.name || result.name.length > 100) throw new Error('请明确食物名称，最多 100 个字符。');
  if (productions.length || shelfLives.length) {
    result.mode = 'production';
    const production = productions.length === 1 ? productions[0]!.match(new RegExp(`^(?:(${fullDate})\\s*生产(?:的)?|${productionPrefix}\\s*(${fullDate}))$`)) : null;
    const match = production ? (production[1] ?? production[2])!.match(new RegExp(`^(${number})\\s*[年/-]\\s*(${number})\\s*[月/-]\\s*(${number})\\s*日?$`)) : null;
    if (match) {
      try {
        const year = spokenNumber(match[1]!), month = spokenNumber(match[2]!), day = spokenNumber(match[3]!);
        const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        calendarDay(date); if (date > today || year < 1000 || year > 9999) throw new Error(); result.date = date;
      } catch { result.reviewExpiration = true; }
    }
    const life = shelfLives.length === 1 ? duration(shelfLives[0]!) : null;
    if (life) Object.assign(result, life);
    if (!result.date || !life || remains.length) result.reviewExpiration = true;
  } else if (remains.length) {
    result.mode = 'estimate'; const remaining = remains.length === 1 ? duration(remains[0]!) : null;
    if (remaining && remaining.unit !== 'months') Object.assign(result, remaining);
    else result.reviewExpiration = true;
  }
  if (result.reviewExpiration) result.issues.push('保质期不完整或有歧义，请在表单中确认。');
  if (locations.length) {
    const matches = locations.length === 1 ? locationMatches(state, locations[0]!) : [];
    if (matches.length === 1) result.locationId = matches[0]!;
    else { result.reviewLocation = true; result.issues.push('位置没有唯一匹配，请确认所选位置。'); }
  } else {
    const suggestions = suggestLocations(state, result.name);
    if (suggestions.length === 1) { result.locationId = suggestions[0]!.locationId; result.issues.push('位置已按储存用途匹配，可改选。'); }
  }
  return result;
}
