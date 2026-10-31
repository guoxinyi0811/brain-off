import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createSampleFridge } from '../src/config/sample-fridge.ts';
import { exactExpiration } from '../src/domain/expiration.ts';

test('actual map markup retains physical controls, bounded previews, separate quantities and explicit attention labels', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { Fridge } = await server.ssrLoadModule('/src/ui/Fridge.tsx');
    const state = createSampleFridge();
    state.items = [
      { id: 'a', name: '临期牛奶', locationId: 'upper-shelf', expiration: exactExpiration('2026-10-31', '2026-10-31'), quantity: { value: 3, unit: '盒' } },
      { id: 'b', name: '另一批牛奶', locationId: 'upper-shelf', expiration: exactExpiration('2026-11-10', '2026-10-31'), quantity: { value: 500, unit: 'ml' } },
      { id: 'c', name: '待确认食品', locationId: 'upper-shelf', expiration: null },
      { id: 'd', name: '黄油', locationId: 'door-upper-left', expiration: null },
      { id: 'e', name: '味噌', locationId: 'door-upper-left', expiration: null },
    ];
    const markup = renderToStaticMarkup(createElement(Fridge, { state, selected: 'door-upper-left', today: '2026-10-31', onSelect: () => {} }));
    const buttons = markup.match(/<button\b[\s\S]*?<\/button>/g)!;
    assert.equal(buttons.length, 13);
    const shelf = buttons.find(button => button.includes('data-location-id="upper-shelf"'))!;
    assert.match(shelf, /3 条库存，1 条临近到期，1 条保质期待确认/);
    assert.match(shelf, /临期牛奶 · 3 盒/);
    assert.match(shelf, /另一批牛奶 · 500 ml/);
    assert.doesNotMatch(shelf, /class="region-item-name"[^>]*>待确认食品/);
    assert.match(shelf, /region-more-wide">\+1/);
    assert.match(shelf, /region-more-compact">\+2/);
    const basket = buttons.find(button => button.includes('data-location-id="door-upper-left"'))!;
    assert.match(basket, /aria-pressed="true"/);
    assert.match(basket, /aria-controls="location-details"/);
    assert.equal((basket.match(/class="region-item-name"/g) ?? []).length, 1);
    assert.match(basket, /region-more-wide">\+1/);
    assert.doesNotMatch(markup, /NaN|undefined/);
    state.items = Array.from({ length: 101 }, (_, index) => ({ id: String(index), name: '独立批次', locationId: 'upper-shelf', expiration: null }));
    const crowded = renderToStaticMarkup(createElement(Fridge, { state, selected: 'upper-shelf', today: '2026-10-31', onSelect: () => {} }));
    assert.match(crowded, /101 条库存，101 条保质期待确认/);
    assert.match(crowded, /title="101 条库存">99\+/);
    assert.equal((crowded.match(/class="region-item-name"/g) ?? []).length, 2);
  } finally { await server.close(); }
});
