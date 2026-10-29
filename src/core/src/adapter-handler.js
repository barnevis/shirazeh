// AdapterHandler — injects the active adapter selection into an infrastructure
// plugin's config. Based on the adapterType declared in the plugin's manifest
// and the adapters section of bootstrap.json. Only infrastructure plugins
// receive adapters. The Core passes only the implementation identifier and
// any related configuration; it never loads or instantiates adapter code.

/**
 * Injects the active adapter selection into a plugin's final configuration.
 *
 * If the plugin's manifest declares an `adapterType`, the Core looks up the
 * active adapter for that type in the configuration's `adapters` section. The
 * selection may be either:
 * - A string (the implementation identifier), e.g. `"IndexedDBAdapter"`.
 * - An object with an `implementation` field and optional related config, e.g.
 *   `{ "implementation": "IndexedDBAdapter", "dbName": "my-db" }`.
 *
 * The implementation identifier is injected under the `adapter` key. If the
 * selection is an object with additional fields beyond `implementation`, those
 * fields are injected under the `adapterConfig` key. The plugin is then
 * responsible for loading and using the adapter.
 *
 * Only infrastructure plugins may declare `adapterType`. This is validated at
 * startup by the StartupValidator. Platform and transport plugins must access
 * adapters through an infrastructure plugin's service, not directly.
 *
 * @param {object} manifest - The plugin's manifest (may contain adapterType).
 * @param {object} config - The full bootstrap configuration (contains adapters section).
 * @param {object} finalConfig - The plugin's merged configuration to inject into.
 * @returns {object} The finalConfig with the adapter selection injected if applicable.
 */
export function injectAdapterConfig(manifest, config, finalConfig) {
  if (manifest.adapterType === undefined || manifest.adapterType === null) {
    return { success: true, finalConfig };
  }

  const adapters = config.adapters ?? {};
  const adapterSelection = adapters[manifest.adapterType];

  if (adapterSelection === undefined) {
    // No adapter of this type is configured — this is handled by the
    // StartupValidator (ADAPTER_NOT_CONFIGURED). Nothing to inject.
    return { success: true, finalConfig };
  }

  if (typeof adapterSelection === 'string') {
    // Simple form: just the implementation identifier.
    finalConfig.adapter = adapterSelection;
    return { success: true, finalConfig };
  }

  if (adapterSelection !== null && typeof adapterSelection === 'object' && !Array.isArray(adapterSelection)) {
    // Extended form: an object with an `implementation` field and optional
    // related configuration. The implementation identifier goes under `adapter`;
    // any remaining fields go under `adapterConfig`.
    if (adapterSelection.implementation === undefined) {
      return {
        success: false,
        error: `ADAPTER_SELECTION_INVALID: adapter type "${manifest.adapterType}" is an object without an "implementation" field`,
      };
    }
    finalConfig.adapter = adapterSelection.implementation;
    const adapterConfig = { ...adapterSelection };
    delete adapterConfig.implementation;
    if (Object.keys(adapterConfig).length > 0) {
      finalConfig.adapterConfig = adapterConfig;
    }
    return { success: true, finalConfig };
  }

  // The selection is neither a string nor a valid object — report an explicit
  // configuration error instead of silently ignoring it.
  return {
    success: false,
    error: `ADAPTER_SELECTION_INVALID: adapter type "${manifest.adapterType}" must be a string or an object with an "implementation" field, got ${typeof adapterSelection}`,
  };
}

/**
 * Checks whether a plugin is responsible for a given adapter type.
 *
 * @param {object} manifest - The plugin's manifest.
 * @returns {boolean} True if the plugin declares an adapterType.
 */
export function hasAdapterType(manifest) {
  return manifest.adapterType !== undefined && manifest.adapterType !== null;
}

/**
 * Returns the adapter type a plugin is responsible for, or null.
 *
 * @param {object} manifest - The plugin's manifest.
 * @returns {string|null} The adapter type, or null if not declared.
 */
export function getAdapterType(manifest) {
  return manifest.adapterType ?? null;
}
