// Creates the application-owned setup lifecycle around pey.webui contracts.

import { DEFAULT_UI_CONFIG, PEY_ROUTER_SERVICE } from '../contracts.js';

const ERROR_SOURCE = 'pey.webui';
const LIFECYCLE_ACTIVE = 'active';
const LIFECYCLE_IDLE = 'idle';
const LIFECYCLE_SHUTTING_DOWN = 'shutting-down';
const LIFECYCLE_STARTING = 'starting';
const SHUTDOWN_EVENT = 'core:shutdown';

function createPeyWebUiError(code, message) {
  return Object.assign(new Error(message), {
    code,
    source: ERROR_SOURCE,
    type: 'startup',
    timestamp: new Date().toISOString(),
  });
}

function assert(condition, code, message) {
  if (!condition) throw createPeyWebUiError(code, message);
}

function validateContext(context) {
  assert(context && typeof context === 'object', 'PEY_WEBUI_INVALID_CONTEXT', 'UI context must be an object');
  assert(context.services && typeof context.services === 'object' && !Array.isArray(context.services), 'PEY_WEBUI_INVALID_CONTEXT', 'UI services are required');
  assert(context.events && typeof context.events === 'object' && !Array.isArray(context.events), 'PEY_WEBUI_INVALID_CONTEXT', 'UI events are required');
  assert(context.config && typeof context.config === 'object' && !Array.isArray(context.config), 'PEY_WEBUI_INVALID_CONTEXT', 'UI config is required');
  assert(typeof context.events.subscribe === 'function', 'PEY_WEBUI_INVALID_EVENT_BUS', 'UI events.subscribe is required');
  assert(typeof context.events.publish === 'function', 'PEY_WEBUI_INVALID_EVENT_BUS', 'UI events.publish is required');
  assert(context.onShutdown === null, 'PEY_WEBUI_INVALID_CONTEXT', 'UI context.onShutdown must be null before setup');
}

function resolveConfig(config, assetBaseUrlBase) {
  const assetBaseUrl = config.assetBaseUrl ?? DEFAULT_UI_CONFIG.assetBaseUrl;
  assert(typeof assetBaseUrl === 'string' && assetBaseUrl.trim().length > 0, 'PEY_WEBUI_INVALID_CONFIG', 'UI assetBaseUrl must be non-empty');

  let resolvedAssetBaseUrl;
  try {
    resolvedAssetBaseUrl = new URL(
      `${assetBaseUrl.trim().replace(/\/+$/, '')}/`,
      assetBaseUrlBase,
    ).href;
  } catch {
    throw createPeyWebUiError('PEY_WEBUI_INVALID_CONFIG', 'UI assetBaseUrl is invalid');
  }

  const resolvedConfig = {
    ...DEFAULT_UI_CONFIG,
    ...config,
  };

  return {
    ...resolvedConfig,
    theme: typeof resolvedConfig.theme === 'string' ? resolvedConfig.theme.trim() : resolvedConfig.theme,
    language: typeof resolvedConfig.language === 'string' ? resolvedConfig.language.trim() : resolvedConfig.language,
    fallbackPath: typeof resolvedConfig.fallbackPath === 'string'
      ? resolvedConfig.fallbackPath.trim()
      : resolvedConfig.fallbackPath,
    assetBaseUrl: resolvedAssetBaseUrl,
  };
}

function validateResolvedConfig(config) {
  assert(typeof config.theme === 'string' && config.theme.trim().length > 0, 'PEY_WEBUI_INVALID_CONFIG', 'UI theme must be non-empty');
  assert(typeof config.language === 'string' && config.language.trim().length > 0, 'PEY_WEBUI_INVALID_CONFIG', 'UI language must be non-empty');
  assert(['ltr', 'rtl', 'auto'].includes(config.direction), 'PEY_WEBUI_INVALID_CONFIG', 'UI direction is invalid');
  assert(config.fallbackPath === null || (typeof config.fallbackPath === 'string' && config.fallbackPath.trim().length > 0), 'PEY_WEBUI_INVALID_CONFIG', 'UI fallbackPath is invalid');
  assert(typeof config.assetBaseUrl === 'string', 'PEY_WEBUI_INVALID_CONFIG', 'UI assetBaseUrl must resolve to a string URL');
}

function validateRequiredServices(services, requiredServices) {
  for (const serviceName of requiredServices) {
    assert(services[serviceName], 'PEY_WEBUI_REQUIRED_SERVICE_UNAVAILABLE', `Required service is unavailable: ${serviceName}`);
  }
}

function selectServices(services, serviceNames, missingValue) {
  return Object.fromEntries(
    serviceNames.map((serviceName) => [serviceName, services[serviceName] ?? missingValue]),
  );
}

function validateServiceNames(serviceNames, policyName) {
  assert(Array.isArray(serviceNames), 'PEY_WEBUI_INVALID_SETUP_POLICY', `${policyName} must be an array`);
  assert(
    serviceNames.every(
      (serviceName) => typeof serviceName === 'string'
        && serviceName.length > 0
        && serviceName === serviceName.trim(),
    ),
    'PEY_WEBUI_INVALID_SETUP_POLICY',
    `${policyName} must contain only non-empty, trimmed strings`,
  );
}

function validateServiceLists(requiredServices, optionalServices) {
  validateServiceNames(requiredServices, 'requiredServices');
  validateServiceNames(optionalServices, 'optionalServices');
  const requiredSet = new Set(requiredServices);
  assert(
    optionalServices.every((serviceName) => !requiredSet.has(serviceName)),
    'PEY_WEBUI_INVALID_SETUP_POLICY',
    'A service cannot be both required and optional',
  );
}

function validateOptionalServices(services, optionalServices) {
  return selectServices(services, optionalServices, null);
}

function subscribeToShutdown(events, onCoreShutdown) {
  const unsubscribe = events.subscribe(SHUTDOWN_EVENT, onCoreShutdown);
  assert(typeof unsubscribe === 'function', 'PEY_WEBUI_INVALID_EVENT_BUS', 'UI events.subscribe must return an unsubscribe function');
  return unsubscribe;
}

function assertSynchronousResult(result, policyName) {
  if (!result || typeof result.then !== 'function') return;
  void Promise.resolve(result).catch(() => undefined);
  throw createPeyWebUiError(
    'PEY_WEBUI_ASYNC_LIFECYCLE_NOT_SUPPORTED',
    `${policyName} must be synchronous`,
  );
}

function invokeNotificationSafely(callback, resources) {
  try {
    assertSynchronousResult(callback(resources), 'onCoreShutdown');
  } catch {
    console.error('pey.webui core shutdown notification failed');
  }
}

function createShutdown(cleanup) {
  let isShutdown = false;
  return () => {
    if (isShutdown) return;
    isShutdown = true;
    cleanup();
  };
}

/**
 * Creates an application UI setup function from application-owned policies.
 * @param {object} policies Application mounting and cleanup policies.
 * @param {string[]} [policies.requiredServices] Required service names.
 * @param {string[]} [policies.optionalServices] Optional service names.
 * @param {Function} [policies.mountShell] Synchronously mounts the shell.
 * @param {Function} [policies.cleanup] Synchronously releases application resources.
 * @param {Function} [policies.onCoreShutdown] Handles the pre-shutdown notification.
 * @param {string} policies.assetBaseUrlBase Base URL for relative UI assets.
 * @returns {(context: object) => Promise<void>} A Core-compatible setup function.
 */
export function createApplicationSetup(policies = {}) {
  const declaredRequiredServices = policies.requiredServices ?? [];
  const optionalServices = policies.optionalServices ?? [];
  validateServiceNames(declaredRequiredServices, 'requiredServices');
  validateServiceNames(optionalServices, 'optionalServices');
  const requiredServices = [...new Set([PEY_ROUTER_SERVICE, ...declaredRequiredServices])];
  validateServiceLists(requiredServices, optionalServices);
  const mountShell = policies.mountShell ?? (() => undefined);
  const cleanup = policies.cleanup ?? (() => undefined);
  const onCoreShutdown = policies.onCoreShutdown ?? (() => undefined);
  const assetBaseUrlBase = policies.assetBaseUrlBase;
  let lifecycleState = LIFECYCLE_IDLE;

  assert(typeof assetBaseUrlBase === 'string', 'PEY_WEBUI_INVALID_CONFIG', 'assetBaseUrlBase is required');
  assert(typeof mountShell === 'function', 'PEY_WEBUI_INVALID_SETUP_POLICY', 'mountShell must be a function');
  assert(typeof cleanup === 'function', 'PEY_WEBUI_INVALID_SETUP_POLICY', 'cleanup must be a function');
  assert(typeof onCoreShutdown === 'function', 'PEY_WEBUI_INVALID_SETUP_POLICY', 'onCoreShutdown must be a function');

  return async function setup(context) {
    assert(lifecycleState === LIFECYCLE_IDLE, 'PEY_WEBUI_ALREADY_STARTED', 'Application UI is already starting or active');
    lifecycleState = LIFECYCLE_STARTING;
    let isMounted = false;
    let unsubscribeShutdown = null;
    let resources = null;

    const release = createShutdown(() => {
      lifecycleState = LIFECYCLE_SHUTTING_DOWN;
      try {
        unsubscribeShutdown?.();
      } finally {
        unsubscribeShutdown = null;
        try {
          if (isMounted) {
            assertSynchronousResult(cleanup(resources), 'cleanup');
          }
        } finally {
          isMounted = false;
          lifecycleState = LIFECYCLE_IDLE;
        }
      }
    });

    try {
      validateContext(context);
      validateRequiredServices(context.services, requiredServices);
      const required = selectServices(context.services, requiredServices);
      const optional = validateOptionalServices(context.services, optionalServices);
      const config = resolveConfig(context.config, assetBaseUrlBase);
      validateResolvedConfig(config);
      resources = {
        router: context.services[PEY_ROUTER_SERVICE],
        required,
        optional,
        events: context.events,
        config,
      };
      const mountResult = mountShell(resources);
      isMounted = true;
      assertSynchronousResult(mountResult, 'mountShell');
      unsubscribeShutdown = subscribeToShutdown(
        context.events,
        () => invokeNotificationSafely(onCoreShutdown, resources),
      );
      context.onShutdown = release;
      lifecycleState = LIFECYCLE_ACTIVE;
    } catch (error) {
      try {
        release();
      } catch (cleanupError) {
        console.error('pey.webui startup cleanup failed', cleanupError);
      }
      throw error;
    }
  };
}
