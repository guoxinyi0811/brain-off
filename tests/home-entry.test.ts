import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createSampleFridge } from '../src/config/sample-fridge.ts';
import { estimatedExpiration } from '../src/domain/expiration.ts';
import { parseEntryDraft } from '../src/domain/entry-draft.ts';

test('home search and add have independent native form actions, with add disabled when unavailable', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { HomeActions } = await server.ssrLoadModule('/src/ui/HomeActions.tsx');
    const props = { search: '牛奶', busy: false, canAdd: true, onChange: () => {}, onSearch: () => {}, onAdd: () => {} };
    const markup = renderToStaticMarkup(createElement(HomeActions, props));
    assert.match(markup, /role="search" aria-label="搜索全部库存"/);
    assert.match(markup, /type="search"[^>]*value="牛奶"/);
    assert.match(markup, /<button type="submit"[^>]*>查找<\/button>/);
    assert.match(markup, /<button type="button"[^>]*>＋ 添加食物<\/button>/);
    assert.doesNotMatch(markup, /disabled/);
    for (const unavailable of [{ busy: true }, { canAdd: false }]) {
      const blocked = renderToStaticMarkup(createElement(HomeActions, { ...props, ...unavailable }));
      assert.match(blocked, /<button type="button"[^>]*disabled=""[^>]*>＋ 添加食物/);
      assert.doesNotMatch(blocked, /<button type="submit"[^>]*disabled/);
    }
  } finally { await server.close(); }
});

test('global forms start without a location; contextual forms and edits retain location and expiration provenance', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  // Server rendering runs no effects or event handlers and never requests browser permissions.
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { activeElement: null } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { isSecureContext: false } });
  try {
    const { ItemForm } = await server.ssrLoadModule('/src/ui/ItemForm.tsx');
    const state = createSampleFridge();
    const original = structuredClone(state);
    let writes = 0;
    const props = { state, locationId: '', busy: false, onClose: () => {}, onSave: async () => { writes++; } };
    const globalForm = renderToStaticMarkup(createElement(ItemForm, props));
    assert.match(globalForm, /位置<select required=""><option value="" selected="">选择位置/);
    assert.match(globalForm, /选择位置后显示到期日/);
    assert.doesNotMatch(globalForm, /冷冻暂不自动估算/);
    const contextual = renderToStaticMarkup(createElement(ItemForm, { ...props, locationId: 'lower-shelf' }));
    assert.match(contextual, /<option value="lower-shelf" selected="">/);
    const expiration = estimatedExpiration(7, 'days', '2026-10-19', '约七天');
    const item = { id: 'existing', name: '牛奶', locationId: 'door-top', expiration, quantity: { value: 3, unit: '盒' } };
    const edited = renderToStaticMarkup(createElement(ItemForm, { ...props, locationId: 'lower-shelf', item }));
    assert.match(edited, /<option value="door-top" selected="">/);
    assert.match(edited, /2026-10-26/);
    assert.match(edited, /约七天 · 记录于 2026-10-19/);
    assert.match(edited, /保留原记录/);
    assert.equal(writes, 0); assert.deepEqual(state, original);
    const unknown = parseEntryDraft('牛奶还有七天', 'text', state, '', '2026-11-06');
    assert.equal(unknown.locationId, '');
    const recommended = parseEntryDraft('鸡蛋还有七天', 'text', state, '', '2026-11-06');
    assert.equal(recommended.locationId, 'lower-shelf');
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    await server.close();
  }
});
