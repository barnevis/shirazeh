// Verifies the stylesheet attach runtime: cache/deredup of concurrent loads,
// error normalization, nonce validation, and stylesheet-element-only re-attach.

import '../setup-dom.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STYLESHEET_ATTRIBUTE,
  applyStyleSheet,
  attachStyleSheet,
  getCachedStyleText,
  getStyleText,
} from '../../base/attach-style-sheet.js';

let hrefCounter = 0;

function nextHref() {
  hrefCounter += 1;
  return `https://example.test/ui/assets/sheet-${hrefCounter}.css`;
}

function createResponse(text) {
  return { ok: true, status: 200, text: async () => text };
}

function createShadowRoot() {
  const host = document.createElement('div');
  return host.attachShadow({ mode: 'open' });
}

test('should_apply_stylesheet_text_into_shadow_root', async () => {
  const shadowRoot = createShadowRoot();
  const text = ':host { display: block; }';
  await attachStyleSheet(shadowRoot, nextHref(), {
    preload: false,
    fetchFn: () => Promise.resolve(createResponse(text)),
  });
  const style = shadowRoot.querySelector(`[${STYLESHEET_ATTRIBUTE}]`);
  assert.ok(style, 'expected the inlined stylesheet element');
  assert.ok(style.textContent.includes(':host'), 'expected the sheet text to be inlined');
});

test('should_reuse_cached_text_without_fetching_again', async () => {
  const href = nextHref();
  await getStyleText(href, {
    preload: false,
    fetchFn: () => Promise.resolve(createResponse('.a{}')),
  });
  const text = await getStyleText(href, {
    preload: false,
    fetchFn: () => Promise.reject(new Error('must not fetch again')),
  });
  assert.equal(text, '.a{}');
  assert.equal(getCachedStyleText(href), '.a{}');
});

test('should_return_null_synchronously_before_the_sheet_resolves', async () => {
  const href = nextHref();
  const load = getStyleText(href, {
    preload: false,
    fetchFn: () => new Promise((resolve) => setTimeout(() => resolve(createResponse('.a{}')), 5)),
  });
  assert.equal(getCachedStyleText(href), null, 'no text while the load is in flight');
  await load;
  assert.equal(getCachedStyleText(href), '.a{}');
});

test('should_dedupe_concurrent_loads_for_the_same_href', async () => {
  const href = nextHref();
  let calls = 0;
  const fetchFn = () => {
    calls += 1;
    return new Promise((resolve) => setTimeout(() => resolve(createResponse('.a{}')), 5));
  };
  const [first, second] = await Promise.all([
    getStyleText(href, { preload: false, fetchFn }),
    getStyleText(href, { preload: false, fetchFn }),
  ]);
  assert.equal(calls, 1, 'two concurrent callers must share one fetch');
  assert.equal(first, '.a{}');
  assert.equal(second, '.a{}');
});

test('should_normalize_fetch_failure_to_stylesheet_fetch_failed', async () => {
  await assert.rejects(
    getStyleText(nextHref(), { preload: false, fetchFn: () => Promise.reject(new Error('network down')) }),
    (error) => error.code === 'PEY_STYLESHEET_FETCH_FAILED',
  );
});

test('should_normalize_http_error_to_stylesheet_fetch_failed', async () => {
  await assert.rejects(
    getStyleText(nextHref(), {
      preload: false,
      fetchFn: () => Promise.resolve({ ok: false, status: 404, text: async () => '' }),
    }),
    (error) => error.code === 'PEY_STYLESHEET_FETCH_FAILED',
  );
});

test('should_normalize_text_decode_failure_to_stylesheet_fetch_failed', async () => {
  await assert.rejects(
    getStyleText(nextHref(), {
      preload: false,
      fetchFn: () => Promise.resolve({ ok: true, status: 200, text: () => Promise.reject(new Error('decode')) }),
    }),
    (error) => error.code === 'PEY_STYLESHEET_FETCH_FAILED',
  );
});

test('should_report_missing_fetch_as_stylesheet_fetch_failed', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  try {
    Object.defineProperty(globalThis, 'fetch', { value: undefined, configurable: true, writable: true });
    await assert.rejects(
      getStyleText(nextHref(), { preload: false }),
      (error) => error.code === 'PEY_STYLESHEET_FETCH_FAILED',
    );
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'fetch', descriptor);
    else delete globalThis.fetch;
  }
});

test('should_reject_when_nonce_is_empty_or_whitespace', async () => {
  const shadowRoot = createShadowRoot();
  await assert.rejects(
    attachStyleSheet(shadowRoot, nextHref(), {
      preload: false,
      fetchFn: () => Promise.resolve(createResponse('.a{}')),
      nonce: '   ',
    }),
    (error) => error.code === 'PEY_STYLESHEET_INVALID_NONCE',
  );
});

test('should_apply_nonce_to_the_stylesheet_element', async () => {
  const shadowRoot = createShadowRoot();
  await attachStyleSheet(shadowRoot, nextHref(), {
    preload: false,
    fetchFn: () => Promise.resolve(createResponse('.a{}')),
    nonce: 'cspNonce123',
  });
  const style = shadowRoot.querySelector(`[${STYLESHEET_ATTRIBUTE}]`);
  assert.equal(style.getAttribute('nonce'), 'cspNonce123');
});

test('should_replace_only_the_stylesheet_element_on_re_attach', async () => {
  const shadowRoot = createShadowRoot();
  const href = nextHref();
  await attachStyleSheet(shadowRoot, href, {
    preload: false,
    fetchFn: () => Promise.resolve(createResponse('.a{}')),
  });
  shadowRoot.appendChild(Object.assign(document.createElement('div'), { id: 'keep' }));
  await attachStyleSheet(shadowRoot, href, {
    preload: false,
    fetchFn: () => Promise.resolve(createResponse('.b{}')),
  });
  const styles = shadowRoot.querySelectorAll(`[${STYLESHEET_ATTRIBUTE}]`);
  assert.equal(styles.length, 1, 're-attach must not duplicate the stylesheet');
  assert.ok(styles[0].textContent.includes('.a'), 're-attach reuses the cached text');
  assert.ok(shadowRoot.getElementById('keep'), 're-attach must preserve the component content');
});

test('should_evict_a_failed_load_so_a_later_call_can_retry', async () => {
  const href = nextHref();
  await assert.rejects(
    getStyleText(href, { preload: false, fetchFn: () => Promise.reject(new Error('offline')) }),
    (error) => error.code === 'PEY_STYLESHEET_FETCH_FAILED',
  );
  const text = await getStyleText(href, {
    preload: false,
    fetchFn: () => Promise.resolve(createResponse('.a{}')),
  });
  assert.equal(text, '.a{}', 'a later call must be able to retry after a failure');
});

test('should_share_one_failure_across_concurrent_callers', async () => {
  const href = nextHref();
  let calls = 0;
  const fetchFn = () => {
    calls += 1;
    return Promise.reject(new Error('offline'));
  };
  await assert.rejects(
    Promise.all([
      getStyleText(href, { preload: false, fetchFn }),
      getStyleText(href, { preload: false, fetchFn }),
    ]),
    (error) => error.code === 'PEY_STYLESHEET_FETCH_FAILED',
  );
  assert.equal(calls, 1, 'concurrent callers must share one failing fetch');
});

test('should_reject_non_absolute_href', async () => {
  assert.throws(
    () => getStyleText('assets/sheet.css', { preload: false, fetchFn: () => Promise.resolve(createResponse('.a{}')) }),
    (error) => error.code === 'PEY_STYLESHEET_INVALID_HREF',
  );
});

test('should_reject_href_with_surrounding_whitespace', async () => {
  assert.throws(
    () => getStyleText(` ${nextHref()} `, { preload: false, fetchFn: () => Promise.resolve(createResponse('.a{}')) }),
    (error) => error.code === 'PEY_STYLESHEET_INVALID_HREF',
  );
});

test('should_reject_nonce_with_surrounding_whitespace', async () => {
  const shadowRoot = createShadowRoot();
  await assert.rejects(
    attachStyleSheet(shadowRoot, nextHref(), {
      preload: false,
      fetchFn: () => Promise.resolve(createResponse('.a{}')),
      nonce: ' abc ',
    }),
    (error) => error.code === 'PEY_STYLESHEET_INVALID_NONCE',
  );
});

test('should_apply_cached_text_synchronously_for_the_base_class', () => {
  const shadowRoot = createShadowRoot();
  shadowRoot.innerHTML = '<p>content</p>';
  applyStyleSheet(shadowRoot, '.p{color:red}');
  const style = shadowRoot.querySelector(`[${STYLESHEET_ATTRIBUTE}]`);
  assert.ok(style.textContent.includes('.p'));
  assert.ok(shadowRoot.querySelector('p'), 'applyStyleSheet must not wipe the content');
});

test('should_reject_invalid_nonce_when_applying_directly', () => {
  const shadowRoot = createShadowRoot();
  assert.throws(
    () => applyStyleSheet(shadowRoot, '.a{}', '  bad  '),
    (error) => error.code === 'PEY_STYLESHEET_INVALID_NONCE',
  );
});
