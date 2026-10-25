// Shared contract values for the pey.router plugin.

export const PLUGIN_NAME = 'pey.router';
export const PLUGIN_VERSION = '1.0.0';
export const SERVICE_NAME = 'pey.router.service';

export const EVENT_NAMES = Object.freeze({
  ROUTE_CHANGED: 'router:changed',
  NAVIGATION_FAILED: 'router:navigation-failed',
});

export const ERROR_CODES = Object.freeze({
  EXTERNAL_CHANGE_FAILED: 'ROUTER_EXTERNAL_CHANGE_FAILED',
  MALFORMED_PATH: 'ROUTER_MALFORMED_PATH',
  MALFORMED_PATTERN: 'ROUTER_MALFORMED_PATTERN',
  MALFORMED_QUERY: 'ROUTER_MALFORMED_QUERY',
  NAVIGATION_FAILED: 'ROUTER_NAVIGATION_FAILED',
});

export const NAVIGATION_FAILURE_REASONS = Object.freeze({
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
});

export const ROUTER_ADAPTER_METHODS = Object.freeze([
  'getCurrentPath',
  'pushEntry',
  'replaceEntry',
  'goBack',
  'goForward',
  'onExternalChange',
]);
