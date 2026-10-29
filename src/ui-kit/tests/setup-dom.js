// Installs the shared jsdom environment for Web Component tests.

import { JSDOM, VirtualConsole } from 'jsdom';

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', () => {});

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://example.test/ui/index.html',
  pretendToBeVisual: true,
  virtualConsole,
});

for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  customElements: dom.window.customElements,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  Event: dom.window.Event,
  CustomEvent: dom.window.CustomEvent,
})) {
  globalThis[name] = value;
}

export { dom };
