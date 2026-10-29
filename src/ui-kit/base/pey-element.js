// Shared Web Component base class for Pey UI components.

import { UI_COMPONENT_ERROR_EVENT } from '../contracts.js';
import { applyStyleSheet, getStyleText } from './attach-style-sheet.js';

const PRESERVE_ATTRIBUTE = 'data-pey-preserve';
const PRESERVE_STATE_ATTRIBUTE = 'data-pey-preserve-state';
const PRESERVE_STATES = new Set(['value', 'checked', 'selection', 'focus', 'scroll']);
const SELECTION_TYPES = new Set(['text', 'search', 'url', 'tel', 'password']);
const FALLBACK_MARKUP = '<div part="error"></div>';

function createError(code, message) {
  return Object.assign(new Error(message), { code, source: 'pey.webui', type: 'operational' });
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string' && error) return error;
  return null;
}

function getMarkers(root) {
  return [...root.querySelectorAll(`[${PRESERVE_ATTRIBUTE}]`)].map((element) => {
    const key = element.getAttribute(PRESERVE_ATTRIBUTE);
    const states = (element.getAttribute(PRESERVE_STATE_ATTRIBUTE) ?? '').split(/\s+/).filter(Boolean);
    return { element, key, states };
  });
}

function isValueElement(element) {
  return element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement;
}

function isSelectionElement(element) {
  if (element instanceof HTMLTextAreaElement) return typeof element.setSelectionRange === 'function';
  return element instanceof HTMLInputElement
    && SELECTION_TYPES.has(element.type)
    && typeof element.setSelectionRange === 'function';
}

function isCheckableElement(element) {
  return element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type);
}

function validateMarkers(markers) {
  const keys = new Set();
  for (const marker of markers) {
    if (!marker.key || keys.has(marker.key)) throw createError('PEY_PRESERVE_MARKER_INVALID', 'Preserve keys must be unique and non-empty');
    keys.add(marker.key);
    if (marker.states.length === 0) throw createError('PEY_PRESERVE_STATE_INVALID', 'Preserve markers must declare at least one state');
    if (marker.states.some((state) => !PRESERVE_STATES.has(state))) throw createError('PEY_PRESERVE_STATE_INVALID', 'Unknown preserve state');
    if (marker.states.includes('value') && !isValueElement(marker.element)) throw createError('PEY_PRESERVE_STATE_INVALID', 'Value preservation requires input, textarea, or select');
    if (marker.states.includes('selection') && !marker.states.includes('value')) throw createError('PEY_PRESERVE_STATE_INVALID', 'Selection requires value preservation');
    if (marker.states.includes('selection') && !isSelectionElement(marker.element)) throw createError('PEY_PRESERVE_SELECTION_UNSUPPORTED', 'Selection is unsupported for this input type');
    if (marker.states.includes('checked') && !isCheckableElement(marker.element)) throw createError('PEY_PRESERVE_STATE_INVALID', 'Checked preservation requires checkbox or radio input');
  }
}

function snapshotMarker(marker, activeElement) {
  const { element, states } = marker;
  const snapshot = { states, isFocused: states.includes('focus') && element === activeElement };
  if (states.includes('value')) snapshot.value = element.value;
  if (states.includes('checked')) snapshot.checked = element.checked;
  if (states.includes('selection')) snapshot.selection = [element.selectionStart, element.selectionEnd, element.selectionDirection];
  if (states.includes('scroll')) snapshot.scroll = [element.scrollLeft, element.scrollTop];
  return snapshot;
}

function snapshotMarkers(root) {
  const markers = getMarkers(root);
  validateMarkers(markers);
  const activeElement = root.activeElement;
  return new Map(markers.map((marker) => [marker.key, snapshotMarker(marker, activeElement)]));
}

function restoreMarker(marker, snapshot) {
  const { element } = marker;
  const states = marker.states.filter((state) => snapshot.states.includes(state));
  if (states.includes('value')) element.value = snapshot.value;
  if (states.includes('checked')) element.checked = snapshot.checked;
  if (states.includes('focus') && snapshot.isFocused) element.focus({ preventScroll: true });
  if (states.includes('selection')) {
    const length = element.value.length;
    element.setSelectionRange(Math.min(snapshot.selection[0], length), Math.min(snapshot.selection[1], length), snapshot.selection[2]);
  }
  if (states.includes('scroll')) {
    element.scrollLeft = snapshot.scroll[0];
    element.scrollTop = snapshot.scroll[1];
  }
}

function reconcileRadioGroups(markers) {
  const groups = new Map();
  for (const marker of markers) {
    if (!(marker.element instanceof HTMLInputElement) || marker.element.type !== 'radio' || !marker.element.checked) continue;
    const form = marker.element.form ?? null;
    let byForm = groups.get(marker.element.name);
    if (!byForm) {
      byForm = new Map();
      groups.set(marker.element.name, byForm);
    }
    byForm.set(form, marker.element);
  }
  for (const byForm of groups.values()) {
    for (const element of byForm.values()) {
      const group = [...element.getRootNode().querySelectorAll('input[type="radio"]')];
      for (const other of group) {
        if (other !== element && other.name === element.name && other.form === element.form) other.checked = false;
      }
    }
  }
}

/**
 * Shared base class for Pey custom elements.
 */
class PeyElement extends HTMLElement {
  #events = null;
  #logger = null;
  #isConnectedOnce = false;
  #unsubscribeEvents = [];
  #listenerEntries = [];
  #renderScheduled = false;
  #preserveOverride = null;
  #stylesheetHref = null;
  #stylesheetText = null;
  #stylesheetFailed = false;
  #stylesheetLoad = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    Object.defineProperty(this, 'connect', { value: (envelope) => this.#connect(envelope), writable: false, configurable: false });
  }

  #connect(envelope) {
    if (this.#isConnectedOnce) throw createError('PEY_ELEMENT_ALREADY_CONNECTED', 'PeyElement connect may only be called once');
    if (this.isConnected) throw createError('PEY_ELEMENT_CONNECTED_TOO_EARLY', 'PeyElement must be connected before DOM insertion');
    if (!envelope?.infrastructure?.events || typeof envelope.infrastructure.events.subscribe !== 'function' || typeof envelope.infrastructure.events.publish !== 'function') throw createError('PEY_ELEMENT_INVALID_CONNECTION', 'PeyElement requires an Event Bus facade');
    if (envelope.refs === null || typeof envelope.refs !== 'object') throw createError('PEY_ELEMENT_INVALID_CONNECTION', 'PeyElement refs must be an object');
    this.#validateEventTypes();
    this.#events = envelope.infrastructure.events;
    this.#logger = envelope.infrastructure.logger ?? null;
    this.#isConnectedOnce = true;
    this.onConnect(envelope.refs);
    return this;
  }

  /** Receives component-owned references. */
  onConnect() {}

  connectedCallback() {
    if (!this.#events) throw createError('PEY_ELEMENT_NOT_CONNECTED', 'PeyElement must be connected before DOM insertion');
    try {
      this.#subscribeToEvents();
      this.#bindDelegatedEvents();
    } catch (error) {
      this.#rollbackConnection();
      throw error;
    }
    this.requestRender({ preserve: false });
  }

  disconnectedCallback() {
    this.#clearSubscriptions();
    this.#clearListeners();
  }

  subscriptions() { return {}; }

  eventTypes() { return []; }

  /**
   * Declares a separate stylesheet for this component's shadow root: an
   * absolute URL, or `null` (default) when the component carries no separate
   * sheet. When declared, the first contentful render waits for the sheet text
   * and every full render re-applies it from the cache; the href is re-read
   * each render. A failed load reports `PEY_ELEMENT_STYLESHEET_FAILED`, stays
   * sticky for that href, and the component still renders without the sheet
   * (availability wins over a styled first paint) until `retryStylesheet()`
   * clears it. Contract: docs/decisions.md#css-attach-method.
   * @returns {string | null}
   */
  stylesheetHref() { return null; }

  /**
   * Declares the CSP nonce applied to this component's stylesheet element.
   * The value is dynamic: it is re-read and applied on every full render, so
   * returning a new nonce takes effect on the next render. Ignored when
   * `stylesheetHref()` returns `null`.
   * @returns {string | null}
   */
  stylesheetNonce() { return null; }

  /**
   * Re-attempts a failed stylesheet load: clears the sticky failure for the
   * current href and requests a render. Failures are never retried
   * automatically — style availability follows the contract in
   * docs/decisions.md#css-attach-method. A no-op when no stylesheet failed.
   * @returns {void}
   */
  retryStylesheet() {
    if (!this.#stylesheetFailed) return;
    this.#stylesheetFailed = false;
    this.#stylesheetText = null;
    this.#stylesheetLoad = null;
    this.requestRender({ preserve: false });
  }

  /** Publishes a declared UI event through the injected Event Bus. */
  publishUIEvent(type, data) {
    this.#publish(type, data);
  }

  /**
   * Requests a full render, optionally preserving explicitly marked browser
   * state. Requests coalesce into one microtask cycle; a single `preserve: false`
   * request dominates the cycle, and a cycle runs only while the element is
   * connected. Coalescing contract: docs/decisions.md#render-coalescing.
   */
  requestRender(options = {}) {
    if (options.preserve === false) this.#preserveOverride = false;
    if (this.#renderScheduled) return;
    this.#renderScheduled = true;
    queueMicrotask(() => this.#flushRender());
  }

  #flushRender() {
    this.#renderScheduled = false;
    const preserve = this.#preserveOverride !== false;
    this.#preserveOverride = null;
    if (!this.isConnected) return;
    this.#executeRender(preserve);
  }

  #executeRender(preserve) {
    const href = this.stylesheetHref();
    if (typeof href === 'string' && href.length > 0) {
      const gate = this.#loadStylesheet(href);
      if (gate !== null) {
        // First contentful render waits for the sheet so first paint carries
        // the rules; the settlement handler requests the actual render, but
        // only while this href is still the current sheet — a settlement for a
        // superseded href never schedules a render. The gate always resolves
        // (the failure is handled inside #loadStylesheet).
        gate.then(() => {
          if (this.isConnected && this.#stylesheetHref === href) this.requestRender({ preserve });
        });
        return;
      }
    } else if (this.#stylesheetHref !== null) {
      // The component dropped its stylesheet (or never had one at render time):
      // clear the per-sheet state so a stale #stylesheetText is never applied
      // and a later href change starts a fresh load.
      this.#resetStylesheetState();
    }
    let snapshot = null;
    try {
      if (preserve && this.shadowRoot.childNodes.length) snapshot = snapshotMarkers(this.shadowRoot);
      const output = this.render();
      this.shadowRoot.innerHTML = output;
      // The style is re-applied only when it belongs to the href rendered here;
      // a previous sheet's text is never applied to a different URL.
      if (this.#stylesheetHref === href && this.#stylesheetText !== null) {
        applyStyleSheet(this.shadowRoot, this.#stylesheetText, this.stylesheetNonce());
      }
      const markers = getMarkers(this.shadowRoot);
      validateMarkers(markers);
      this.#restore(snapshot, markers);
    } catch (error) {
      this.#handleError(error, 'PEY_ELEMENT_RENDER_FAILED');
      this.shadowRoot.innerHTML = FALLBACK_MARKUP;
      try {
        if (this.#stylesheetHref === href && this.#stylesheetText !== null) {
          applyStyleSheet(this.shadowRoot, this.#stylesheetText, this.stylesheetNonce());
        }
      } catch (stylesheetError) {
        // A stylesheet that itself throws (e.g. an invalid nonce) must not take
        // the error boundary down with it: the fallback renders without the sheet
        // and the apply failure is logged, never propagated.
        this.#log('PEY_ELEMENT_STYLESHEET_APPLY_FAILED', stylesheetError);
      }
    }
  }

  #resetStylesheetState() {
    this.#stylesheetHref = null;
    this.#stylesheetText = null;
    this.#stylesheetFailed = false;
    this.#stylesheetLoad = null;
  }

  #loadStylesheet(href) {
    if (this.#stylesheetHref === href) {
      if (this.#stylesheetText !== null || this.#stylesheetFailed) return null;
      if (this.#stylesheetLoad !== null) return this.#stylesheetLoad;
    }
    // First request for this href, or the href changed since the last render:
    // (re)start the load and remember which href the state below belongs to,
    // so a stale settlement for a superseded href never updates it.
    this.#stylesheetHref = href;
    this.#stylesheetText = null;
    this.#stylesheetFailed = false;
    this.#stylesheetLoad = getStyleText(href).then(
      (text) => {
        if (this.#stylesheetHref !== href) return;
        this.#stylesheetText = text;
        this.#stylesheetLoad = null;
      },
      (error) => {
        if (this.#stylesheetHref !== href) return;
        this.#stylesheetFailed = true;
        this.#stylesheetLoad = null;
        this.#handleError(error, 'PEY_ELEMENT_STYLESHEET_FAILED');
      },
    );
    return this.#stylesheetLoad;
  }

  render() { return ''; }

  handleEvent(event) {
    void event;
  }

  #subscribeToEvents() {
    if (!this.#events) throw createError('PEY_ELEMENT_NOT_CONNECTED', 'PeyElement must be connected before DOM insertion');
    const subscriptions = this.subscriptions();
    if (subscriptions === null || typeof subscriptions !== 'object' || Array.isArray(subscriptions)) throw createError('PEY_ELEMENT_SUBSCRIPTIONS_INVALID', 'subscriptions() must return an object');
    for (const [type, listener] of Object.entries(subscriptions)) {
      if (typeof type !== 'string' || type.length === 0) throw createError('PEY_ELEMENT_SUBSCRIPTIONS_INVALID', 'subscription event types must be non-empty strings');
      if (typeof listener !== 'function') throw createError('PEY_ELEMENT_SUBSCRIPTIONS_INVALID', 'subscription listeners must be functions');
      const unsubscribe = this.#events.subscribe(type, (event) => this.#runSafely(() => listener(event), 'PEY_ELEMENT_SUBSCRIPTION_FAILED'));
      if (typeof unsubscribe !== 'function') throw createError('PEY_ELEMENT_SUBSCRIBE_INVALID', 'Event Bus subscribe must return an unsubscribe function');
      this.#unsubscribeEvents.push(unsubscribe);
    }
  }

  #validateEventTypes() {
    const types = this.eventTypes();
    if (!Array.isArray(types)) throw createError('PEY_ELEMENT_EVENT_TYPES_INVALID', 'eventTypes() must return an array');
    if (types.some((type) => typeof type !== 'string' || type.length === 0)) throw createError('PEY_ELEMENT_EVENT_TYPES_INVALID', 'eventTypes() must return non-empty string types');
    if (new Set(types).size !== types.length) throw createError('PEY_ELEMENT_EVENT_TYPES_INVALID', 'eventTypes() must not contain duplicate types');
  }

  #bindDelegatedEvents() {
    for (const type of this.eventTypes()) {
      const listener = (event) => this.#runSafely(() => this.handleEvent(event), 'PEY_ELEMENT_EVENT_HANDLER_FAILED');
      this.shadowRoot.addEventListener(type, listener);
      this.#listenerEntries.push([type, listener]);
    }
  }

  #rollbackConnection() {
    this.#clearSubscriptions();
    this.#clearListeners();
  }

  #clearSubscriptions() {
    for (const unsubscribe of this.#unsubscribeEvents.splice(0)) {
      try { unsubscribe(); } catch (error) { this.#log('PEY_ELEMENT_UNSUBSCRIBE_FAILED', error); }
    }
  }

  #clearListeners() {
    for (const [type, listener] of this.#listenerEntries.splice(0)) {
      try { this.shadowRoot.removeEventListener(type, listener); } catch (error) { this.#log('PEY_ELEMENT_LISTENER_REMOVE_FAILED', error); }
    }
  }

  #restore(snapshot, markers) {
    if (!snapshot) return;
    this.#detectRadioConflicts(snapshot, markers);
    for (const marker of markers) {
      if (!snapshot.has(marker.key)) continue;
      try {
        restoreMarker(marker, snapshot.get(marker.key));
      } catch (error) {
        this.#log('PEY_PRESERVE_RESTORE_FAILED', error, marker.key);
      }
    }
    reconcileRadioGroups(markers);
  }

  #detectRadioConflicts(snapshot, markers) {
    const groups = new Map();
    for (const marker of markers) {
      const snap = snapshot.get(marker.key);
      if (!snap || !snap.states.includes('checked') || !snap.checked) continue;
      if (!(marker.element instanceof HTMLInputElement) || marker.element.type !== 'radio') continue;
      const form = marker.element.form ?? null;
      let forms = groups.get(marker.element.name);
      if (!forms) {
        forms = new Set();
        groups.set(marker.element.name, forms);
      }
      if (forms.has(form)) this.#log('PEY_PRESERVE_RADIO_CONFLICT', null, marker.key);
      forms.add(form);
    }
  }

  #publish(type, data) {
    try {
      const result = this.#events.publish(type, data);
      if (!result?.success) this.#log('PEY_ELEMENT_EVENT_PUBLISH_FAILED', result?.error);
    } catch (error) {
      this.#log('PEY_ELEMENT_EVENT_PUBLISH_FAILED', error);
    }
  }

  #runSafely(callback, code) {
    try { callback(); } catch (error) { this.#handleError(error, code); }
  }

  #handleError(error, code) {
    this.#log(code, error);
    this.#publish(UI_COMPONENT_ERROR_EVENT, { componentTag: this.tagName.toLowerCase(), code });
  }

  #log(code, error, preserveKey) {
    const tag = this.tagName.toLowerCase();
    const message = getErrorMessage(error);
    console.error(`[${tag}] ${code}${preserveKey ? ` key=${preserveKey}` : ''}${message ? ` ${message}` : ''}`);
    if (!this.#logger?.error) return;
    try {
      const payload = { code, componentTag: tag };
      if (preserveKey) payload.preserveKey = preserveKey;
      this.#logger.error(payload);
    } catch {
      console.error(`[${tag}] PEY_ELEMENT_LOGGER_FAILED`);
    }
  }
}

export { PeyElement };
