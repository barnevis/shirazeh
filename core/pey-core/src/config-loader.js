// ConfigLoader — validates configuration content and orchestrates env var substitution
// and per-plugin config merge. The Core is platform-neutral: the host provides the
// parsed configuration content and a runtime environment source.

import { substituteEnvVars } from './env-substitutor.js';
import { mergePluginConfig } from './config-merger.js';

/**
 * The required top-level sections in the configuration content.
 * If any of these is missing, the configuration is invalid.
 *
 * @private
 * @type {string[]}
 */
const REQUIRED_SECTIONS = ['architecture', 'core', 'adapters', 'ui', 'plugins', 'config', 'app'];

/**
 * Validates and loads the configuration content provided by the host.
 *
 * This is the Core's first startup step. The Core does not read files — the
 * host application provides the already-parsed configuration content through
 * a platform-neutral source. The Core only validates and processes it.
 *
 * @param {object} configContent - The parsed configuration object from the host.
 * @param {object} envSource - A platform-neutral runtime environment source with a `get(varName)` method.
 * @returns {object} The validated configuration with all env vars substituted.
 * @throws {Error} If configContent is missing ("CONFIG_FILE_MISSING"), invalid ("CONFIG_FILE_INVALID"),
 *                 or envSource is invalid ("INVALID_ENV_SOURCE").
 */
export function load(configContent, envSource) {
  validateConfigContent(configContent);
  validateEnvSource(envSource);

  validateStructure(configContent);

  return substituteEnvVars(configContent, envSource);
}

/**
 * Validates that configContent is a non-null, non-array object.
 *
 * @param {*} configContent - The value to validate.
 * @throws {Error} If configContent is missing or not an object ("CONFIG_FILE_MISSING").
 * @private
 */
function validateConfigContent(configContent) {
  if (configContent === null || configContent === undefined || typeof configContent !== 'object' || Array.isArray(configContent)) {
    const error = new Error('Configuration content is missing or not an object');
    error.code = 'CONFIG_FILE_MISSING';
    throw error;
  }
}

/**
 * Validates that envSource is an object with a callable `get` method.
 *
 * envSource is external input provided by the host. If it is invalid, a clear
 * error with a code is thrown here — not a raw JavaScript error deep in the
 * substitution logic.
 *
 * @param {*} envSource - The value to validate.
 * @throws {Error} If envSource is not an object or lacks a `get` method ("INVALID_ENV_SOURCE").
 * @private
 */
function validateEnvSource(envSource) {
  if (envSource === null || envSource === undefined || typeof envSource !== 'object' || Array.isArray(envSource)) {
    const error = new Error('Environment source is missing or not an object');
    error.code = 'INVALID_ENV_SOURCE';
    throw error;
  }

  if (typeof envSource.get !== 'function') {
    const error = new Error('Environment source must have a get(varName) method');
    error.code = 'INVALID_ENV_SOURCE';
    throw error;
  }
}

/**
 * Validates that the configuration has all required top-level sections.
 *
 * @param {object} config - The parsed configuration object.
 * @throws {Error} If a required section is missing ("CONFIG_FILE_INVALID").
 * @private
 */
function validateStructure(config) {
  for (const section of REQUIRED_SECTIONS) {
    if (!(section in config)) {
      const error = new Error(`Configuration is missing required section: "${section}"`);
      error.code = 'CONFIG_FILE_INVALID';
      throw error;
    }
  }
}

export { substituteEnvVars, mergePluginConfig };
