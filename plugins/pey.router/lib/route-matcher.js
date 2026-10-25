// Validates route patterns and matches paths using the fixed segment syntax.

import { ERROR_CODES } from './constants.js';
import { createRouterError } from './error.js';

const UNSUPPORTED_PATTERN_CHARACTERS = /[?#{[(*\\]/;

function malformedPatternError() {
  return createRouterError(
    ERROR_CODES.MALFORMED_PATTERN,
    'Route pattern does not follow the required syntax',
  );
}

function getSegments(value) {
  return value === '/' ? [] : value.slice(1).split('/');
}

function getParameterName(segment) {
  return segment.startsWith(':') ? segment.slice(1) : null;
}

function isMalformedSegment(segment) {
  if (segment.length === 0 || UNSUPPORTED_PATTERN_CHARACTERS.test(segment)) {
    return true;
  }

  const parameterName = getParameterName(segment);
  return parameterName !== null && parameterName.length === 0;
}

function getPathname(path) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    return null;
  }

  return path.split('?', 1)[0];
}

function decodeParameter(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

/**
 * Validates a route pattern against the project's fixed `:paramName` syntax.
 *
 * @param {string} pattern Route pattern to validate.
 * @returns {void}
 * @throws {object} Standard `ROUTER_MALFORMED_PATTERN` Bonyan error.
 */
export function validatePattern(pattern) {
  if (typeof pattern !== 'string'
    || !pattern.startsWith('/')
    || (pattern.length > 1 && pattern.endsWith('/'))
    || UNSUPPORTED_PATTERN_CHARACTERS.test(pattern)) {
    throw malformedPatternError();
  }

  const parameterNames = new Set();

  for (const segment of getSegments(pattern)) {
    if (isMalformedSegment(segment)) {
      throw malformedPatternError();
    }

    const parameterName = getParameterName(segment);
    if (parameterName !== null && parameterNames.has(parameterName)) {
      throw malformedPatternError();
    }

    if (parameterName !== null) {
      parameterNames.add(parameterName);
    }
  }
}

/**
 * Matches a path against a validated route pattern and extracts parameters.
 *
 * @param {string} pattern Route pattern using the fixed `:paramName` syntax.
 * @param {string} path Path to match; query data is ignored.
 * @returns {{params: object}|null} Extracted parameters, or `null` when unmatched.
 * @throws {object} Standard `ROUTER_MALFORMED_PATTERN` Bonyan error.
 */
export function matchRoute(pattern, path) {
  validatePattern(pattern);

  const pathname = getPathname(path);
  if (pathname === null) {
    return null;
  }

  const patternSegments = getSegments(pattern);
  const pathSegments = getSegments(pathname);
  if (patternSegments.length !== pathSegments.length) {
    return null;
  }

  const params = {};

  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const pathSegment = pathSegments[index];
    const parameterName = getParameterName(patternSegment);

    if (parameterName === null && patternSegment !== pathSegment) {
      return null;
    }

    if (parameterName !== null) {
      const parameterValue = decodeParameter(pathSegment);
      if (parameterValue === null || parameterValue.length === 0) {
        return null;
      }
      params[parameterName] = parameterValue;
    }
  }

  return { params };
}
