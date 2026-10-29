// Shared constants for the shirazeh.docs product plugin.

export const PLUGIN_NAME = 'shirazeh.docs';
export const PLUGIN_VERSION = '0.5.0';
export const SERVICE_NAME = 'shirazeh.docs.service';

export const EVENT_NAMES = Object.freeze({
  PAGE_LOADED: 'docs:page-loaded',
});

export const ERROR_CODES = Object.freeze({
  PAGE_NOT_FOUND: 'DOC_PAGE_NOT_FOUND',
  PATH_INVALID: 'DOC_PATH_INVALID',
  RENDER_FAILED: 'DOC_RENDER_FAILED',
  SIDEBAR_NOT_FOUND: 'SIDEBAR_NOT_FOUND',
  SIDEBAR_PARSE_FAILED: 'SIDEBAR_PARSE_FAILED',
});

export const DEFAULT_DOCS_ROOT = './docs';
export const DEFAULT_HOME_PAGE = 'README.md';
export const DEFAULT_SIDEBAR_FILE = '_sidebar.md';
export const DEFAULT_NAVBAR_FILE = null;
