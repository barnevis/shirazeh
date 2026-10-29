// Internal infrastructure fallback for page-mounting outcomes. It is a render
// state, never a product page and never a route. Policy:
// docs/decisions.md#fallback-retry-policy, #message-only-fallback.

import { PeyElement } from '../base/pey-element.js';

const ERROR_SOURCE = 'pey.webui';

export const TAG = 'pey-page-fallback';

export const PAGE_FALLBACK_STATES = Object.freeze({
  NOT_FOUND: 'not-found',
  LOAD_FAILED: 'load-failed',
});

const MESSAGE_NOT_FOUND_KEY = 'pey.webui.errors.page-not-found';
const MESSAGE_LOAD_FAILED_KEY = 'pey.webui.errors.page-load-failed';
const ACTION_RETRY_KEY = 'pey.webui.actions.retry';
const ACTION_GO_BACK_KEY = 'pey.webui.actions.go-back';
const ACTION_GO_TO_FALLBACK_KEY = 'pey.webui.actions.go-to-fallback';

const ACTION_RETRY = 'retry';
const ACTION_GO_BACK = 'go-back';
const ACTION_GO_TO_FALLBACK = 'go-to-fallback';

function identity(key) {
  return key;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * @class PageFallback
 * @extends PeyElement
 * Renders the not-found / load-failed outcome and offers safe recovery actions.
 * Only stable message keys are rendered, and translated output is HTML-escaped
 * before insertion, so no technical error text and no injected markup can appear.
 */
class PageFallback extends PeyElement {
  #state = PAGE_FALLBACK_STATES.LOAD_FAILED;
  #canRetry = false;
  #onRetry = null;
  #router = null;
  #fallbackPath = null;
  #t = identity;

  onConnect(refs = {}) {
    this.#state = refs.state === PAGE_FALLBACK_STATES.NOT_FOUND ? PAGE_FALLBACK_STATES.NOT_FOUND : PAGE_FALLBACK_STATES.LOAD_FAILED;
    this.#canRetry = refs.canRetry === true;
    this.#onRetry = typeof refs.onRetry === 'function' ? refs.onRetry : null;
    this.#router = refs.router ?? null;
    this.#fallbackPath = refs.fallbackPath ?? null;
    this.#t = typeof refs.t === 'function' ? refs.t : identity;
    return this;
  }

  eventTypes() {
    return ['click'];
  }

  handleEvent(event) {
    const action = event.composedPath().find((node) => node instanceof HTMLElement && typeof node.dataset.action === 'string')?.dataset.action;
    if (action === ACTION_RETRY && this.#canRetry && this.#onRetry) {
      void this.#runRetry();
      return;
    }
    if (action === ACTION_GO_BACK && this.#router) {
      void this.#navigate('back');
      return;
    }
    if (action === ACTION_GO_TO_FALLBACK && this.#router && this.#fallbackPath) {
      void this.#navigate('fallback');
    }
  }

  async #runRetry() {
    try {
      await this.#onRetry();
    } catch {
      console.error(`[${ERROR_SOURCE}] PEY_PAGE_FALLBACK_RETRY_FAILED`);
    }
  }

  async #navigate(mode) {
    try {
      if (mode === 'back') {
        await this.#router.back();
      } else {
        await this.#router.replace(this.#fallbackPath);
      }
    } catch {
      console.error(`[${ERROR_SOURCE}] PEY_PAGE_FALLBACK_NAVIGATION_FAILED`);
    }
  }

  render() {
    const messageKey = this.#state === PAGE_FALLBACK_STATES.NOT_FOUND ? MESSAGE_NOT_FOUND_KEY : MESSAGE_LOAD_FAILED_KEY;
    const actions = [];
    if (this.#state === PAGE_FALLBACK_STATES.LOAD_FAILED && this.#canRetry && this.#onRetry) {
      actions.push(`<button type="button" part="action" data-action="${ACTION_RETRY}">${escapeHtml(this.#t(ACTION_RETRY_KEY))}</button>`);
    }
    if (this.#router) {
      actions.push(`<button type="button" part="action" data-action="${ACTION_GO_BACK}">${escapeHtml(this.#t(ACTION_GO_BACK_KEY))}</button>`);
    }
    if (this.#router && this.#fallbackPath) {
      actions.push(`<button type="button" part="action" data-action="${ACTION_GO_TO_FALLBACK}">${escapeHtml(this.#t(ACTION_GO_TO_FALLBACK_KEY))}</button>`);
    }
    return `
      <style>
        :host {
          display: block;
        }
        [part="message"] {
          margin: 0 0 var(--pey-space, 1rem);
          color: var(--pey-color-text, inherit);
        }
        [part="actions"] {
          display: flex;
          gap: var(--pey-space, 1rem);
        }
      </style>
      <p part="message">${escapeHtml(this.#t(messageKey))}</p>
      <div part="actions">${actions.join('')}</div>
    `;
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, PageFallback);
}

export { PageFallback };
