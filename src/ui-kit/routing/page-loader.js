// Validates the Entry Point's route catalog and builds the standard page
// connection envelope. Route-ownership contract: docs/decisions.md#no-route-registration-in-the-host.

const ERROR_SOURCE = 'pey.webui';
const CUSTOM_ELEMENT_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;

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

function isValidCustomElementName(name) {
  return CUSTOM_ELEMENT_NAME_PATTERN.test(name);
}

function validateLoadable(entry, label, options = {}) {
  assert(entry && typeof entry === 'object', 'PEY_PAGE_LOADER_INVALID', `${label} must be an object`);
  if (options.requirePattern) {
    assert(
      typeof entry.pattern === 'string' && entry.pattern.trim().length > 0,
      'PEY_PAGE_LOADER_INVALID',
      `${label}.pattern must be a non-empty string`,
    );
    assert(
      entry.pattern === entry.pattern.trim(),
      'PEY_PAGE_LOADER_INVALID',
      `${label}.pattern must not have leading or trailing whitespace`,
    );
  }
  assert(typeof entry.load === 'function', 'PEY_PAGE_LOADER_INVALID', `${label}.load must be a function`);
  assert(
    typeof entry.element === 'string' && entry.element.trim().length > 0,
    'PEY_PAGE_LOADER_INVALID',
    `${label}.element must be a non-empty string`,
  );
  assert(
    entry.element === entry.element.trim() && isValidCustomElementName(entry.element),
    'PEY_PAGE_LOADER_INVALID',
    `${label}.element must be a trimmed valid custom-element name`,
  );
  if (entry.connect !== undefined) {
    assert(typeof entry.connect === 'function', 'PEY_PAGE_LOADER_INVALID', `${label}.connect must be a function when provided`);
  }
}

/**
 * Builds the standard page connection envelope. Product pages receive base refs
 * (services, shared state, t, format) plus explicit route params and query.
 * @param {import('./page-host.js').PageElement} element Page element to connect.
 * @param {object} infrastructure Shared infrastructure facades.
 * @param {object} refs Base refs the Entry Point provides.
 * @param {object} route Resolved route snapshot ({ pattern, params, query }).
 * @returns {import('./page-host.js').PageElement} The connected page element.
 */
export function defaultConnect(element, infrastructure, refs, route) {
  element.connect({
    infrastructure,
    refs: {
      ...refs,
      routeParams: route?.params ?? {},
      routeQuery: route?.query ?? {},
    },
  });
  return element;
}

/**
 * Creates the page-loader registry from the Entry Point's route catalog.
 * @param {object} options Registry options.
 * @param {Array<object>} [options.routes] Ordered route loaders with { pattern, load, element, connect? }.
 * @param {object|null} [options.notFound] NotFound slot loader with { load, element, connect? }.
 * @returns {object} Frozen lookup registry: getEntry(pattern), notFoundEntry.
 */
export function createPageLoaderRegistry({ routes = [], notFound = null } = {}) {
  assert(Array.isArray(routes), 'PEY_PAGE_LOADER_INVALID', 'routes must be an array');
  const byPattern = new Map();
  for (const entry of routes) {
    validateLoadable(entry, 'routes[i]', { requirePattern: true });
    if (byPattern.has(entry.pattern)) {
      throw createPeyWebUiError('PEY_PAGE_LOADER_INVALID', `Duplicate page-loader pattern: ${entry.pattern}`);
    }
    byPattern.set(entry.pattern, Object.freeze({ ...entry }));
  }
  if (notFound !== null) {
    validateLoadable(notFound, 'notFound');
  }
  const notFoundEntry = notFound === null ? null : Object.freeze({ ...notFound });
  return Object.freeze({
    getEntry(pattern) {
      return byPattern.get(pattern) ?? null;
    },
    notFoundEntry,
  });
}
