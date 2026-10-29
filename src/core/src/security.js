// Security — shared access-control primitives used by the Registry and EventBus.
// Enforces that plugins may only access services declared in their dependencies,
// and may only publish events declared in their manifest. Records security events.
// The foundational principle: anything not declared is forbidden.

/**
 * Checks whether a plugin has declared a service in its dependencies (required or optional).
 *
 * Access control is enforced only at startup. After the Core passes the service
 * object directly to the plugin, the plugin receives a direct reference and can
 * call its methods without any intermediary.
 *
 * @param {string} serviceName - The service name to check.
 * @param {object} manifest - The requesting plugin's manifest.
 * @returns {boolean} True if the service is declared in required or optional dependencies.
 */
export function isServiceDeclared(serviceName, manifest) {
  const required = manifest.dependencies?.required ?? [];
  const optional = manifest.dependencies?.optional ?? [];
  return [...required, ...optional].includes(serviceName);
}

/**
 * Checks whether a plugin has declared an event in its manifest's events section.
 *
 * Only events declared in the manifest can be published. The source field is
 * taken from the manifest name, not from runtime — it cannot be forged.
 *
 * @param {string} eventType - The event type to check.
 * @param {object} manifest - The publishing plugin's manifest.
 * @returns {boolean} True if the event is declared in the manifest's events section.
 */
export function isEventDeclared(eventType, manifest) {
  return manifest.events?.some((e) => e.name === eventType) ?? false;
}

/**
 * Checks whether a service is declared in a plugin's manifest provides section.
 *
 * A service not declared in the manifest's provides cannot be registered.
 *
 * @param {string} serviceName - The service name to check.
 * @param {object} manifest - The providing plugin's manifest.
 * @returns {boolean} True if the service is declared in provides.
 */
export function isServiceProvided(serviceName, manifest) {
  return manifest.provides?.some((s) => s.name === serviceName) ?? false;
}

/**
 * Checks whether a value appears to contain sensitive data.
 *
 * Sensitive data includes passwords, tokens, API keys, and personal information.
 * This is a simple heuristic check — the rule is that sensitive data must never
 * be placed in the error structure, events, or logs in the first place.
 *
 * @param {string} value - The string to check.
 * @returns {boolean} True if the string appears to contain sensitive data.
 */
export function isSensitive(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const lower = value.toLowerCase();
  return (
    lower.includes('password') ||
    lower.includes('token') ||
    lower.includes('secret') ||
    lower.includes('apikey') ||
    lower.includes('api_key')
  );
}

/**
 * Checks whether an object contains sensitive data in any of its string values.
 *
 * Used to validate that event data and error structures do not leak sensitive
 * information. Recursively checks nested objects and arrays.
 *
 * @param {*} value - The value to check.
 * @returns {boolean} True if no sensitive data is detected.
 */
export function hasNoSensitiveData(value) {
  if (typeof value === 'string') {
    return !isSensitive(value);
  }

  if (value === null || value === undefined) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(hasNoSensitiveData);
  }

  if (typeof value === 'object') {
    // Check both keys and values — a key like "token" or "password" is sensitive.
    for (const key of Object.keys(value)) {
      if (isSensitive(key)) {
        return false;
      }
      if (!hasNoSensitiveData(value[key])) {
        return false;
      }
    }
    return true;
  }

  return true;
}

/**
 * Creates a scoped Event Bus access object for a plugin.
 *
 * The scoped publish function automatically injects the source from the
 * plugin's manifest name — the plugin cannot forge the source. Only events
 * declared in the manifest can be published.
 *
 * @param {object} eventBus - The Core's Event Bus instance.
 * @param {object} manifest - The plugin's manifest.
 * @returns {{publish: Function, subscribe: Function}} A scoped events object.
 */
export function createScopedEventBus(eventBus, manifest) {
  return {
    /**
     * Publishes an event with the source automatically set from the manifest.
     *
     * @param {string} eventType - The event type.
     * @param {object} data - The event data (identifying info only, no sensitive data).
     * @returns {{success: boolean, error?: string}} The publish result.
     */
    publish(eventType, data) {
      return eventBus.publish({ type: eventType, data }, manifest.name, manifest);
    },

    /**
     * Subscribes to an event type. Any plugin may listen to any event.
     *
     * @param {string} eventType - The event type to listen for, or "*" for all.
     * @param {Function} listener - The callback function.
     * @returns {Function} An unsubscribe function.
     */
    subscribe(eventType, listener) {
      return eventBus.subscribe(eventType, listener, manifest.name);
    },
  };
}
