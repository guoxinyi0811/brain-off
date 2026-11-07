import test from 'node:test';
import assert from 'node:assert/strict';
import { mountReviewApp } from './helpers/mount-review-app.ts';

test('review control: first reminder click focuses and scrolls to its actual region without changing stock', async () => {
  const app = await mountReviewApp();
  try {
    await app.click(app.reminder('测试牛奶'));
    assert.deepEqual(app.scrolls, ['lower-shelf']);
    assert.equal((app.document.activeElement as HTMLElement).dataset.locationId, 'lower-shelf');
    assert.equal(app.document.querySelector('[data-location-id="lower-shelf"]')?.getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await app.readStock(), app.stock);
  } finally { await app.dispose(); }
});

test('review regression: clicking the same reminder again must focus and scroll again after returning to reminders', async () => {
  const app = await mountReviewApp();
  try {
    const reminder = app.reminder('测试牛奶');
    await app.click(reminder);
    assert.deepEqual(app.scrolls, ['lower-shelf'], 'First navigation must work before testing repetition');
    app.scrolls.length = 0;
    await app.click(reminder);
    assert.deepEqual(await app.readStock(), app.stock);
    assert.deepEqual(app.scrolls, ['lower-shelf'], 'A second explicit request must perform a second scroll');
    assert.equal((app.document.activeElement as HTMLElement).dataset.locationId, 'lower-shelf');
  } finally { await app.dispose(); }
});

test('review control: locating a different reminder updates the selected region, focus and scroll target', async () => {
  const app = await mountReviewApp();
  try {
    await app.click(app.reminder('测试牛奶')); app.scrolls.length = 0;
    await app.click(app.reminder('测试黄油'));
    assert.deepEqual(app.scrolls, ['door-upper-left']);
    assert.equal((app.document.activeElement as HTMLElement).dataset.locationId, 'door-upper-left');
    assert.equal(app.document.querySelector('[data-location-id="door-upper-left"]')?.getAttribute('aria-pressed'), 'true');
    assert.equal(app.document.querySelector('[data-location-id="lower-shelf"]')?.getAttribute('aria-pressed'), 'false');
    assert.deepEqual(await app.readStock(), app.stock);
  } finally { await app.dispose(); }
});
