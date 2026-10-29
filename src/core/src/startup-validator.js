// StartupValidator — validates plugin manifests before activation.
// Stage 1 (validateDeclarations): cross-manifest declaration validation — architecture
//   version, service-provider uniqueness, required-dependency-has-declared-provider,
//   and adapterType rules. Runs across all manifests before any entry point is loaded.
// Stage 2 (settleRequiredDependencies): actual-availability check — verifies each required
//   dependency's provider actually prepared the service, cascading deactivation otherwise.
// The legacy per-plugin validate() is retained until the group-based startup (Phase 5)
// replaces it.

/**
 * Plugin type values used for adapterType validation.
 *
 * @private
 */
const INFRASTRUCTURE_TYPE = 'infrastructure';

/**
 * Checks whether a plugin's declared architecture version is compatible
 * with the Core's architecture version.
 *
 * The architecture version follows `MAJOR.MINOR` format. Compatibility rules:
 * - If MAJOR differs → incompatible.
 * - If plugin's MINOR > core's MINOR → plugin written for newer arch → incompatible.
 * - If MAJOR is the same and plugin MINOR <= core MINOR → compatible.
 *
 * @param {string} pluginArch - The plugin's declared architecture version (e.g. "0.5").
 * @param {string} coreArch - The Core's architecture version from bootstrap.json (e.g. "0.5").
 * @returns {boolean} True if the plugin is compatible with the Core.
 */
export function isArchitectureCompatible(pluginArch, coreArch) {
  const pluginParts = parseVersion(pluginArch);
  const coreParts = parseVersion(coreArch);

  if (pluginParts === null || coreParts === null) {
    return false;
  }

  if (pluginParts.major !== coreParts.major) {
    return false;
  }

  if (pluginParts.minor > coreParts.minor) {
    return false;
  }

  return true;
}

/**
 * Parses a `MAJOR.MINOR` version string into its components.
 *
 * @param {string} version - The version string (e.g. "0.5").
 * @returns {{major: number, minor: number}|null} The parsed version, or null if invalid.
 * @private
 */
function parseVersion(version) {
  if (typeof version !== 'string') {
    return null;
  }

  const parts = version.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const major = Number.parseInt(parts[0], 10);
  const minor = Number.parseInt(parts[1], 10);

  if (Number.isNaN(major) || Number.isNaN(minor)) {
    return null;
  }

  return { major, minor };
}

/**
 * Validates a plugin's manifest before activation.
 *
 * Performs four checks:
 * 1. Architecture version compatibility (MAJOR.MINOR rules).
 * 2. Plugin name uniqueness (no duplicate names in the system).
 * 3. Required dependencies exist in the Registry.
 * 4. adapterType validation (infrastructure-only, no duplicates, adapter must be configured).
 *
 * A failed plugin is simply considered inactive — Pey has no "failed" state.
 * If the failing plugin is infrastructure, the failure is fatal (stops startup).
 * A duplicate adapterType is a system-fatal error that stops the entire system.
 *
 * @param {object} manifest - The plugin's manifest to validate.
 * @param {string} coreVersion - The Core's architecture version from bootstrap.json.
 * @param {object} internalState - The Core's internal state (for uniqueness and adapterType checks).
 * @param {object} registry - The Registry (for dependency checks).
 * @param {object} config - The bootstrap configuration (for adapter checks).
 * @returns {{valid: boolean, errors?: string[], fatal?: boolean, systemFatal?: boolean}}
 *   - `valid: true` if all checks pass.
 *   - `valid: false, errors` if per-plugin checks fail.
 *   - `valid: false, fatal: true` if an infrastructure plugin fails (stops startup).
 *   - `valid: false, systemFatal: true` if a duplicate adapterType is found (stops entire system).
 */
export function validate(manifest, coreVersion, internalState, registry, config) {
  const errors = [];

  // Check 1: Architecture version compatibility
  if (!isArchitectureCompatible(manifest.architecture, coreVersion)) {
    errors.push(`INCOMPATIBLE_ARCHITECTURE: plugin wants ${manifest.architecture}, core is ${coreVersion}`);
  }

  // Check 2: Plugin name uniqueness
  if (internalState.hasPlugin(manifest.name)) {
    errors.push(`DUPLICATE_PLUGIN_NAME: ${manifest.name}`);
  }

  // Check 3: Required dependencies exist in Registry
  const requiredDeps = manifest.dependencies?.required ?? [];
  for (const serviceName of requiredDeps) {
    if (!registry.has(serviceName)) {
      errors.push(`MISSING_REQUIRED_DEPENDENCY: ${serviceName} needed by ${manifest.name}`);
    }
  }

  // Check 4: adapterType validation (infrastructure plugins only)
  if (manifest.adapterType !== undefined && manifest.adapterType !== null) {
    const adapterTypeError = validateAdapterType(manifest, internalState, config);
    if (adapterTypeError.systemFatal) {
      return { valid: false, systemFatal: true, errors: [adapterTypeError.message] };
    }
    if (adapterTypeError.error) {
      errors.push(adapterTypeError.error);
    }
  }

  if (errors.length > 0) {
    const isInfrastructure = manifest.type === INFRASTRUCTURE_TYPE;
    return { valid: false, errors, fatal: isInfrastructure };
  }

  return { valid: true };
}

/**
 * Validates the adapterType field of an infrastructure plugin's manifest.
 *
 * Rules:
 * - adapterType is only allowed for infrastructure plugins.
 * - Duplicate adapterType across infrastructure plugins is a system-fatal error.
 * - If no adapter of that type is defined in bootstrap.json, the plugin fails to start.
 *
 * @param {object} manifest - The plugin's manifest.
 * @param {object} internalState - The Core's internal state.
 * @param {object} config - The bootstrap configuration.
 * @returns {{error?: string, systemFatal?: boolean, message?: string}}
 *   Validation result with optional error or systemFatal flag.
 * @private
 */
function validateAdapterType(manifest, internalState, config) {
  if (manifest.type !== INFRASTRUCTURE_TYPE) {
    return {
      error: `ADAPTER_TYPE_NOT_ALLOWED: ${manifest.name} is not infrastructure but declares adapterType ${manifest.adapterType}`,
    };
  }

  // Check for duplicate adapterType across already-registered infrastructure plugins
  const startupOrder = internalState.getStartupOrder();
  for (const pluginName of startupOrder) {
    const existing = internalState.getPlugin(pluginName);
    if (existing && existing.manifest.adapterType === manifest.adapterType) {
      return {
        systemFatal: true,
        message: `DUPLICATE_ADAPTER_TYPE: ${manifest.adapterType} declared by ${manifest.name} and ${pluginName}`,
      };
    }
  }

  // Check that an adapter of this type is defined in bootstrap.json
  if (!config.adapters || !(manifest.adapterType in config.adapters)) {
    return {
      error: `ADAPTER_NOT_CONFIGURED: ${manifest.name} needs adapter type ${manifest.adapterType} but none defined in bootstrap.json`,
    };
  }

  return {};
}

/**
 * Stage 1 — Declaration validation across all loaded manifests.
 *
 * Runs before any entry point is loaded. Checks:
 * 1. Architecture version compatibility for every manifest.
 * 2. Service-provider uniqueness — every declared service name has exactly one provider.
 * 3. Required-dependency-has-declared-provider — every required dependency is declared
 *    in some validated manifest's `provides`.
 * 4. adapterType rules — infrastructure-only, no duplicates, adapter must be configured.
 *
 * This is declaration validation, not a claim that a service is already active.
 * Actual availability is checked during settlement (settleRequiredDependencies).
 *
 * @param {Map<string, object>} manifests - All loaded manifests, keyed by plugin name.
 * @param {string} coreVersion - The Core's architecture version from bootstrap.json.
 * @param {object} config - The bootstrap configuration (for adapter checks).
 * @returns {{valid: boolean, errors?: Array<{plugin: string, code: string, message: string}>, systemFatal?: boolean, systemFatalErrors?: string[]}}
 *   - `valid: true` if all checks pass.
 *   - `valid: false, errors` if per-plugin checks fail (each affected plugin is deactivated).
 *   - `valid: false, systemFatal: true, systemFatalErrors` if a system-fatal error
 *     (duplicate service provider or duplicate adapterType) is found.
 */
export function validateDeclarations(manifests, coreVersion, config) {
  const errors = [];
  const systemFatalErrors = [];

  // Collect all declared service names and their providers.
  const serviceProviders = new Map();

  for (const [pluginName, manifest] of manifests) {
    // Check 1: Architecture version compatibility
    if (!isArchitectureCompatible(manifest.architecture, coreVersion)) {
      errors.push({
        plugin: pluginName,
        code: 'INCOMPATIBLE_ARCHITECTURE',
        message: `plugin wants ${manifest.architecture}, core is ${coreVersion}`,
      });
    }

    // Collect service providers
    const provides = manifest.provides ?? [];
    for (const service of provides) {
      if (!serviceProviders.has(service.name)) {
        serviceProviders.set(service.name, []);
      }
      serviceProviders.get(service.name).push(pluginName);
    }
  }

  // Check 2: Every declared service name has exactly one provider
  for (const [serviceName, providers] of serviceProviders) {
    if (providers.length > 1) {
      systemFatalErrors.push(
        `DUPLICATE_SERVICE_PROVIDER: ${serviceName} declared by ${providers.join(', ')}`,
      );
    }
  }

  // Check 3: Every required dependency is declared in some manifest's provides
  const allProvidedServices = new Set(serviceProviders.keys());
  for (const [pluginName, manifest] of manifests) {
    const requiredDeps = manifest.dependencies?.required ?? [];
    for (const serviceName of requiredDeps) {
      if (!allProvidedServices.has(serviceName)) {
        errors.push({
          plugin: pluginName,
          code: 'MISSING_REQUIRED_DEPENDENCY_DECLARATION',
          message: `${serviceName} needed by ${pluginName} has no declared provider`,
        });
      }
    }
  }

  // Check 4: adapterType validation (infrastructure-only, no duplicates, adapter configured)
  const seenAdapterTypes = new Set();
  for (const [pluginName, manifest] of manifests) {
    if (manifest.adapterType === undefined || manifest.adapterType === null) {
      continue;
    }

    if (manifest.type !== INFRASTRUCTURE_TYPE) {
      errors.push({
        plugin: pluginName,
        code: 'ADAPTER_TYPE_NOT_ALLOWED',
        message: `${pluginName} is not infrastructure but declares adapterType ${manifest.adapterType}`,
      });
      continue;
    }

    if (seenAdapterTypes.has(manifest.adapterType)) {
      systemFatalErrors.push(
        `DUPLICATE_ADAPTER_TYPE: ${manifest.adapterType} declared by multiple infrastructure plugins`,
      );
    }
    seenAdapterTypes.add(manifest.adapterType);

    if (!config.adapters || !(manifest.adapterType in config.adapters)) {
      errors.push({
        plugin: pluginName,
        code: 'ADAPTER_NOT_CONFIGURED',
        message: `${pluginName} needs adapter type ${manifest.adapterType} but none defined in bootstrap.json`,
      });
    }
  }

  if (systemFatalErrors.length > 0) {
    return { valid: false, systemFatal: true, systemFatalErrors };
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Stage 2 — Actual availability check (settlement).
 *
 * After preparation, verifies that each required dependency's provider actually
 * prepared the service. A service is available if it is in the private startup
 * registry (prepared by a surviving plugin in this group) or in the public
 * registry (committed by a previous group). When a required dependency is
 * unavailable, the dependent plugin is deactivated and its prepared services are
 * removed from the startup registry. This cascades to the dependent's own
 * dependents. The loop repeats until no remaining plugin has an unavailable
 * required dependency.
 *
 * @param {Set<string>|string[]} preparedPlugins - Plugin names that successfully prepared.
 * @param {Map<string, object>} manifests - All manifests, keyed by plugin name.
 * @param {object} startupRegistry - The private startup registry.
 * @param {object} publicRegistry - The public Registry.
 * @param {object} logger - The Core's internal logger (for the max-iteration warning).
 * @returns {Set<string>} Plugin names to deactivate (cascade).
 */
export function settleRequiredDependencies(preparedPlugins, manifests, startupRegistry, publicRegistry, logger) {
  const toDeactivate = new Set();
  let changed = true;
  // Safety guard: each iteration deactivates at least one plugin, so the loop
  // needs at most preparedPlugins.length passes to deactivate everything, plus
  // one final pass that confirms no further changes are needed (changed = false).
  // A hard cap of N+1 prevents an infinite loop if a bug causes no progress,
  // while allowing the legitimate full-cascade + confirm case.
  const remaining = Array.from(preparedPlugins);
  let maxIterations = remaining.length + 1;

  while (changed && maxIterations > 0) {
    maxIterations -= 1;
    changed = false;

    for (const pluginName of remaining) {
      if (toDeactivate.has(pluginName)) {
        continue;
      }

      const manifest = manifests.get(pluginName);
      const requiredDeps = manifest.dependencies?.required ?? [];

      for (const serviceName of requiredDeps) {
        // Check if the service is available: either in the startup registry
        // (prepared by a surviving plugin in this group) or in the public
        // registry (committed by a previous group).
        let providerAvailable = false;
        if (startupRegistry.has(serviceName)) {
          const provider = startupRegistry.getProvider(serviceName);
          if (!toDeactivate.has(provider)) {
            providerAvailable = true;
          }
        } else if (publicRegistry.has(serviceName)) {
          providerAvailable = true;
        }

        if (!providerAvailable) {
          toDeactivate.add(pluginName);
          // Remove this plugin's prepared services from the startup registry
          startupRegistry.removeByPlugin(pluginName);
          changed = true;
          break;
        }
      }
    }
  }

  // If the guard was exhausted but the loop still wanted to change, log a
  // warning — this indicates a logic bug, not a normal startup condition.
  if (changed) {
    logger.warn('SETTLEMENT_MAX_ITERATIONS_EXHAUSTED', { preparedCount: remaining.length });
  }

  return toDeactivate;
}
