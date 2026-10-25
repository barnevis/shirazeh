// ConfigMerger — deep-merges a plugin's manifest default configuration
// with the project configuration. Project values always take priority.

/**
 * Merges a plugin's manifest default configuration with the project configuration.
 *
 * Project values always take priority over manifest defaults. The merge is a
 * deep merge: nested objects are merged recursively, not replaced wholesale.
 *
 * @param {object|null} manifestDefaults - Default configuration from the plugin's manifest.
 * @param {object|null} projectConfig - Override configuration from the project config.
 * @returns {object} The merged configuration.
 * @throws {Error} If projectConfig is a non-object, non-null value ("INVALID_PLUGIN_CONFIG").
 */
export function mergePluginConfig(manifestDefaults, projectConfig) {
  const merged = deepCopy(manifestDefaults ?? {});

  if (projectConfig === null || projectConfig === undefined) {
    return merged;
  }

  if (typeof projectConfig !== 'object' || Array.isArray(projectConfig)) {
    const error = new Error('Plugin configuration must be an object, null, or undefined');
    error.code = 'INVALID_PLUGIN_CONFIG';
    throw error;
  }

  deepMerge(merged, projectConfig);
  return merged;
}

/**
 * Creates a deep copy of a value.
 *
 * @param {*} value - The value to copy.
 * @returns {*} A deep copy of the value.
 * @private
 */
function deepCopy(value) {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(deepCopy);
  }

  const copy = {};
  for (const key of Object.keys(value)) {
    copy[key] = deepCopy(value[key]);
  }
  return copy;
}

/**
 * Deep-merges source into target. Source values override target values.
 * Nested objects are merged recursively.
 *
 * @param {object} target - The target object (modified in place).
 * @param {object} source - The source object.
 * @returns {void}
 * @private
 */
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      deepMerge(targetValue, sourceValue);
    } else {
      target[key] = deepCopy(sourceValue);
    }
  }
}
