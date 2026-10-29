// ErrorManager — defines the PeyError structure and manages system-level errors.
// Handles startup errors (core:plugin-failed) and critical errors (core:plugin-crashed),
// and publishes core:ui-failed and core:startup-failed when appropriate.

import { hasNoSensitiveData as _hasNoSensitiveData } from './security.js';

/**
 * Error type values. Every error in Pey must be one of these three types.
 *
 * - STARTUP: occurs while loading a plugin; handled by the Core.
 * - OPERATIONAL: occurs during normal operation; handled by the plugin itself.
 * - CRITICAL: completely disables a plugin; the plugin reports it to the Core.
 *
 * @readonly
 * @enum {string}
 */
export const ERROR_TYPE = Object.freeze({
  STARTUP: 'startup',
  OPERATIONAL: 'operational',
  CRITICAL: 'critical',
});

/**
 * Core error event names published via the Event Bus.
 *
 * @readonly
 * @enum {string}
 */
export const CORE_ERROR_EVENTS = Object.freeze({
  PLUGIN_FAILED: 'core:plugin-failed',
  PLUGIN_CRASHED: 'core:plugin-crashed',
  UI_FAILED: 'core:ui-failed',
  STARTUP_FAILED: 'core:startup-failed',
  SERVICE_UNAVAILABLE: 'core:service-unavailable',
  READY: 'core:ready',
  SHUTDOWN: 'core:shutdown',
});

/**
 * Startup failure reason codes used in `core:plugin-failed` event data.
 *
 * These codes identify why a plugin was deactivated during startup. They are
 * machine-readable and stable; logic makes decisions based on these codes,
 * never on error message text.
 *
 * @readonly
 * @enum {string}
 */
export const STARTUP_FAILURE_REASON = Object.freeze({
  REQUIRED_DEPENDENCY_UNAVAILABLE: 'REQUIRED_DEPENDENCY_UNAVAILABLE',
});

/**
 * Creates a standard PeyError object.
 *
 * Every error in Pey must include: code, message, source, type, timestamp,
 * and an optional detail field. Sensitive data (passwords, tokens, personal
 * information) must never appear in any field — not even in detail.
 *
 * @param {object} params - The error parameters.
 * @param {string} params.code - A unique code for this type of error.
 * @param {string} params.message - A human-readable description (for logging/debugging).
 * @param {string} params.source - The plugin or part name where the error occurred (vendor.name).
 * @param {string} params.type - One of the ERROR_TYPE values.
 * @param {*} [params.detail=null] - Optional additional debugging information.
 * @returns {object} A PeyError object with all required fields.
 * @throws {Error} If code, message, source, or type is missing or empty.
 */
export function createPeyError({ code, message, source, type, detail = null }) {
  if (!code) {
    throw new Error('PeyError requires a non-empty "code" field');
  }
  if (!message) {
    throw new Error('PeyError requires a non-empty "message" field');
  }
  if (!source) {
    throw new Error('PeyError requires a non-empty "source" field');
  }
  if (!type) {
    throw new Error('PeyError requires a non-empty "type" field');
  }

  const validTypes = Object.values(ERROR_TYPE);
  if (!validTypes.includes(type)) {
    throw new Error(`PeyError "type" must be one of: ${validTypes.join(', ')}`);
  }

  return {
    code,
    message,
    source,
    type,
    timestamp: new Date().toISOString(),
    detail: detail ?? null,
  };
}

/**
 * Validates that a PeyError object has the standard structure.
 *
 * An error without structure cannot be logged or managed. This function checks
 * that all required fields are present and that the type is valid.
 *
 * @param {object} error - The error object to validate.
 * @returns {boolean} True if the error has the standard structure.
 */
export function hasStandardStructure(error) {
  if (error === null || typeof error !== 'object') {
    return false;
  }

  const requiredFields = ['code', 'message', 'source', 'type', 'timestamp'];
  for (const field of requiredFields) {
    if (!(field in error) || error[field] === undefined || error[field] === null || error[field] === '') {
      return false;
    }
  }

  const validTypes = Object.values(ERROR_TYPE);
  if (!validTypes.includes(error.type)) {
    return false;
  }

  return true;
}

/**
 * Checks whether a PeyError does not contain sensitive data in any field.
 *
 * Sensitive data (passwords, tokens, personal information) must not appear in
 * errors — not even in the detail field.
 *
 * @param {object} error - The error object to check.
 * @returns {boolean} True if no sensitive data is detected.
 */
export function hasNoSensitiveData(error) {
  return _hasNoSensitiveData(error);
}

/**
 * Creates the event payload for a core error event.
 *
 * @param {string} eventType - One of the CORE_ERROR_EVENTS values.
 * @param {object} data - The event data.
 * @returns {{type: string, data: object}} The event payload ready for the Event Bus.
 */
export function createCoreErrorEvent(eventType, data) {
  return { type: eventType, data };
}
