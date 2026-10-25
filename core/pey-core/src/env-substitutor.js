// EnvSubstitutor — substitutes ${ENV_VAR_NAME} placeholders in configuration
// using a platform-neutral runtime environment source.
// The Core does not access process.env directly; the host provides an envSource.

/**
 * Regex that matches the `${ENV_VAR_NAME}` placeholder format.
 *
 * @private
 */
const ENV_VAR_PATTERN = /^\$\{([A-Z_][A-Z0-9_]*)\}$/;

/**
 * Recursively substitutes `${ENV_VAR_NAME}` placeholders with values from the
 * platform-neutral runtime environment source.
 *
 * All substituted values are strings — the Core does not preserve data types.
 * Each plugin is responsible for converting configuration values to the type
 * it needs. Resolved sensitive values are not retained longer than necessary
 * and must never appear in the internal log, the error structure, or any event.
 *
 * @param {*} node - The configuration node to process (string, object, array, or primitive).
 * @param {object} envSource - The runtime environment source with a `get(varName)` method.
 * @returns {*} The node with all placeholders substituted.
 * @throws {Error} If a referenced environment variable is not defined ("ENV_VAR_MISSING").
 */
export function substituteEnvVars(node, envSource) {
  if (typeof node === 'string') {
    return substituteString(node, envSource);
  }

  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    if (isEnvVarObject(node)) {
      return substituteEnvVarObject(node, envSource);
    }

    const result = {};
    for (const key of Object.keys(node)) {
      result[key] = substituteEnvVars(node[key], envSource);
    }
    return result;
  }

  if (Array.isArray(node)) {
    return node.map((item) => substituteEnvVars(item, envSource));
  }

  return node;
}

/**
 * Checks whether an object matches the `{ "env": "${VAR_NAME}", "required": true }` form.
 *
 * @param {object} obj - The object to check.
 * @returns {boolean} True if the object is an env var declaration.
 * @private
 */
function isEnvVarObject(obj) {
  const keys = Object.keys(obj);
  return keys.length === 2 && keys.includes('env') && keys.includes('required') && typeof obj.env === 'string' && typeof obj.required === 'boolean';
}

/**
 * Substitutes a simple `${VAR_NAME}` string placeholder.
 *
 * @param {string} value - The string to check.
 * @param {object} envSource - The runtime environment source.
 * @returns {string} The substituted value, or the original string if no placeholder.
 * @throws {Error} If the referenced env var is not defined.
 * @private
 */
function substituteString(value, envSource) {
  const match = value.match(ENV_VAR_PATTERN);
  if (!match) {
    return value;
  }

  const varName = match[1];
  const envValue = envSource.get(varName);
  if (envValue === undefined) {
    const error = new Error(`Environment variable not defined: ${varName}`);
    error.code = 'ENV_VAR_MISSING';
    throw error;
  }

  return envValue;
}

/**
 * Substitutes a `{ "env": "${VAR_NAME}", "required": true }` object.
 *
 * @param {object} obj - The env var declaration object.
 * @param {object} envSource - The runtime environment source.
 * @returns {string} The substituted value.
 * @throws {Error} If the env var is required but not defined.
 * @private
 */
function substituteEnvVarObject(obj, envSource) {
  const match = obj.env.match(ENV_VAR_PATTERN);
  if (!match) {
    return obj.env;
  }

  const varName = match[1];
  const envValue = envSource.get(varName);

  if (envValue === undefined && obj.required) {
    const error = new Error(`Required environment variable not defined: ${varName}`);
    error.code = 'ENV_VAR_REQUIRED_MISSING';
    throw error;
  }

  if (envValue === undefined) {
    return obj.env;
  }

  return envValue;
}
