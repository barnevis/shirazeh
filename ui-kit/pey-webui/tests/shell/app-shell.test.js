// Verifies the AppShell slot/host contract, presentation states, and tokens.

import '../setup-dom.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSharedState } from '../../shared-state.js';
import { AppShell, TAG } from '../../shell/app-shell.js';

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createEvents() {
  return {
    subscribe: () => () => {},
    publish: () => ({ success: true }),
  };
}

function createCountingEvents() {
  const active = new Set();
  return {
    subscribe(type, listener) {
      const entry = { type, listener };
      active.add(entry);
      return () => active.delete(entry);
    },
    publish() {
      return { success: true };
    },
    subscriptionCount() {
      return active.size;
    },
  };
}

function appendExpectError(element, code) {
  return new Promise((resolve, reject) => {
    const onError = (event) => {
      window.removeEventListener('error', onError);
      if (event.error?.code === code) resolve();
      else reject(new Error(`expected error code ${code}, received ${event.error?.code}`));
    };
    window.addEventListener('error', onError);
    document.body.append(element);
  });
}

class SubscribedShell extends AppShell {
  subscriptions() {
    return { ['test:shell']: () => {} };
  }

  eventTypes() {
    return ['test-shell-event'];
  }
}
customElements.define('pey-app-shell-subscribed', SubscribedShell);

function createElement() {
  const element = document.createElement(TAG);
  element.connect({
    infrastructure: { events: createEvents() },
    refs: {},
  });
  document.body.append(element);
  return element;
}

function createCountingSharedState(failOnSubscribeKey = null) {
  const values = new Map();
  const listeners = new Map();
  return {
    get(key) {
      return values.get(key);
    },
    set(key, value) {
      values.set(key, value);
      for (const listener of listeners.get(key) ?? []) {
        listener(value);
      }
    },
    subscribe(key, listener) {
      if (key === failOnSubscribeKey) {
        throw new Error(`boom on ${key}`);
      }
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(listener);
      return () => listeners.get(key).delete(listener);
    },
    subscriptionCount() {
      let count = 0;
      for (const entry of listeners.values()) {
        count += entry.size;
      }
      return count;
    },
  };
}

test('should_render_page_page_slot_and_chrome_when_connected', async () => {
  const element = createElement();
  await flush();

  const page = element.shadowRoot.querySelector('main[part="page"]');
  assert.ok(page, 'expected a page landmark');
  assert.equal(page.querySelector('slot').getAttribute('name'), 'page');
  assert.equal(
    element.shadowRoot.querySelector('[part="chrome"] > slot').getAttribute('name'),
    'extension',
  );
  assert.equal(
    element.shadowRoot.querySelector('[part="chrome-end"] > slot').getAttribute('name'),
    'extension-end',
  );
});

test('should_slot_page_content_into_the_page_host', async () => {
  const element = createElement();
  const pageContent = document.createElement('section');
  pageContent.slot = 'page';
  element.append(pageContent);
  await flush();

  assert.equal(pageContent.assignedSlot.name, 'page');
});

test('should_slot_consumer_chrome_into_extension_slots', async () => {
  const element = createElement();
  const chromeStart = document.createElement('nav');
  const chromeEnd = document.createElement('footer');
  chromeStart.slot = 'extension';
  chromeEnd.slot = 'extension-end';
  element.append(chromeStart, chromeEnd);
  await flush();

  assert.equal(chromeStart.assignedSlot.name, 'extension');
  assert.equal(chromeEnd.assignedSlot.name, 'extension-end');
});

test('should_contain_no_product_layout_when_only_page_is_slotted', async () => {
  const element = createElement();
  await flush();

  const shadowHtml = element.shadowRoot.innerHTML;
  assert.equal(shadowHtml.includes('<header'), false);
  assert.equal(shadowHtml.includes('<nav'), false);
  assert.equal(shadowHtml.includes('<aside'), false);
  assert.equal(shadowHtml.includes('<footer'), false);
});

test('should_not_redirect_focus_away_from_slotted_content', async () => {
  const element = createElement();
  const pageContent = document.createElement('button');
  pageContent.slot = 'page';
  element.append(pageContent);
  await flush();
  pageContent.focus();

  assert.equal(document.activeElement, pageContent);
});

test('should_consume_tokens_through_css_variables_in_shadow_style', async () => {
  const element = createElement();
  await flush();

  const styleText = element.shadowRoot.querySelector('style').textContent;
  assert.match(styleText, /var\(--pey-color-text\)/);
  assert.match(styleText, /var\(--pey-color-canvas\)/);
  assert.match(styleText, /var\(--pey-font-family-base\)/);
});

test('should_use_logical_css_properties_in_shell_style', async () => {
  const element = createElement();
  await flush();

  const styleText = element.shadowRoot.querySelector('style').textContent;
  assert.match(styleText, /min-block-size/);
  assert.doesNotMatch(styleText, /(^|[^-\w])(height|width|margin-left|margin-right|padding-left|padding-right):/);
});

test('should_reflect_theme_and_direction_from_connection_refs', async () => {
  const element = document.createElement(TAG);
  element.connect({
    infrastructure: { events: createEvents() },
    refs: { theme: 'dark', direction: 'rtl' },
  });

  assert.equal(element.getAttribute('data-theme'), 'dark');
  assert.equal(element.getAttribute('dir'), 'rtl');
});

test('should_keep_ref_presentation_values_when_shared_state_has_no_value', async () => {
  const sharedState = createCountingSharedState();
  const element = document.createElement(TAG);
  element.connect({
    infrastructure: { events: createEvents() },
    refs: { sharedState, theme: 'dark', direction: 'rtl' },
  });
  document.body.append(element);
  await flush();

  assert.equal(element.getAttribute('data-theme'), 'dark');
  assert.equal(element.getAttribute('dir'), 'rtl');
});

test('should_reject_invalid_shared_state_facade_in_connect', () => {
  const element = document.createElement(TAG);
  assert.throws(
    () => element.connect({
      infrastructure: { events: createEvents() },
      refs: { sharedState: { get: () => undefined } },
    }),
    (error) => error.code === 'PEY_SHELL_INVALID_SHARED_STATE',
  );
});

test('should_follow_shared_state_theme_changes', async () => {
  const sharedState = createSharedState();
  const element = document.createElement(TAG);
  element.connect({
    infrastructure: { events: createEvents() },
    refs: { sharedState },
  });
  document.body.append(element);
  await flush();

  sharedState.set('theme', 'dark');
  assert.equal(element.getAttribute('data-theme'), 'dark');
});

test('should_follow_shared_state_direction_changes', async () => {
  const sharedState = createSharedState();
  const element = document.createElement(TAG);
  element.connect({
    infrastructure: { events: createEvents() },
    refs: { sharedState },
  });
  document.body.append(element);
  await flush();

  sharedState.set('direction', 'rtl');
  assert.equal(element.getAttribute('dir'), 'rtl');
});

test('should_reflect_shared_state_values_on_reconnect', async () => {
  const sharedState = createSharedState();
  sharedState.set('theme', 'dark');
  sharedState.set('direction', 'rtl');
  const element = document.createElement(TAG);
  element.connect({
    infrastructure: { events: createEvents() },
    refs: { sharedState },
  });
  document.body.append(element);
  await flush();

  assert.equal(element.getAttribute('data-theme'), 'dark');
  assert.equal(element.getAttribute('dir'), 'rtl');
});

test('should_unsubscribe_shared_state_on_disconnect', async () => {
  const sharedState = createCountingSharedState();
  const element = document.createElement(TAG);
  element.connect({
    infrastructure: { events: createEvents() },
    refs: { sharedState },
  });
  document.body.append(element);
  await flush();

  assert.equal(sharedState.subscriptionCount(), 2);
  element.remove();
  assert.equal(sharedState.subscriptionCount(), 0);

  sharedState.set('theme', 'light');
  assert.equal(element.getAttribute('data-theme'), null);
});

test('should_roll_back_full_lifecycle_when_shared_state_subscribe_fails', async () => {
  const events = createCountingEvents();
  const sharedState = createCountingSharedState('direction');
  const element = document.createElement('pey-app-shell-subscribed');
  element.connect({ infrastructure: { events }, refs: { sharedState } });

  await appendExpectError(element, 'PEY_SHELL_SHARED_STATE_SUBSCRIBE_FAILED');

  assert.equal(sharedState.subscriptionCount(), 0);
  assert.equal(events.subscriptionCount(), 0);
  assert.equal(element.getAttribute('data-theme'), null);
});

test('should_log_unsubscribe_failure_and_keep_rolling_back', async () => {
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.join(' '));
  try {
    const listeners = new Map();
    const sharedState = {
      get() { return undefined; },
      set() {},
      subscribe(key, listener) {
        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key).add(listener);
        return () => {
          listeners.get(key).delete(listener);
          throw new TypeError('simulated unsubscribe failure');
        };
      },
      subscriptionCount() {
        let count = 0;
        for (const entry of listeners.values()) count += entry.size;
        return count;
      },
    };

    const element = document.createElement(TAG);
    const events = createCountingEvents();
    element.connect({ infrastructure: { events }, refs: { sharedState } });
    document.body.append(element);
    await flush();

    assert.equal(sharedState.subscriptionCount(), 2);
    element.remove();
    assert.equal(sharedState.subscriptionCount(), 0);
    assert.equal(events.subscriptionCount(), 0);
  } finally {
    console.error = originalError;
  }
  assert.ok(
    errors.some((line) => line.includes('PEY_SHELL_SHARED_STATE_UNSUBSCRIBE_FAILED')),
    'expected the unsubscribe failure code to be logged',
  );
});

test('should_reject_second_connect_after_shell_was_connected', () => {
  const element = document.createElement(TAG);
  const events = createEvents();
  element.connect({ infrastructure: { events }, refs: {} });

  assert.throws(
    () => element.connect({ infrastructure: { events }, refs: {} }),
    (error) => error.code === 'PEY_ELEMENT_ALREADY_CONNECTED',
  );
});

test('should_export_shell_class_and_tag', () => {
  assert.equal(typeof AppShell, 'function');
  assert.equal(TAG, 'pey-app-shell');
  assert.equal(customElements.get(TAG), AppShell);
});