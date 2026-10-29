// jsdom tests for the PeyElement afterRender lifecycle hook: it must run
// against the markup render() just produced (including renders deferred by
// the stylesheet gate), stay silent when render() itself fails, and never
// tear down rendered content when the hook throws.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createEventsRecorder, createElement } from './setup-dom.js';

const { PeyElement } = await import('../../ui-kit/base/pey-element.js');

async function flushTasks(times = 3) {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

class HookElement extends PeyElement {
  seenMarkupReady = [];
  render() {
    return '<p class="done">ok</p>';
  }
  afterRender() {
    this.seenMarkupReady.push(this.shadowRoot.querySelector('.done') !== null);
  }
}
customElements.define('test-hook-element', HookElement);

class ThrowingRenderElement extends PeyElement {
  hookCalls = 0;
  render() {
    throw new Error('render failed');
  }
  afterRender() {
    this.hookCalls += 1;
  }
}
customElements.define('test-throwing-render-element', ThrowingRenderElement);

class ThrowingHookElement extends PeyElement {
  render() {
    return '<p class="done">ok</p>';
  }
  afterRender() {
    throw new Error('hook failed');
  }
}
customElements.define('test-throwing-hook-element', ThrowingHookElement);

class GatedElement extends PeyElement {
  seenMarkupReady = [];
  // Unique per instance: getStyleText caches resolved text by href.
  stylesheetHref() {
    this.#href ??= `http://127.0.0.1:8901/test-gated-${Math.random().toString(36).slice(2)}.css`;
    return this.#href;
  }
  #href = null;
  render() {
    return '<p class="done">ok</p>';
  }
  afterRender() {
    this.seenMarkupReady.push(this.shadowRoot.querySelector('.done') !== null);
  }
}
customElements.define('test-gated-element', GatedElement);

function mount(element) {
  const recorder = createEventsRecorder();
  element.connect({ infrastructure: { events: recorder.facade }, refs: {} });
  document.body.append(element);
  return { recorder };
}

test('should_call_afterRender_with_rendered_markup_after_flush', async () => {
  document.body.innerHTML = '';
  const element = createElement('test-hook-element');
  mount(element);
  await flushTasks();

  assert.deepEqual(element.seenMarkupReady, [true]);
  assert.equal(element.shadowRoot.querySelector('.done')?.textContent, 'ok');
});

test('should_not_call_afterRender_when_render_throws', async () => {
  document.body.innerHTML = '';
  const element = createElement('test-throwing-render-element');
  const { recorder } = mount(element);
  await flushTasks();

  assert.equal(element.hookCalls, 0);
  // The render failure takes its own boundary path (fallback + error event).
  assert.equal(recorder.published.some((entry) => entry.type === 'ui:component-error'), true);
});

test('should_keep_rendered_content_when_afterRender_throws', async () => {
  document.body.innerHTML = '';
  const element = createElement('test-throwing-hook-element');
  const { recorder } = mount(element);
  await flushTasks();

  // A hook failure is logged, never propagated into the render boundary:
  // the content render() produced must survive.
  assert.equal(element.shadowRoot.querySelector('.done')?.textContent, 'ok');
  assert.equal(element.shadowRoot.querySelector('[data-pey-fallback]'), null);
  assert.equal(recorder.published.some((entry) => entry.type === 'ui:component-error'), false);
});

test('should_call_afterRender_again_after_stylesheet_gate_defers_render', async () => {
  document.body.innerHTML = '';
  const element = createElement('test-gated-element');
  const originalFetch = globalThis.fetch;
  let resolveFetch;
  globalThis.fetch = () => new Promise((resolve) => {
    resolveFetch = resolve;
  });

  try {
    mount(element);
    await flushTasks();
    // The stylesheet is still loading: no contentful render (and no hook
    // call) has happened yet — this is the state that used to swallow the
    // docs page's post-render step.
    assert.deepEqual(element.seenMarkupReady, []);
    assert.equal(element.shadowRoot.querySelector('.done'), null);

    resolveFetch({ ok: true, status: 200, text: async () => 'p { color: red; }' });
    await flushTasks();
  } finally {
    globalThis.fetch = originalFetch;
  }

  // The gated re-render fires the hook against the fresh markup.
  assert.deepEqual(element.seenMarkupReady, [true]);
  assert.equal(element.shadowRoot.querySelector('.done')?.textContent, 'ok');
});
