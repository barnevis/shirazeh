// InternalLogger — the Core's own internal log.
// Records plugin startup/shutdown, validation results, system errors, and security events.
// This log belongs to the Core; no plugin has direct access to it.

/**
 * Log severity levels supported by the Core's internal logger.
 *
 * @readonly
 * @enum {string}
 */
export const LOG_LEVEL = Object.freeze({
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  SECURITY: 'security',
});

/**
 * Creates a new InternalLogger instance.
 *
 * The logger stores entries in memory. It is private to the Core and is never
 * exposed to plugins. Resolved sensitive values (e.g. environment variable
 * substitutions) must never appear in any log entry.
 *
 * @returns {object} An object with info, warn, error, security, and getEntries methods.
 */
export function createInternalLogger() {
  /** @type {Array<{level: string, timestamp: string, message: string, context: object|null}>} */
  const entries = [];

  /**
   * Appends a single log entry.
   *
   * @param {string} level - One of the LogLevel values.
   * @param {string} message - Human-readable description of the event.
   * @param {object|null} [context=null] - Optional structured details.
   * @returns {void}
   * @private
   */
  function append(level, message, context) {
    entries.push({
      level,
      timestamp: new Date().toISOString(),
      message,
      context: context ?? null,
    });
  }

  return {
    /**
     * Logs an informational message.
     *
     * @param {string} message - The message to log.
     * @param {object|null} [context=null] - Optional structured details.
     * @returns {void}
     */
    info(message, context) {
      append(LOG_LEVEL.INFO, message, context);
    },

    /**
     * Logs a warning message.
     *
     * @param {string} message - The message to log.
     * @param {object|null} [context=null] - Optional structured details.
     * @returns {void}
     */
    warn(message, context) {
      append(LOG_LEVEL.WARN, message, context);
    },

    /**
     * Logs an error message.
     *
     * @param {string} message - The message to log.
     * @param {object|null} [context=null] - Optional structured details.
     * @returns {void}
     */
    error(message, context) {
      append(LOG_LEVEL.ERROR, message, context);
    },

    /**
     * Logs a security event (e.g. unauthorized access attempt).
     *
     * @param {string} message - The message to log.
     * @param {object|null} [context=null] - Optional structured details.
     * @returns {void}
     */
    security(message, context) {
      append(LOG_LEVEL.SECURITY, message, context);
    },

    /**
     * Returns a copy of all log entries.
     * Intended for Core-internal inspection (e.g. tests) only.
     *
     * @returns {Array<object>} A shallow copy of the log entries.
     */
    getEntries() {
      return [...entries];
    },
  };
}
