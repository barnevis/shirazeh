// Browser Runtime Host for Shirazeh.
// Sits outside Bonyan: prepares ConfigSource, EnvSource, and ModuleLoader
// for the browser, constructs the platform-neutral Pey Core, and starts it.

import { PeyCore } from '../core/index.js';
import { applyUserConfig, loadUserConfig } from './user-config.js';

// The application root is the repository root (index.html, bootstrap.json,
// config/ and docs/ live there); everything else hangs under src/.
const APP_ROOT = new URL('../../', import.meta.url);
const MANIFEST_FILE = 'manifest.json';
const ENTRY_FILE = 'index.js';
const USER_CONFIG_URL = new URL('../../config/config.js', import.meta.url).href;

function toAbsoluteUrl(ref, fileName) {
  const cleanRef = typeof ref === 'string' ? ref.replace(/^\.\//, '').replace(/\/+$/, '') : '';
  if (cleanRef.length === 0) {
    throw new Error(`Invalid plugin or UI path reference: ${String(ref)}`);
  }
  return new URL(`${cleanRef}/${fileName}`, APP_ROOT).href;
}

const configSource = {
  async getConfig() {
    const response = await fetch(new URL('bootstrap.json', APP_ROOT));
    if (!response.ok) {
      throw new Error(`bootstrap.json could not be loaded (status ${response.status})`);
    }
    const bootstrapContent = await response.json();
    const userConfig = await loadUserConfig(USER_CONFIG_URL);
    return applyUserConfig(bootstrapContent, userConfig, (message) => {
      console.warn(`[shirazeh] ${message}`);
    });
  },
};

// The browser host has no runtime environment values; build-time injection
// would go here if the project ever needs it.
const envSource = {
  get() {
    return undefined;
  },
};

const moduleLoader = {
  async loadManifest(ref) {
    const response = await fetch(toAbsoluteUrl(ref, MANIFEST_FILE));
    if (!response.ok) {
      throw new Error(`manifest.json could not be loaded for ${ref} (status ${response.status})`);
    }
    return response.json();
  },

  async loadEntry(ref) {
    return import(toAbsoluteUrl(ref, ENTRY_FILE));
  },
};

const core = new PeyCore({ configSource, envSource, moduleLoader });

try {
  const { shutdown } = await core.start();
  window.__shirazeh = { shutdown };
} catch (error) {
  console.error('[shirazeh] startup failed:', error);
  document.body.innerHTML = '<div style="font-family:system-ui;padding:2rem;direction:rtl">'
    + '<h1>شیرازه راه‌اندازی نشد</h1>'
    + '<p>خطای راه‌اندازی در کنسول مرورگر ثبت شد.</p></div>';
}
