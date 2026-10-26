// Shared jsdom bootstrap for UI component tests: installs window/document
// globals, a Event Bus facade recorder, and registers the components under
// test before importing them.

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1:8901/' });

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.customElements = dom.window.customElements;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Node = dom.window.Node;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.location = dom.window.location;
globalThis.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

export function createEventsRecorder() {
  const published = [];
  return {
    published,
    facade: {
      publish: (type, data) => {
        published.push({ type, data });
        return { success: true };
      },
      subscribe: () => () => {},
    },
  };
}

export async function importSidebarComponent() {
  await import('../../ui/components/shirazeh-sidebar.js');
}

export async function importTocComponent() {
  await import('../../ui/components/shirazeh-toc.js');
}

export function createElement(tag) {
  return document.createElement(tag);
}
