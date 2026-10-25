// Creates a small UI-local shared state store for pey.webui consumers.

const ERROR_SOURCE = 'pey.webui';
const MAX_JSON_DEPTH = 100;

function createError(code, message) {
  return Object.assign(new Error(message), { code, source: ERROR_SOURCE, type: 'operational' });
}

function isPlainObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonSerializable(value, depth = 1, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (depth > MAX_JSON_DEPTH) return false;
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return false;
    ancestors.add(value);
    const isValid = value.every((item) => isJsonSerializable(item, depth + 1, ancestors));
    ancestors.delete(value);
    return isValid;
  }
  if (isPlainObject(value)) {
    if (ancestors.has(value)) return false;
    ancestors.add(value);
    const isValid = Object.values(value).every((item) => isJsonSerializable(item, depth + 1, ancestors));
    ancestors.delete(value);
    return isValid;
  }
  return false;
}

function validateKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key !== key.trim()) {
    throw createError('PEY_SHARED_STATE_INVALID_KEY', 'Shared state keys must be non-empty trimmed strings');
  }
}

function validateValue(value) {
  if (!isJsonSerializable(value)) {
    throw createError('PEY_SHARED_STATE_INVALID_VALUE', 'Shared state values must be strict JSON-compatible data');
  }
}

function validateListener(listener) {
  if (typeof listener !== 'function') {
    throw createError('PEY_SHARED_STATE_INVALID_LISTENER', 'Shared state listeners must be functions');
  }
}

function notify(keyListeners, value) {
  for (const listener of [...keyListeners]) {
    try {
      listener(value);
    } catch {
      console.error('[pey.webui] PEY_SHARED_STATE_LISTENER_FAILED');
    }
  }
}

/**
 * Creates one UI-local shared state store for a running UI.
 *
 * Values must be strict JSON-compatible data and are compared with Object.is:
 * setting an equal value triggers no notification, while a new object or array
 * always notifies even when its content matches. Stored values are assumed to be
 * treated as immutable; the store neither clones nor freezes them and consumers
 * replace a value by passing a new reference to set().
 *
 * @returns {object} An immutable store exposing get, set, subscribe, and clear.
 */
export function createSharedState() {
  const values = new Map();
  const listeners = new Map();

  return Object.freeze({
    /** @param {string} key Non-empty trimmed string key. @returns {*} The stored value, or undefined. */
    get(key) {
      validateKey(key);
      return values.get(key);
    },

    /**
     * Stores a value and notifies subscribers registered for the same key.
     * @param {string} key Non-empty trimmed string key.
     * @param {*} value Strict JSON-compatible data.
     */
    set(key, value) {
      validateKey(key);
      validateValue(value);
      if (Object.is(values.get(key), value)) return;
      values.set(key, value);
      const keyListeners = listeners.get(key);
      if (!keyListeners) return;
      notify(keyListeners, value);
    },

    /**
     * Subscribes to changes of one key only; the same listener registers once per key.
     * @param {string} key Non-empty trimmed string key.
     * @param {Function} listener Called with the new value, isolated from other listeners.
     * @returns {Function} An idempotent unsubscribe function.
     */
    subscribe(key, listener) {
      validateKey(key);
      validateListener(listener);
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key).add(listener);
      return () => {
        const keyListeners = listeners.get(key);
        if (!keyListeners) return;
        keyListeners.delete(listener);
        if (keyListeners.size === 0) listeners.delete(key);
      };
    },

    /**
     * Releases all stored values and subscribers for deterministic shutdown cleanup.
     * A deliberate extension of the fixed get/set/subscribe API; previously issued
     * unsubscribe functions stay safe (no-op) afterward.
     */
    clear() {
      values.clear();
      listeners.clear();
    },
  });
}