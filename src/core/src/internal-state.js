// InternalState — the Core's internal state.
// Maintains the list of registered plugins and their status (ACTIVE/INACTIVE),
// the startup order, group membership, prepared/committed flags, and the UI
// context. Private to the Core; not exposed to plugins.

/**
 * Plugin status values. A plugin is either active or inactive — there is no
 * intermediate state and no "failed" state.
 *
 * @readonly
 * @enum {string}
 */
export const PLUGIN_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

/**
 * Creates a new InternalState instance.
 *
 * The state holds plugin records keyed by plugin name, the startup order list
 * (for reverse shutdown), and the UI context (set when the UI starts). This
 * state belongs to the Core and no plugin has direct access to it.
 *
 * @returns {object} An object with methods to manage plugin records and startup order.
 */
export function createInternalState() {
  /** @type {Map<string, object>} */
  const plugins = new Map();

  /** @type {string[]} */
  const startupOrder = [];

  /** @type {object|null} */
  let uiContext = null;

  return {
    /**
     * Registers a plugin record and appends its name to the startup order.
     * The plugin is registered with INACTIVE status — it becomes ACTIVE only
     * after its startup completes fully.
     *
     * @param {object} record - The plugin record to register.
     * @param {string} record.name - Unique plugin name (vendor.name).
     * @param {string} record.version - Plugin version (MAJOR.MINOR.PATCH).
     * @param {object} record.manifest - The validated manifest.
     * @param {object} record.context - The context handed to the plugin.
     * @returns {object} The stored plugin record.
     */
    registerPlugin(record) {
      const stored = {
        name: record.name,
        version: record.version,
        manifest: record.manifest,
        status: PLUGIN_STATUS.INACTIVE,
        startupIndex: startupOrder.length,
        providedServices: [],
        context: record.context,
        group: record.group ?? null,
        prepared: false,
        committed: false,
      };
      plugins.set(record.name, stored);
      startupOrder.push(record.name);
      return stored;
    },

    /**
     * Returns the plugin record for the given name, or undefined.
     *
     * @param {string} name - The plugin name.
     * @returns {object|undefined} The plugin record.
     */
    getPlugin(name) {
      return plugins.get(name);
    },

    /**
     * Returns true if a plugin with the given name is registered.
     *
     * @param {string} name - The plugin name.
     * @returns {boolean}
     */
    hasPlugin(name) {
      return plugins.has(name);
    },

    /**
     * Sets the status of a plugin.
     *
     * @param {string} name - The plugin name.
     * @param {string} status - One of the PluginStatus values.
     * @returns {void}
     */
    setPluginStatus(name, status) {
      const record = plugins.get(name);
      if (record) {
        record.status = status;
      }
    },

    /**
     * Adds a service name to a plugin's provided services list.
     *
     * @param {string} pluginName - The providing plugin's name.
     * @param {string} serviceName - The service name to add.
     * @returns {void}
     */
    addProvidedService(pluginName, serviceName) {
      const record = plugins.get(pluginName);
      if (record) {
        record.providedServices.push(serviceName);
      }
    },

    /**
     * Clears a plugin's provided services list (used during rollback).
     *
     * @param {string} pluginName - The plugin name.
     * @returns {void}
     */
    clearProvidedServices(pluginName) {
      const record = plugins.get(pluginName);
      if (record) {
        record.providedServices = [];
      }
    },

    /**
     * Marks a plugin as prepared (its prepare() phase succeeded) or not.
     *
     * @param {string} pluginName - The plugin name.
     * @param {boolean} value - True after prepare() succeeds, false if deactivated.
     * @returns {void}
     */
    markPrepared(pluginName, value) {
      const record = plugins.get(pluginName);
      if (record) {
        record.prepared = value;
      }
    },

    /**
     * Marks a plugin as committed (its group committed and services promoted).
     *
     * @param {string} pluginName - The plugin name.
     * @param {boolean} value - True after group commit, false otherwise.
     * @returns {void}
     */
    markCommitted(pluginName, value) {
      const record = plugins.get(pluginName);
      if (record) {
        record.committed = value;
      }
    },

    /**
     * Returns a copy of the startup order list.
     * Used for reverse-order shutdown.
     *
     * @returns {string[]} Plugin names in startup order.
     */
    getStartupOrder() {
      return [...startupOrder];
    },

    /**
     * Stores the UI context so it can be accessed during shutdown.
     *
     * @param {object} context - The UI context.
     * @returns {void}
     */
    setUiContext(context) {
      uiContext = context;
    },

    /**
     * Returns the stored UI context, or null if the UI never started.
     *
     * @returns {object|null}
     */
    getUiContext() {
      return uiContext;
    },
  };
}
