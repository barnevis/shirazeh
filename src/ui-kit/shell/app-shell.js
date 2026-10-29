// Neutral application shell that hosts the page landmark and consumer chrome.

import { PeyElement } from '../base/pey-element.js';
import { PEY_ELEMENT_TAG_PREFIX } from '../contracts.js';

const TAG = `${PEY_ELEMENT_TAG_PREFIX}app-shell`;

const ERROR_SOURCE = 'pey.webui';
const THEME_KEY = 'theme';
const DIRECTION_KEY = 'direction';
const DIRECTION_VALUES = new Set(['ltr', 'rtl', 'auto']);
const PRESENTATION_KEYS = [THEME_KEY, DIRECTION_KEY];

const SLOT_EXTENSION = 'extension';
const SLOT_EXTENSION_END = 'extension-end';
const SLOT_PAGE = 'page';

function createShellError(code, message) {
  return Object.assign(new Error(message), {
    code,
    source: ERROR_SOURCE,
    type: 'operational',
  });
}

function isSharedStateFacade(sharedState) {
  return sharedState !== null
    && typeof sharedState === 'object'
    && typeof sharedState.get === 'function'
    && typeof sharedState.set === 'function'
    && typeof sharedState.subscribe === 'function';
}

/**
 * Top-level neutral shell component. It defines the slot/host contract for
 * page content and consumer chrome but no product layout. The Entry Point
 * mounts resolved pages into the `page` slot; consumers fill the `extension`
 * and `extension-end` slots. Base presentation states (theme/direction) are
 * reflected as host attributes so consumers can restyle tokens per theme.
 */
class AppShell extends PeyElement {
  #sharedState = null;
  #sharedStateUnsubscribers = [];

  // References arrive through the base class's fixed connect() envelope; the
  // store is authoritative for base states once this shell is connected, while
  // refs.theme / refs.direction act as the pre-connect config fallback.
  onConnect(refs = {}) {
    const sharedState = refs.sharedState ?? null;
    if (sharedState !== null && !isSharedStateFacade(sharedState)) {
      throw createShellError(
        'PEY_SHELL_INVALID_SHARED_STATE',
        'Shared state ref must expose get, set, and subscribe',
      );
    }
    this.#sharedState = sharedState;
    this.#applyTheme(refs.theme);
    this.#applyDirection(refs.direction);
    return this;
  }

  // The base class's own lifecycle is established first; if the shared-state
  // connection then fails, the whole lifecycle is rolled back transactionally
  // (shared-state subscriptions and the base subscriptions/listeners) before
  // the failure is surfaced with a stable code.
  connectedCallback() {
    try {
      super.connectedCallback();
      this.#connectSharedState();
    } catch (error) {
      this.#rollbackConnection(error);
      throw error;
    }
  }

  disconnectedCallback() {
    this.#rollbackSharedState();
    super.disconnectedCallback();
  }

  #connectSharedState() {
    if (!this.#sharedState) return;
    const theme = this.#sharedState.get(THEME_KEY);
    const direction = this.#sharedState.get(DIRECTION_KEY);
    if (theme !== undefined) this.#applyTheme(theme);
    if (direction !== undefined) this.#applyDirection(direction);
    for (const key of PRESENTATION_KEYS) {
      this.#sharedStateUnsubscribers.push(this.#subscribeToStore(key));
    }
  }

  #subscribeToStore(key) {
    const apply = key === THEME_KEY
      ? (value) => this.#applyTheme(value)
      : (value) => this.#applyDirection(value);
    let unsubscribe;
    try {
      unsubscribe = this.#sharedState.subscribe(key, apply);
    } catch {
      throw createShellError(
        'PEY_SHELL_SHARED_STATE_SUBSCRIBE_FAILED',
        'Shared state subscribe failed',
      );
    }
    if (typeof unsubscribe !== 'function') {
      throw createShellError(
        'PEY_SHELL_SHARED_STATE_SUBSCRIBE_INVALID',
        'Shared state subscribe must return an unsubscribe function',
      );
    }
    return unsubscribe;
  }

  #rollbackSharedState() {
    for (const unsubscribe of this.#sharedStateUnsubscribers.splice(0)) {
      try {
        unsubscribe();
      } catch {
        // A throwing unsubscribe must not mask the original failure; surface a
        // stable code without echoing a potentially sensitive error message.
        this.#log('PEY_SHELL_SHARED_STATE_UNSUBSCRIBE_FAILED');
      }
    }
  }

  #rollbackConnection(error) {
    this.#rollbackSharedState();
    super.disconnectedCallback();
    this.#log('PEY_SHELL_CONNECTION_FAILED', error);
  }

  #log(code, error) {
    const tag = this.tagName.toLowerCase();
    const message = error instanceof Error ? error.message : null;
    console.error(`[${tag}] ${code}${message ? ` ${message}` : ''}`);
  }

  #applyTheme(theme) {
    if (typeof theme === 'string' && theme.length > 0) {
      this.setAttribute('data-theme', theme);
    } else {
      this.removeAttribute('data-theme');
    }
  }

  #applyDirection(direction) {
    if (DIRECTION_VALUES.has(direction)) {
      this.setAttribute('dir', direction);
    } else {
      this.removeAttribute('dir');
    }
  }

  // Neutral structure: chrome slot, the page landmark, then the closing chrome
  // slot. Focus follows DOM order and no element receives focus on its own.
  // All layout CSS uses logical properties so LTR and RTL both render sanely.
  render() {
    return `
      <style>
        :host {
          box-sizing: border-box;
          display: block;
          min-block-size: 100%;
          color: var(--pey-color-text);
          background-color: var(--pey-color-canvas);
          font-family: var(--pey-font-family-base);
        }
        [part="chrome"],
        [part="chrome-end"] {
          display: block;
        }
        [part="page"] {
          display: block;
          min-block-size: 100%;
        }
      </style>
      <div part="chrome"><slot name="${SLOT_EXTENSION}"></slot></div>
      <main part="page"><slot name="${SLOT_PAGE}"></slot></main>
      <div part="chrome-end"><slot name="${SLOT_EXTENSION_END}"></slot></div>
    `;
  }
}

customElements.define(TAG, AppShell);

export { AppShell, TAG };