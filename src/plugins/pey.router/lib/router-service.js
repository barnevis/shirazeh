// Orchestrates route registration, resolution, navigation, events, and lifecycle.

import {
  ERROR_CODES,
  EVENT_NAMES,
  NAVIGATION_FAILURE_REASONS,
  PLUGIN_NAME,
} from './constants.js';
import { createRouterError, normalizeAdapterError } from './error.js';
import {
  parseQuery,
  prependBasePath,
  serializeQuery,
  splitPath,
  stripBasePath,
  validatePath,
} from './path-utils.js';
import { matchRoute, validatePattern } from './route-matcher.js';

const SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE';

function unavailableError() {
  return createRouterError(SERVICE_UNAVAILABLE, 'Router service is unavailable');
}

function navigationError(error) {
  return normalizeAdapterError(
    error,
    ERROR_CODES.NAVIGATION_FAILED,
    'Router navigation failed',
  );
}

function notFoundRoute(notFoundPath) {
  return {
    path: notFoundPath,
    pattern: notFoundPath,
    params: {},
    query: {},
    isNotFound: true,
  };
}

function matchedRoute(path, pattern, params, query) {
  return { path, pattern, params, query, isNotFound: false };
}

function cloneRoute(route) {
  return {
    ...route,
    params: { ...route.params },
    query: { ...route.query },
  };
}

/**
 * Creates the public router service around a Router adapter.
 *
 * @param {object} options Service dependencies and configuration.
 * @param {object} options.adapter Router adapter implementation.
 * @param {string} options.basePath Application base path.
 * @param {string} options.notFoundPath Not-found sentinel route.
 * @param {(type: string, data: object) => void} options.publish Event publisher.
 * @param {(error: object) => void} options.reportCriticalError Core critical-error reporter.
 * @returns {{service: object, deactivate: function, shutdown: function}} Service and lifecycle controls.
 */
export function createRouterService({
  adapter,
  basePath,
  notFoundPath,
  publish,
  reportCriticalError,
}) {
  validatePath(basePath);
  validatePath(notFoundPath);
  if (typeof reportCriticalError !== 'function') {
    throw new TypeError('reportCriticalError must be a function');
  }

  let available = true;
  let patterns = [];
  let currentRoute = notFoundRoute(notFoundPath);
  let currentRawPath;
  let unsubscribeExternalChange = null;

  function assertAvailable() {
    if (!available) {
      throw unavailableError();
    }
  }

  function resolveRelativePath(relativePath) {
    const { path, queryString } = splitPath(relativePath);

    for (const pattern of patterns) {
      const routeMatch = matchRoute(pattern, path);
      if (routeMatch !== null) {
        return matchedRoute(path, pattern, routeMatch.params, parseQuery(queryString));
      }
    }

    return null;
  }

  function getRelativePath(rawPath) {
    try {
      return stripBasePath(rawPath, basePath);
    } catch {
      return null;
    }
  }

  function publishChanged() {
    publish(EVENT_NAMES.ROUTE_CHANGED, { path: currentRoute.path });
  }

  function applyNotFound(requestedPath) {
    publish(EVENT_NAMES.NAVIGATION_FAILED, {
      path: requestedPath,
      reason: NAVIGATION_FAILURE_REASONS.ROUTE_NOT_FOUND,
    });
    currentRoute = notFoundRoute(notFoundPath);
    publishChanged();
  }

  function resolveRawPath(rawPath, replaceFallback) {
    const relativePath = getRelativePath(rawPath);

    const resolvedRoute = relativePath === null ? null : resolveRelativePath(relativePath);
    if (resolvedRoute !== null) {
      currentRawPath = rawPath;
      currentRoute = resolvedRoute;
      publishChanged();
      return;
    }

    let requestedPath;
    try {
      requestedPath = splitPath(relativePath ?? rawPath).path;
    } catch {
      requestedPath = notFoundPath;
    }
    if (replaceFallback) {
      const fallbackRawPath = prependBasePath(notFoundPath, basePath);
      runAdapterOperation(() => adapter.replaceEntry(fallbackRawPath));
      currentRawPath = fallbackRawPath;
    } else {
      currentRawPath = rawPath;
    }
    applyNotFound(requestedPath);
  }

  function logOperationalError(error) {
    const code = error !== null && typeof error === 'object' && typeof error.code === 'string'
      ? error.code
      : 'UNKNOWN';
    const message = error !== null && typeof error === 'object' && typeof error.message === 'string'
      ? error.message
      : 'Router operation failed';
    console.error(`[${PLUGIN_NAME}] ${code}: ${message}`);
  }

  function isFatalAdapterError(error) {
    return error !== null
      && typeof error === 'object'
      && error.detail?.fatal === true;
  }

  function reportFatalAdapterError(error) {
    reportCriticalError(normalizeAdapterError(
      error,
      ERROR_CODES.EXTERNAL_CHANGE_FAILED,
      'Router adapter connection is permanently unavailable',
      'critical',
    ));
  }

  function subscribeToExternalChanges() {
    unsubscribeExternalChange = adapter.onExternalChange((rawPath) => {
      if (available) {
        try {
          resolveRawPath(rawPath, true);
        } catch (error) {
          if (!isFatalAdapterError(error)) {
            logOperationalError(error);
          }
        }
      }
    });
  }

  function runAdapterOperation(operation) {
    try {
      operation();
    } catch (error) {
      if (isFatalAdapterError(error)) {
        reportFatalAdapterError(error);
      }
      throw navigationError(error);
    }
  }

  async function navigateWith(methodName, path, options = {}) {
    assertAvailable();
    validatePath(path);
    if (path.includes('?')) {
      throw createRouterError(ERROR_CODES.MALFORMED_PATH, 'Navigation path must not include query data');
    }
    const queryString = serializeQuery(options?.query ?? {});
    const relativePath = `${path}${queryString}`;
    const resolvedRoute = resolveRelativePath(relativePath);
    const targetPath = resolvedRoute === null ? notFoundPath : relativePath;
    const rawPath = prependBasePath(targetPath, basePath);

    runAdapterOperation(() => adapter[methodName](rawPath));
    currentRawPath = rawPath;

    if (resolvedRoute === null) {
      applyNotFound(path);
    } else {
      currentRoute = resolvedRoute;
      publishChanged();
    }
  }

  try {
    subscribeToExternalChanges();
    resolveRawPath(adapter.getCurrentPath(), false);
  } catch (error) {
    unsubscribeExternalChange?.();
    unsubscribeExternalChange = null;
    throw error;
  }

  const service = {
    async registerRoutes(newPatterns) {
      assertAvailable();
      if (!Array.isArray(newPatterns)) {
        throw createRouterError(
          ERROR_CODES.MALFORMED_PATTERN,
          'Route patterns must be provided as an array',
        );
      }

      for (const pattern of newPatterns) {
        validatePattern(pattern);
      }

      patterns = [...new Set([...patterns, ...newPatterns])];
      const relativePath = getRelativePath(currentRawPath);
      const resolvedRoute = relativePath === null ? null : resolveRelativePath(relativePath);
      if (currentRoute.isNotFound && resolvedRoute !== null) {
        currentRoute = resolvedRoute;
        publishChanged();
      }
    },

    async navigate(path, options) {
      return navigateWith('pushEntry', path, options);
    },

    async replace(path, options) {
      return navigateWith('replaceEntry', path, options);
    },

    async back() {
      assertAvailable();
      runAdapterOperation(() => adapter.goBack());
    },

    async forward() {
      assertAvailable();
      runAdapterOperation(() => adapter.goForward());
    },

    getCurrentRoute() {
      assertAvailable();
      return cloneRoute(currentRoute);
    },

    matchRoute(pattern, path) {
      assertAvailable();
      return matchRoute(pattern, path);
    },
  };

  function deactivate() {
    if (!available) {
      return;
    }
    available = false;
    unsubscribeExternalChange?.();
    unsubscribeExternalChange = null;
  }

  return {
    service,
    deactivate,
    shutdown: deactivate,
  };
}
