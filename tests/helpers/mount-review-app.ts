import assert from 'node:assert/strict';
import { act, createElement, StrictMode } from 'react';
import type { Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { IDBFactory } from 'fake-indexeddb';
import { createServer } from 'vite';
import { createSampleFridge } from '../../src/config/sample-fridge.ts';
import { IndexedDbRepository } from '../../src/persistence/indexeddb.ts';

/** Actual App/hooks and DOM events; only the browser environment and scrolling are simulated. */
export async function mountReviewApp() {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'https://brain-off.test/' });
  const factory = new IDBFactory();
  Object.defineProperty(dom.window, 'indexedDB', { configurable: true, value: factory });
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const globals: Record<string, unknown> = {
    window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
    BroadcastChannel: class { onmessage = null; postMessage() {} close() {} },
  };
  for (const [name, value] of Object.entries(globals)) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const scrolls: string[] = [];
  dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolls.push(this.dataset.locationId ?? this.id); };
  const stock = createSampleFridge();
  stock.items = [
    { id: 'review-milk', name: '测试牛奶', locationId: 'lower-shelf', expiration: null },
    { id: 'review-butter', name: '测试黄油', locationId: 'door-upper-left', expiration: null },
  ];
  const seed = new IndexedDbRepository({ factory, legacy: () => dom.window.localStorage });
  let root: Root | undefined;
  async function dispose() {
    if (root) await act(async () => { root!.unmount(); });
    await seed.close(); await server.close(); dom.window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
  try {
    await seed.load(); await seed.save(stock); await seed.close();
    const { App } = await server.ssrLoadModule('/src/ui/App.tsx');
    const { createRoot } = await import('react-dom/client');
    root = createRoot(dom.window.document.getElementById('root')!);
    await act(async () => { root!.render(createElement(StrictMode, null, createElement(App))); });
    const deadline = Date.now() + 3000;
    while (!dom.window.document.querySelector('.due-items') && Date.now() < deadline) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    }
    assert.ok(dom.window.document.querySelector('.due-items'), 'App must load isolated fixture inventory before assertions');
    return {
      document: dom.window.document, scrolls, stock, dispose,
      reminder(name: string) {
        const button = Array.from(dom.window.document.querySelectorAll<HTMLButtonElement>('.due-items button'))
          .find(node => node.textContent?.startsWith(name));
        assert.ok(button, `Missing fixture reminder: ${name}`); return button;
      },
      async click(button: HTMLButtonElement) {
        await act(async () => { button.focus(); button.click(); });
      },
      async readStock() {
        const reader = new IndexedDbRepository({ factory, legacy: () => dom.window.localStorage });
        try { return await reader.load(); } finally { await reader.close(); }
      },
    };
  } catch (error) { await dispose(); throw error; }
}
