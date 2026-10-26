// Provides the user-preference service for shirazeh.prefs.

const STORAGE_SERVICE_NAME = 'pey.storage.service';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Creates the preference service.
 *
 * Graceful degradation is the contract: the UI consumes preferences at
 * startup, so a missing key or a failing storage backend reduces capability
 * (defaults apply) instead of surfacing errors.
 *
 * @param {object} options Service options.
 * @param {string} options.collection Storage collection holding { key, value } records.
 * @returns {{service: object, bindDependencies: Function, deactivate: Function}} Service and lifecycle controls.
 */
export function createPrefsService({ collection }) {
  let available = true;
  let storage = null;

  return {
    service: {
      /**
       * Reads one preference.
       *
       * @param {string} key Preference name.
       * @returns {Promise<unknown>} Stored value, or null when absent/unavailable.
       */
      async get(key) {
        if (!available || storage === null || typeof key !== 'string' || key.length === 0) {
          return null;
        }

        try {
          const record = await storage.read(collection, key);
          return isPlainObject(record) && 'value' in record ? record.value : null;
        } catch {
          return null;
        }
      },

      /**
       * Writes one preference.
       *
       * @param {string} key Preference name.
       * @param {unknown} value JSON-compatible value.
       * @returns {Promise<boolean>} true on success.
       */
      async set(key, value) {
        if (!available || storage === null || typeof key !== 'string' || key.length === 0) {
          return false;
        }

        try {
          await storage.write(collection, { key, value });
          return true;
        } catch {
          return false;
        }
      },
    },

    /**
     * Binds the resolved storage dependency after settlement.
     *
     * @param {Record<string, object>} services Direct service references keyed by name.
     */
    bindDependencies(services) {
      storage = services[STORAGE_SERVICE_NAME] ?? null;
    },

    deactivate() {
      available = false;
      storage = null;
    },
  };
}
