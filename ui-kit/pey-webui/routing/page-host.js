// Mounts pages for resolved routes via the Entry Point's page-loader registry
// and reacts to router:changed. Mounting and route-ownership policy:
// docs/decisions.md#page-host-mounting, #no-route-registration-in-the-host,
// #fallback-retry-policy.

import { PAGE_FALLBACK_STATES, TAG as FALLBACK_TAG } from './page-fallback.js';
import { defaultConnect } from './page-loader.js';
import { createI18n } from '../i18n/create-i18n.js';

const ERROR_SOURCE = 'pey.webui';
const ROUTER_CHANGED_EVENT = 'router:changed';
const PAGE_SLOT = 'page';
const LANGUAGE_KEY = 'language';

const FAILURE_NOT_FOUND = Object.freeze({ state: PAGE_FALLBACK_STATES.NOT_FOUND, canRetry: false });
const FAILURE_LOAD_FAILED = Object.freeze({ state: PAGE_FALLBACK_STATES.LOAD_FAILED, canRetry: true });

function createPeyWebUiError(code, message) {
  return Object.assign(new Error(message), {
    code,
    source: ERROR_SOURCE,
    type: 'operational',
    timestamp: new Date().toISOString(),
  });
}

function logError(code) {
  console.error(`[${ERROR_SOURCE}] ${code}`);
}

function isSharedStateFacade(sharedState) {
  return sharedState !== null
    && typeof sharedState === 'object'
    && typeof sharedState.get === 'function'
    && typeof sharedState.set === 'function'
    && typeof sharedState.subscribe === 'function';
}

function subscribeToLanguage(sharedState, apply) {
  let unsubscribe;
  try {
    unsubscribe = sharedState.subscribe(LANGUAGE_KEY, apply);
  } catch {
    logError('PEY_PAGE_HOST_SHARED_STATE_SUBSCRIBE_FAILED');
    return () => {};
  }
  if (typeof unsubscribe !== 'function') {
    logError('PEY_PAGE_HOST_SHARED_STATE_SUBSCRIBE_FAILED');
    return () => {};
  }
  return unsubscribe;
}

function validateHostDependencies(deps) {
  const required = {
    hostElement: deps.hostElement instanceof HTMLElement,
    events: deps.events && typeof deps.events.subscribe === 'function',
    router: deps.router && typeof deps.router.getCurrentRoute === 'function',
    registry: deps.registry && typeof deps.registry.getEntry === 'function',
    infrastructure: deps.infrastructure && typeof deps.infrastructure.events === 'object',
  };
  const missing = Object.keys(required).filter((name) => !required[name]);
  if (missing.length > 0) {
    throw createPeyWebUiError('PEY_PAGE_HOST_INVALID', `Invalid page host dependency: ${missing.join(', ')}`);
  }
}

/**
 * Creates the page host that mounts pages into an application shell.
 * @param {object} options Host options.
 * @param {HTMLElement} options.hostElement Element pages are mounted into.
 * @param {object} options.events Shared event facade with subscribe().
 * @param {object} options.router Router with getCurrentRoute() and navigation methods.
 * @param {object} options.registry Page-loader registry from createPageLoaderRegistry().
 * @param {object} options.infrastructure Shared infrastructure facades.
 * @param {object} options.refs Base refs pages receive (services, shared state, t, format).
 * @param {object} [options.config] Resolved UI config.
 * @returns {object} Page host: mountForRoute(route) and dispose().
 */
export function createPageHost({ hostElement, events, router, registry, infrastructure, refs = {}, config = {} }) {
  validateHostDependencies({ hostElement, events, router, registry, infrastructure });

  const fallbackPath = typeof config.fallbackPath === 'string' && config.fallbackPath.trim().length > 0 ? config.fallbackPath : null;
  // The kit's own t is the bootstrap default when the Entry Point injects no t.
  // When a valid shared-state facade is available, its `language` key is
  // authoritative for that default and changes re-render an active fallback;
  // the shared-state path is best-effort, so any failure keeps config.language.
  const sharedState = isSharedStateFacade(refs.sharedState) ? refs.sharedState : null;
  const hasInjectedT = typeof refs.t === 'function';
  let initialLanguage = config.language;
  if (sharedState) {
    try {
      const storedLanguage = sharedState.get(LANGUAGE_KEY);
      if (typeof storedLanguage === 'string' && storedLanguage.trim().length > 0) {
        initialLanguage = storedLanguage.trim();
      }
    } catch {
      logError('PEY_PAGE_HOST_SHARED_STATE_READ_FAILED');
    }
  }
  let t = hasInjectedT ? refs.t : createI18n({ language: initialLanguage }).t;
  let lastFallback = null;
  let generation = 0;
  let disposed = false;
  let mounted = null;

  function unmountCurrent() {
    if (mounted) {
      mounted.remove();
      mounted = null;
    }
  }

  function buildFallbackElement({ state, canRetry, entry, route }) {
    const fallback = document.createElement(FALLBACK_TAG);
    fallback.slot = PAGE_SLOT;
    fallback.connect({
      infrastructure,
      refs: {
        state,
        canRetry,
        router,
        fallbackPath,
        t,
        onRetry: canRetry && entry ? () => mountForRoute(route) : null,
      },
    });
    return fallback;
  }

  function mountFallback({ state, canRetry, entry, route }) {
    unmountCurrent();
    lastFallback = { state, canRetry, entry, route };
    try {
      const fallback = buildFallbackElement({ state, canRetry, entry, route });
      hostElement.append(fallback);
      mounted = fallback;
    } catch (error) {
      logError('PEY_PAGE_FALLBACK_MOUNT_FAILED');
    }
  }

  // Re-renders the active fallback (used on language change) without dropping
  // the current fallback first: replaceWith swaps the new element in atomically,
  // so the existing fallback is only discarded once the new one is in place and
  // any failure leaves the previous fallback and translation untouched.
  function remountFallback() {
    if (!lastFallback) return false;
    try {
      const fallback = buildFallbackElement(lastFallback);
      if (mounted) {
        mounted.replaceWith(fallback);
      } else {
        hostElement.append(fallback);
      }
      mounted = fallback;
      return true;
    } catch (error) {
      logError('PEY_PAGE_FALLBACK_RENDER_FAILED');
      return false;
    }
  }

  async function mountEntry(entry, route, current, failure = FAILURE_LOAD_FAILED) {
    if (disposed || current !== generation) return;
    unmountCurrent();
    try {
      await entry.load();
      if (disposed || current !== generation) return;
      if (!customElements.get(entry.element)) {
        throw createPeyWebUiError('PEY_PAGE_DEFINITION_MISSING', `Page element is not defined: ${entry.element}`);
      }
    } catch (error) {
      if (disposed || current !== generation) return;
      logError('PEY_PAGE_LOAD_FAILED');
      mountFallback({ ...failure, entry, route });
      return;
    }
    let element;
    try {
      element = document.createElement(entry.element);
      const connect = entry.connect ?? defaultConnect;
      connect(element, infrastructure, refs, route);
    } catch (error) {
      if (disposed || current !== generation) return;
      logError('PEY_PAGE_MOUNT_FAILED');
      mountFallback({ ...failure, entry, route });
      return;
    }
    if (disposed || current !== generation) return;
    element.slot = PAGE_SLOT;
    hostElement.append(element);
    mounted = element;
    lastFallback = null;
  }

  async function mountForRoute(route) {
    if (disposed || !route) return;
    const current = ++generation;
    unmountCurrent();
    if (route.isNotFound) {
      const entry = registry.notFoundEntry;
      if (!entry) {
        mountFallback({ ...FAILURE_NOT_FOUND, entry: null, route });
        return;
      }
      await mountEntry(entry, route, current, FAILURE_NOT_FOUND);
      return;
    }
    const entry = registry.getEntry(route.pattern);
    if (!entry) {
      logError('PEY_PAGE_LOADER_NO_ENTRY');
      mountFallback({ ...FAILURE_LOAD_FAILED, canRetry: false, entry: null, route });
      return;
    }
    await mountEntry(entry, route, current, FAILURE_LOAD_FAILED);
  }

  function applyKitLanguage(language) {
    if (hasInjectedT) return;
    if (typeof language !== 'string' || language.trim().length === 0) return;
    let nextT;
    try {
      nextT = createI18n({ language: language.trim() }).t;
    } catch (error) {
      // An invalid tag from shared state must not break the store callback;
      // keep the current translation.
      logError('PEY_PAGE_HOST_SHARED_STATE_LANGUAGE_INVALID');
      return;
    }
    const previousT = t;
    t = nextT;
    if (lastFallback && !remountFallback()) {
      t = previousT;
    }
  }

  let unsubscribe = () => {};
  try {
    const result = events.subscribe(ROUTER_CHANGED_EVENT, () => {
      let route;
      try {
        route = router.getCurrentRoute();
      } catch (error) {
        logError('PEY_PAGE_ROUTE_READ_FAILED');
        return;
      }
      try {
        void mountForRoute(route).catch(() => {
          logError('PEY_PAGE_ROUTE_MOUNT_FAILED');
        });
      } catch (error) {
        logError('PEY_PAGE_ROUTE_MOUNT_FAILED');
      }
    });
    if (typeof result !== 'function') {
      throw createPeyWebUiError('PEY_PAGE_HOST_SUBSCRIBE_INVALID', 'Router subscription must return an unsubscribe function');
    }
    unsubscribe = result;
  } catch (error) {
    if (error?.code) throw error;
    throw createPeyWebUiError('PEY_PAGE_HOST_SUBSCRIBE_INVALID', 'Router subscription failed');
  }

  let unsubscribeLanguage = () => {};
  if (sharedState && !hasInjectedT) {
    unsubscribeLanguage = subscribeToLanguage(sharedState, applyKitLanguage);
  }

  return Object.freeze({
    mountForRoute,
    dispose() {
      if (disposed) return;
      disposed = true;
      ++generation;
      try {
        unsubscribe();
      } catch (error) {
        logError('PEY_PAGE_UNSUBSCRIBE_FAILED');
      }
      if (sharedState) {
        try {
          unsubscribeLanguage();
        } catch (error) {
          logError('PEY_PAGE_UNSUBSCRIBE_FAILED');
        }
      }
      unmountCurrent();
    },
  });
}
