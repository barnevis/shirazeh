// Applies a separate stylesheet to a Shadow DOM with the kit's final
// preload-and-inline method. Decision and rationale:
// docs/decisions.md#css-attach-method.

const ERROR_SOURCE = 'pey.webui';
const STYLESHEET_ATTRIBUTE = 'data-pey-stylesheet';

// Resolved stylesheet texts keyed by href, for synchronous re-application.
const styleCache = new Map();
// In-flight loads keyed by href, so concurrent callers share one preload/fetch.
// A settled failure is evicted (a later call may retry); resolved text moves
// into styleCache and the in-flight entry is dropped.
const settledLoads = new Map();

function createError(code, message, cause) {
  const error = new Error(message);
  if (cause !== undefined) error.cause = cause;
  return Object.assign(error, { code, source: ERROR_SOURCE, type: 'operational' });
}

function assertShadowRootTarget(shadowRoot) {
  if (!shadowRoot || typeof shadowRoot.appendChild !== 'function' || typeof shadowRoot.querySelector !== 'function') {
    throw createError('PEY_STYLESHEET_INVALID_TARGET', 'Stylesheet attach target must be a ShadowRoot');
  }
}

function validateHref(href) {
  if (typeof href !== 'string' || href.length === 0 || href !== href.trim()) {
    throw createError(
      'PEY_STYLESHEET_INVALID_HREF',
      'Stylesheet href must be a non-empty string without surrounding whitespace',
    );
  }
  try {
    new URL(href);
  } catch {
    throw createError('PEY_STYLESHEET_INVALID_HREF', 'Stylesheet href must be an absolute URL');
  }
}

function validateNonce(nonce) {
  if (nonce === undefined || nonce === null) return;
  if (typeof nonce !== 'string' || nonce.length === 0 || nonce !== nonce.trim()) {
    throw createError(
      'PEY_STYLESHEET_INVALID_NONCE',
      'Stylesheet nonce must be a non-empty string without surrounding whitespace',
    );
  }
}

function preloadStylesheet(href) {
  const preload = document.createElement('link');
  preload.rel = 'preload';
  preload.as = 'style';
  preload.href = href;
  document.head.appendChild(preload);
  return new Promise((resolve, reject) => {
    preload.addEventListener('load', () => {
      // The response is now in the HTTP cache; the link element has done its
      // job and is removed so it never lingers for the page's lifetime.
      preload.remove();
      resolve();
    }, { once: true });
    preload.addEventListener('error', () => {
      preload.remove();
      reject(createError('PEY_STYLESHEET_FETCH_FAILED', `Stylesheet could not be preloaded: ${href}`));
    }, { once: true });
  });
}

async function loadStyleText(href, options) {
  if (options.preload !== false) await preloadStylesheet(href);
  let response;
  try {
    const fetchFn = typeof options.fetchFn === 'function' ? options.fetchFn : globalThis.fetch;
    if (typeof fetchFn !== 'function') {
      throw createError('PEY_STYLESHEET_FETCH_FAILED', 'fetch is not available to load the stylesheet');
    }
    response = await fetchFn(href);
  } catch (error) {
    if (error?.code === 'PEY_STYLESHEET_FETCH_FAILED') throw error;
    throw createError('PEY_STYLESHEET_FETCH_FAILED', `Stylesheet could not be fetched: ${href}`, error);
  }
  if (!response || typeof response.ok !== 'boolean' || !response.ok) {
    throw createError(
      'PEY_STYLESHEET_FETCH_FAILED',
      `Stylesheet could not be fetched: ${href} (HTTP ${response?.status ?? 'unknown'})`,
    );
  }
  let text;
  try {
    text = await response.text();
  } catch (error) {
    throw createError('PEY_STYLESHEET_FETCH_FAILED', `Stylesheet text could not be read: ${href}`, error);
  }
  return text;
}

/**
 * Resolves the stylesheet text for `href` through the preload-and-cache method:
 * concurrent callers share one in-flight load, resolved text is cached by href,
 * and a failed load is evicted so a later call can retry. Passing `preload: false`
 * (optionally with a `fetchFn`) loads without the link element — for tests, and
 * for callers that already warmed the cache.
 * @param {string} href Absolute URL of the stylesheet.
 * @param {{ preload?: boolean, fetchFn?: (href: string) => Promise<{ ok: boolean, status?: number, text: () => Promise<string> }> }} [options]
 * @returns {Promise<string>} The stylesheet text.
 */
export function getStyleText(href, options = {}) {
  validateHref(href);
  const cached = styleCache.get(href);
  if (cached !== undefined) return Promise.resolve(cached);
  const inFlight = settledLoads.get(href);
  if (inFlight !== undefined) return inFlight;
  const load = loadStyleText(href, options).then(
    (text) => {
      styleCache.set(href, text);
      settledLoads.delete(href);
      return text;
    },
    (error) => {
      settledLoads.delete(href);
      throw error;
    },
  );
  settledLoads.set(href, load);
  return load;
}

/**
 * Returns the cached stylesheet text for `href` synchronously, or `null` when
 * the sheet has not resolved yet (still loading or failed). Used by `PeyElement`
 * to re-apply a component's stylesheet after a full render without awaiting.
 * @param {string} href Absolute URL of the stylesheet.
 * @returns {string | null}
 */
export function getCachedStyleText(href) {
  return styleCache.get(href) ?? null;
}

/**
 * Applies `text` as `<style data-pey-stylesheet>` inside `shadowRoot`,
 * synchronously, replacing only the kit's own stylesheet element — never the
 * component content. The new element is inserted before the previous one is
 * removed, so there is no instant where the shadow is left without its rules.
 * The nonce is validated here too, not only in `attachStyleSheet()`: callers
 * that apply a cached sheet directly (like `PeyElement`) must not be able to
 * inject a malformed nonce.
 * @param {ShadowRoot} shadowRoot Target shadow root.
 * @param {string} text Stylesheet text.
 * @param {string} [nonce] CSP nonce for the <style> element.
 * @returns {void}
 */
export function applyStyleSheet(shadowRoot, text, nonce) {
  assertShadowRootTarget(shadowRoot);
  validateNonce(nonce);
  const style = document.createElement('style');
  style.setAttribute(STYLESHEET_ATTRIBUTE, '');
  if (nonce) style.setAttribute('nonce', nonce);
  style.textContent = text;
  const previous = shadowRoot.querySelector(`[${STYLESHEET_ATTRIBUTE}]`);
  if (previous) shadowRoot.insertBefore(style, previous);
  else shadowRoot.appendChild(style);
  if (previous) previous.remove();
}

/**
 * Attaches a separate stylesheet to a Shadow DOM. Resolves once the sheet text
 * is inlined as `<style data-pey-stylesheet>` inside `shadowRoot`; callers must
 * await this before inserting styled content so the first paint carries the
 * rules. On re-attach only the kit's own stylesheet element is replaced — the
 * component content is left intact. Load failures surface as
 * `PEY_STYLESHEET_FETCH_FAILED` (or `PEY_STYLESHEET_INVALID_NONCE` for a
 * malformed nonce), never as a raw engine error.
 * @param {ShadowRoot} shadowRoot The shadow root to attach the style into.
 * @param {string} href Absolute URL of the stylesheet.
 * @param {{ nonce?: string, preload?: boolean, fetchFn?: Function }} [options]
 * @returns {Promise<void>}
 */
export async function attachStyleSheet(shadowRoot, href, options = {}) {
  assertShadowRootTarget(shadowRoot);
  validateNonce(options.nonce);
  const text = await getStyleText(href, options);
  applyStyleSheet(shadowRoot, text, options.nonce);
}

export { STYLESHEET_ATTRIBUTE };
