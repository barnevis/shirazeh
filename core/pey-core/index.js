// Pey Core — public entry point.
// Exposes the PeyCore class. This is the only file imported by host applications.
// The Core is platform-neutral: the Runtime Host injects ConfigSource, EnvSource,
// and ModuleLoader (two-step contract: loadManifest then loadEntry) at construction time.

import { start as internalStart } from './src/system-lifecycle.js';

const SOURCE_NAMES = ['configSource', 'envSource', 'moduleLoader'];

/**
 * Validates that a value is a non-null object (not an array).
 *
 * @param {*} value - The value to validate.
 * @param {string} name - The source name, used in the error message.
 * @returns {object} The validated object.
 * @throws {Error} If the value is missing or not an object.
 * @private
 */
function requireObject(value, name) {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error(`${name} is missing or not an object`);
    error.code = 'INVALID_HOST_SOURCE';
    throw error;
  }
  return value;
}

/**
 * Validates that an object exposes a callable method.
 *
 * @param {object} source - The source object to inspect.
 * @param {string} method - The required method name.
 * @param {string} sourceName - The source name, used in the error message.
 * @throws {Error} If the method is missing or not a function.
 * @private
 */
function requireMethod(source, method, sourceName) {
  if (typeof source[method] !== 'function') {
    const error = new Error(`${sourceName} must have a ${method}() method`);
    error.code = 'INVALID_HOST_SOURCE';
    throw error;
  }
}

/**
 * Validates the three Runtime Host sources.
 *
 * - configSource must expose `getConfig()`
 * - envSource must expose `get(varName)`
 * - moduleLoader must expose the two-step contract: `loadManifest(ref)` and `loadEntry(ref)`
 *
 * @param {object} sources - The sources to validate.
 * @throws {Error} If any source is missing or malformed.
 * @private
 */
function validateSources(sources) {
  for (const name of SOURCE_NAMES) {
    requireObject(sources[name], name);
  }
  requireMethod(sources.configSource, 'getConfig', 'configSource');
  requireMethod(sources.envSource, 'get', 'envSource');
  requireMethod(sources.moduleLoader, 'loadManifest', 'moduleLoader');
  requireMethod(sources.moduleLoader, 'loadEntry', 'moduleLoader');
}

/**
 * PeyCore — the platform-neutral Core.
 *
 * Constructed by the Runtime Host with three injected sources:
 * - `configSource` — provides the parsed configuration content via `getConfig()`
 * - `envSource` — provides runtime environment values via `get(varName)`
 * - `moduleLoader` — provides platform-specific access to plugin/UI files via the
 *   two-step contract: `loadManifest(ref)` (must not execute code) then
 *   `loadEntry(ref)` (called only after successful manifest validation)
 */
export class PeyCore {
  /**
   * Creates a new PeyCore instance.
   *
   * @param {object} sources - The Runtime Host sources.
   * @param {object} sources.configSource - Provides configuration content.
   * @param {object} sources.envSource - Provides environment values.
   * @param {object} sources.moduleLoader - Provides manifest and entry loading.
   * @throws {Error} If any source is missing or malformed ("INVALID_HOST_SOURCE").
   */
  constructor({ configSource, envSource, moduleLoader }) {
    validateSources({ configSource, envSource, moduleLoader });
    this.configSource = configSource;
    this.envSource = envSource;
    this.moduleLoader = moduleLoader;
    this.shutdownFn = null;
    this.started = false;
  }

  /**
   * Starts the Pey Core system.
   *
   * Pulls configuration from `configSource.getConfig()`, validates it, creates the
   * core modules, and runs the startup sequence using the injected `envSource` and
   * `moduleLoader`. Returns an object with a `shutdown` function.
   *
   * Calling `start()` more than once without an intervening `shutdown()` is rejected
   * so a previous shutdown function is never silently overwritten.
   *
   * @param {object} [options] - Optional start parameters.
   * @param {Function} [options.onEvent] - Optional callback invoked on every event publish.
   * @returns {Promise<{shutdown: Function}>} An object with a shutdown function.
   * @throws {Error} If `start()` is called while the Core is already running.
   */
  async start(options = {}) {
    if (this.started) {
      const error = new Error('PeyCore is already started; call shutdown() before start() again');
      error.code = 'CORE_ALREADY_STARTED';
      throw error;
    }
    const configContent = await this.configSource.getConfig();
    const result = await internalStart(configContent, this.envSource, this.moduleLoader, options);
    this.shutdownFn = result.shutdown;
    this.started = true;
    return result;
  }

  /**
   * Shuts down the Pey Core system.
   *
   * No-op if `start()` was never called or already shut down.
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this.shutdownFn) {
      const fn = this.shutdownFn;
      this.shutdownFn = null;
      this.started = false;
      await fn();
    }
  }
}
