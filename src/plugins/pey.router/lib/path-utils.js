// Validates and transforms router paths, query strings, and base paths.

import { ERROR_CODES } from './constants.js';
import { createRouterError } from './error.js';

function malformedPathError() {
  return createRouterError(ERROR_CODES.MALFORMED_PATH, 'Path is not valid');
}

function malformedQueryError() {
  return createRouterError(ERROR_CODES.MALFORMED_QUERY, 'Query value is not valid');
}

function normalizeBasePath(basePath) {
  validatePath(basePath);
  return basePath === '/' ? '/' : basePath.replace(/\/+$/, '');
}

function normalizeQueryInput(queryString) {
  return queryString.startsWith('?') ? queryString.slice(1) : queryString;
}

function validateQueryEncoding(queryString) {
  try {
    for (const pair of queryString.split('&')) {
      const separatorIndex = pair.indexOf('=');
      const key = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
      const value = separatorIndex === -1 ? '' : pair.slice(separatorIndex + 1);
      decodeURIComponent(key.replaceAll('+', ' '));
      decodeURIComponent(value.replaceAll('+', ' '));
    }
  } catch {
    throw malformedPathError();
  }
}

/**
 * Validates a path accepted by the router service.
 *
 * @param {string} path Absolute path without a fragment.
 * @returns {void}
 * @throws {object} Standard `ROUTER_MALFORMED_PATH` Bonyan error.
 */
export function validatePath(path) {
  if (typeof path !== 'string'
    || path.length === 0
    || !path.startsWith('/')
    || path.includes('#')
    || path.includes('\0')) {
    throw malformedPathError();
  }

  try {
    decodeURI(path);
  } catch {
    throw malformedPathError();
  }
}

/**
 * Separates an absolute path from its query string.
 *
 * @param {string} rawPath Path that may include query data.
 * @returns {{path: string, queryString: string}}
 * @throws {object} Standard `ROUTER_MALFORMED_PATH` Bonyan error.
 */
export function splitPath(rawPath) {
  validatePath(rawPath);

  const queryIndex = rawPath.indexOf('?');
  if (queryIndex === -1) {
    return { path: rawPath, queryString: '' };
  }

  const path = rawPath.slice(0, queryIndex);
  if (path.length === 0) {
    throw malformedPathError();
  }

  return {
    path,
    queryString: rawPath.slice(queryIndex + 1),
  };
}

/**
 * Parses query data into a plain key/value object.
 *
 * @param {string} queryString Query string with or without a leading `?`.
 * @returns {Record<string, string>} Parsed query values; repeated keys keep the last value.
 * @throws {object} Standard `ROUTER_MALFORMED_PATH` Bonyan error for invalid encoding.
 */
export function parseQuery(queryString = '') {
  if (typeof queryString !== 'string') {
    throw malformedPathError();
  }

  const normalizedQuery = normalizeQueryInput(queryString);
  validateQueryEncoding(normalizedQuery);
  const query = {};

  for (const [key, value] of new URLSearchParams(normalizedQuery)) {
    Object.defineProperty(query, key, {
      configurable: true,
      enumerable: true,
      value,
      writable: true,
    });
  }

  return query;
}

/**
 * Serializes query key/value pairs using URL query encoding.
 *
 * @param {Record<string, string|number|boolean|undefined>} [query={}] Query values to serialize.
 * @returns {string} Query string including `?`, or an empty string.
 * @throws {object} Standard `ROUTER_MALFORMED_QUERY` Bonyan error for invalid input.
 */
export function serializeQuery(query = {}) {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw malformedQueryError();
  }

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw malformedQueryError();
    }
    searchParams.set(key, String(value));
  }

  const serializedQuery = searchParams.toString();
  return serializedQuery.length === 0 ? '' : `?${serializedQuery}`;
}

/**
 * Removes a configured base path from a raw adapter path.
 *
 * @param {string} rawPath Adapter-facing path, optionally including query data.
 * @param {string} basePath Configured application base path.
 * @returns {string|null} Relative router path, or `null` when outside the base path.
 * @throws {object} Standard `ROUTER_MALFORMED_PATH` Bonyan error.
 */
export function stripBasePath(rawPath, basePath) {
  const { path, queryString } = splitPath(rawPath);
  const normalizedBasePath = normalizeBasePath(basePath);
  const querySuffix = queryString.length === 0 ? '' : `?${queryString}`;

  if (normalizedBasePath === '/') {
    return rawPath;
  }

  if (path === normalizedBasePath) {
    return `/${querySuffix}`;
  }

  if (!path.startsWith(`${normalizedBasePath}/`)) {
    return null;
  }

  return `${path.slice(normalizedBasePath.length)}${querySuffix}`;
}

/**
 * Prepends a configured base path to a router-facing path.
 *
 * @param {string} path Router-facing path, optionally including query data.
 * @param {string} basePath Configured application base path.
 * @returns {string} Adapter-facing path.
 * @throws {object} Standard `ROUTER_MALFORMED_PATH` Bonyan error.
 */
export function prependBasePath(path, basePath) {
  validatePath(path);
  const normalizedBasePath = normalizeBasePath(basePath);

  if (normalizedBasePath === '/') {
    return path;
  }

  return path === '/' ? normalizedBasePath : `${normalizedBasePath}${path}`;
}
