// User-configuration layer for the Browser Runtime Host.
// `config/config.js` is the user-facing, non-technical configuration file
// (appearance and usage). This module maps its friendly keys onto the
// technical namespaces of bootstrap.json and deep-merges them, so the Core
// still receives exactly one configuration content via ConfigSource.

// Friendly user key → [namespace, target key]. Namespaces: 'ui' maps to
// config.ui; 'docs' maps to config['shirazeh.docs']. Only these namespaces
// are reachable from the user file — never plugins, adapters, or core.
const USER_CONFIG_MAP = Object.freeze({
  language: ['ui', 'language'],
  direction: ['ui', 'direction'],
  theme: ['ui', 'theme'],
  appName: ['ui', 'appName'],
  logo: ['ui', 'logo'],
  favicon: ['ui', 'favicon'],
  githubCorner: ['ui', 'githubCorner'],
  toc: ['ui', 'toc'],
  codeCopy: ['ui', 'codeCopy'],
  highlight: ['ui', 'highlight'],
  title: ['ui', 'title'],
  export: ['ui', 'export'],
  docsRoot: ['docs', 'docsRoot'],
  homePage: ['docs', 'homePage'],
  sidebarFile: ['docs', 'sidebarFile'],
  notFoundPage: ['docs', 'notFoundPage'],
  extensions: ['docs', 'extensions'],
});

const SECTION_BY_NAMESPACE = Object.freeze({
  ui: 'ui',
  docs: 'shirazeh.docs',
});

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(target, source) {
  const result = isPlainObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Applies the user configuration onto a bootstrap configuration content.
 *
 * Only keys with a known mapping are merged; unknown keys are reported to
 * `onWarning` (typo guard for non-technical users) and ignored. The input
 * content is never mutated.
 *
 * @param {object} bootstrapContent Parsed bootstrap.json content.
 * @param {object} userConfig Parsed user configuration object.
 * @param {(message: string) => void} [onWarning] Optional warning sink.
 * @returns {object} A new configuration content with user values merged in.
 */
export function applyUserConfig(bootstrapContent, userConfig, onWarning = () => {}) {
  if (!isPlainObject(bootstrapContent)) {
    throw new TypeError('bootstrapContent must be an object');
  }

  if (userConfig === null || userConfig === undefined) {
    return bootstrapContent;
  }

  if (!isPlainObject(userConfig)) {
    onWarning('config/config.js must export an object; ignoring it.');
    return bootstrapContent;
  }

  const mergedSections = new Map();
  for (const [userKey, value] of Object.entries(userConfig)) {
    const mapping = USER_CONFIG_MAP[userKey];
    if (mapping === undefined) {
      onWarning(`Unknown configuration key "${userKey}" in config/config.js; ignored.`);
      continue;
    }

    const [namespace, targetKey] = mapping;
    const sectionName = SECTION_BY_NAMESPACE[namespace];
    const section = mergedSections.get(sectionName) ?? {};
    section[targetKey] = isPlainObject(value)
      ? deepMerge({}, value)
      : value;
    mergedSections.set(sectionName, section);
  }

  if (mergedSections.size === 0) {
    return bootstrapContent;
  }

  const config = { ...bootstrapContent.config };
  for (const [sectionName, sectionValues] of mergedSections) {
    config[sectionName] = deepMerge(config[sectionName], sectionValues);
  }

  return { ...bootstrapContent, config };
}

/**
 * Loads the user configuration module and returns its default export.
 *
 * The file is optional: a missing or broken file resolves to null after a
 * warning, so the application always boots with defaults.
 *
 * @param {string} configUrl Absolute URL of config/config.js.
 * @returns {Promise<object|null>} The user configuration object, or null.
 */
export async function loadUserConfig(configUrl) {
  try {
    const module = await import(configUrl);
    const userConfig = module.default;
    if (userConfig !== undefined) {
      return userConfig;
    }
    console.warn('[shirazeh] config/config.js has no default export; using defaults.');
    return null;
  } catch (error) {
    console.warn(`[shirazeh] config/config.js could not be loaded (${error?.message ?? 'unknown error'}); using defaults.`);
    return null;
  }
}
