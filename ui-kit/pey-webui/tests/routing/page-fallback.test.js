// Verifies the internal page-fallback render states and recovery actions.

import '../setup-dom.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import { PageFallback, PAGE_FALLBACK_STATES, TAG } from '../../routing/page-fallback.js';

const MESSAGE_NOT_FOUND_KEY = 'pey.webui.errors.page-not-found';
const MESSAGE_LOAD_FAILED_KEY = 'pey.webui.errors.page-load-failed';

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createEvents() {
  return {
    subscribe: () => () => {},
    publish: () => ({ success: true }),
  };
}

function createElement(refs = {}) {
  const element = document.createElement(TAG);
  element.connect({
    infrastructure: { events: createEvents() },
    refs,
  });
  document.body.append(element);
  return element;
}

function messageOf(element) {
  return element.shadowRoot?.querySelector('[part="message"]')?.textContent;
}

function actionButton(element, action) {
  return element.shadowRoot?.querySelector(`button[data-action="${action}"]`);
}

test('should_render_not_found_message_key_for_not_found_state', async () => {
  const element = createElement({ state: PAGE_FALLBACK_STATES.NOT_FOUND });
  await flush();
  assert.equal(messageOf(element), MESSAGE_NOT_FOUND_KEY);
});

test('should_render_load_failed_message_key_for_load_failed_state', async () => {
  const element = createElement({ state: PAGE_FALLBACK_STATES.LOAD_FAILED });
  await flush();
  assert.equal(messageOf(element), MESSAGE_LOAD_FAILED_KEY);
});

test('should_render_retry_action_only_when_retry_is_available', async () => {
  const onRetry = () => {};
  const retryable = createElement({ state: PAGE_FALLBACK_STATES.LOAD_FAILED, canRetry: true, onRetry });
  await flush();
  assert.ok(actionButton(retryable, 'retry'), 'retry action must render when available');

  const plain = createElement({ state: PAGE_FALLBACK_STATES.LOAD_FAILED });
  await flush();
  assert.equal(actionButton(plain, 'retry'), null, 'retry action must not render without canRetry');

  const noHandler = createElement({ state: PAGE_FALLBACK_STATES.LOAD_FAILED, canRetry: true });
  await flush();
  assert.equal(actionButton(noHandler, 'retry'), null, 'retry action must not render without onRetry');

  const notFound = createElement({ state: PAGE_FALLBACK_STATES.NOT_FOUND, canRetry: true, onRetry });
  await flush();
  assert.equal(actionButton(notFound, 'retry'), null, 'not-found state must never offer retry');
});

test('should_render_go_back_only_when_router_exists_and_fallback_navigation_only_with_path', async () => {
  const router = { back: async () => {}, replace: async () => {} };
  const element = createElement({ state: PAGE_FALLBACK_STATES.LOAD_FAILED, router, fallbackPath: '/home' });
  await flush();
  assert.ok(actionButton(element, 'go-back'), 'go-back action must render with a router');
  assert.ok(actionButton(element, 'go-to-fallback'), 'fallback navigation must render with a path');

  const noPath = createElement({ state: PAGE_FALLBACK_STATES.LOAD_FAILED, router });
  await flush();
  assert.ok(actionButton(noPath, 'go-back'), 'go-back action must render without a path');
  assert.equal(actionButton(noPath, 'go-to-fallback'), null, 'fallback navigation must not render without a path');

  const noRouter = createElement({ state: PAGE_FALLBACK_STATES.LOAD_FAILED });
  await flush();
  assert.equal(actionButton(noRouter, 'go-back'), null, 'go-back action must not render without a router');
  assert.equal(actionButton(noRouter, 'go-to-fallback'), null, 'fallback navigation must not render without a router');
});

test('should_invoke_on_retry_when_retry_is_clicked', async () => {
  let retried = 0;
  const element = createElement({
    state: PAGE_FALLBACK_STATES.LOAD_FAILED,
    canRetry: true,
    onRetry: () => {
      retried += 1;
    },
  });
  await flush();
  actionButton(element, 'retry').click();
  assert.equal(retried, 1);
});

test('should_contain_throwing_or_rejecting_on_retry', async () => {
  const errorLogs = [];
  const originalError = console.error;
  console.error = (...args) => {
    errorLogs.push(args);
  };
  try {
    const throwing = createElement({
      state: PAGE_FALLBACK_STATES.LOAD_FAILED,
      canRetry: true,
      onRetry: () => {
        throw new Error('retry exploded');
      },
    });
    await flush();
    actionButton(throwing, 'retry').click();
    await flush();

    const rejecting = createElement({
      state: PAGE_FALLBACK_STATES.LOAD_FAILED,
      canRetry: true,
      onRetry: async () => {
        throw new Error('retry rejected');
      },
    });
    await flush();
    actionButton(rejecting, 'retry').click();
    await flush();

    assert.equal(
      errorLogs.filter((args) => args.some((arg) => String(arg).includes('PEY_PAGE_FALLBACK_RETRY_FAILED'))).length,
      2,
      'both retry failures must be logged with the stable code',
    );
  } finally {
    console.error = originalError;
  }
});

test('should_escape_translated_output_before_rendering', async () => {
  const element = createElement({
    state: PAGE_FALLBACK_STATES.NOT_FOUND,
    t: (key) => `<img src=x onerror="alert(1)">${key}`,
  });
  await flush();
  assert.equal(element.shadowRoot?.querySelector('img'), null, 'translated HTML must never be injected');
  assert.ok(
    element.shadowRoot?.querySelector('[part="message"]')?.innerHTML.includes('&lt;img'),
    'translated output must be escaped in the markup',
  );
  assert.equal(
    element.shadowRoot?.querySelector('[part="message"]')?.textContent.startsWith('<img src=x onerror="alert(1)">'),
    true,
    'the escaped text must decode to the original translation',
  );
});

test('should_invoke_router_back_when_go_back_is_clicked', async () => {
  let backed = 0;
  const router = {
    back: async () => {
      backed += 1;
    },
    replace: async () => {},
  };
  const element = createElement({ state: PAGE_FALLBACK_STATES.LOAD_FAILED, router });
  await flush();
  actionButton(element, 'go-back').click();
  await flush();
  assert.equal(backed, 1);
});

test('should_invoke_router_replace_with_fallback_path_when_go_to_fallback_is_clicked', async () => {
  let replaced = null;
  const router = {
    back: async () => {},
    replace: async (path) => {
      replaced = path;
    },
  };
  const element = createElement({ state: PAGE_FALLBACK_STATES.LOAD_FAILED, router, fallbackPath: '/home' });
  await flush();
  actionButton(element, 'go-to-fallback').click();
  await flush();
  assert.equal(replaced, '/home');
});

test('should_log_rejected_navigation_and_never_throw', async () => {
  const errorLogs = [];
  const originalError = console.error;
  console.error = (...args) => {
    errorLogs.push(args);
  };
  try {
    const router = {
      back: async () => {
        throw new Error('navigation exploded');
      },
      replace: async () => {},
    };
    const element = createElement({ state: PAGE_FALLBACK_STATES.LOAD_FAILED, router });
    await flush();
    actionButton(element, 'go-back').click();
    await flush();
    assert.ok(
      errorLogs.some((args) => args.some((arg) => String(arg).includes('PEY_PAGE_FALLBACK_NAVIGATION_FAILED'))),
      'a rejected navigation must be logged with its code',
    );
  } finally {
    console.error = originalError;
  }
});

test('should_use_provided_translator_for_message_keys', async () => {
  const element = createElement({
    state: PAGE_FALLBACK_STATES.NOT_FOUND,
    t: (key) => `translated:${key}`,
  });
  await flush();
  assert.equal(messageOf(element), `translated:${MESSAGE_NOT_FOUND_KEY}`);
});

test('should_be_defined_with_pey_page_fallback_tag', () => {
  assert.equal(TAG, 'pey-page-fallback');
  assert.equal(customElements.get(TAG), PageFallback);
});
