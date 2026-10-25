// Stable names and configuration defaults shared by pey.webui consumers.

const PEY_ELEMENT_TAG_PREFIX = 'pey-';
const PEY_ROUTER_SERVICE = 'pey.router.service';
const UI_COMPONENT_ERROR_EVENT = 'ui:component-error';

const DEFAULT_UI_CONFIG = Object.freeze({
  theme: 'system',
  language: 'en',
  direction: 'auto',
  fallbackPath: null,
  assetBaseUrl: './assets',
});

export {
  DEFAULT_UI_CONFIG,
  PEY_ELEMENT_TAG_PREFIX,
  PEY_ROUTER_SERVICE,
  UI_COMPONENT_ERROR_EVENT,
};
