// Top navigation bar: application title, home link, theme toggle, and
// language switch.

import { PeyElement } from 'pey.webui/base/pey-element';
import appCatalog from '../i18n/catalog.js';
import { createI18n } from 'pey.webui/i18n';

const TAG = 'shirazeh-navbar';
const LANGUAGE_KEY = 'language';
const DIRECTION_KEY = 'direction';
const THEME_KEY = 'theme';
const DIRECTION_BY_LANGUAGE = { fa: 'rtl', en: 'ltr' };
const LANGUAGES = ['fa', 'en'];

class ShirazehNavbar extends PeyElement {
  #sharedState = null;
  #i18n = null;
  #router = null;
  #fallbackPath = null;
  #themeController = null;
  #prefs = null;
  #theme = 'light';
  #unsubscribers = [];

  onConnect(refs) {
    this.#sharedState = refs.sharedState ?? null;
    this.#router = refs.router ?? null;
    this.#themeController = refs.themeController ?? null;
    this.#prefs = refs.prefs ?? null;
    this.#fallbackPath = typeof refs.fallbackPath === 'string' ? refs.fallbackPath : '/';
    this.#theme = this.#sharedState?.get(THEME_KEY) ?? 'light';
    this.#buildI18n(this.#sharedState?.get(LANGUAGE_KEY) ?? 'fa');
  }

  #buildI18n(language) {
    try {
      this.#i18n = createI18n({ language, catalog: appCatalog });
    } catch {
      this.#i18n = createI18n({ language: 'fa', catalog: appCatalog });
    }
    this.requestRender({ preserve: false });
  }

  connectedCallback() {
    super.connectedCallback();

    if (this.#sharedState) {
      const unsubscribeLanguage = this.#sharedState.subscribe(LANGUAGE_KEY, (language) => {
        this.#buildI18n(language);
        document.documentElement.lang = language;
      });
      const unsubscribeDirection = this.#sharedState.subscribe(DIRECTION_KEY, (direction) => {
        document.documentElement.dir = direction;
      });
      const unsubscribeTheme = this.#sharedState.subscribe(THEME_KEY, (theme) => {
        if (theme === 'light' || theme === 'dark') {
          this.#theme = theme;
          this.requestRender({ preserve: false });
        }
      });
      this.#unsubscribers.push(unsubscribeLanguage, unsubscribeDirection, unsubscribeTheme);

      const language = this.#sharedState.get(LANGUAGE_KEY);
      if (typeof language === 'string') {
        document.documentElement.lang = language;
      }
      const direction = this.#sharedState.get(DIRECTION_KEY);
      if (typeof direction === 'string') {
        document.documentElement.dir = direction;
      }
    }
  }

  disconnectedCallback() {
    for (const unsubscribe of this.#unsubscribers.splice(0)) {
      try {
        unsubscribe();
      } catch {
        // A failing unsubscribe must not break removal.
      }
    }
    super.disconnectedCallback();
  }

  eventTypes() {
    return ['click'];
  }

  handleEvent(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const languageButton = target.closest('button[data-language]');
    if (languageButton !== null) {
      this.#switchLanguage(languageButton.dataset.language);
      return;
    }

    const themeButton = target.closest('button[data-theme-toggle]');
    if (themeButton !== null) {
      const next = this.#themeController?.currentTheme() === 'dark' ? 'light' : 'dark';
      this.#themeController?.setTheme(next);
      void this.#prefs?.set('theme', next);
      return;
    }

    const homeLink = target.closest('a[data-home]');
    if (homeLink !== null) {
      event.preventDefault();
      this.#navigate(this.#fallbackPath || '/');
    }
  }

  #switchLanguage(language) {
    const direction = DIRECTION_BY_LANGUAGE[language];
    if (direction === undefined || !this.#sharedState) {
      return;
    }

    this.#sharedState.set(LANGUAGE_KEY, language);
    this.#sharedState.set(DIRECTION_KEY, direction);
    void this.#prefs?.set('language', language);
    this.publishUIEvent('ui:language-changed', { language });
  }

  #navigate(path) {
    if (this.#router && typeof this.#router.navigate === 'function') {
      this.#router.navigate(path);
    }
  }

  render() {
    const t = this.#i18n?.t ?? ((key) => key);
    const languageButtons = LANGUAGES.map((language) => {
      const label = language === 'fa' ? t('shirazeh.nav.language-fa') : t('shirazeh.nav.language-en');
      return `<button type="button" data-language="${language}">${label}</button>`;
    }).join('');
    const themeIcon = this.#theme === 'dark' ? '☀' : '🌙';
    const themeLabel = this.#theme === 'dark' ? t('shirazeh.theme.to-light') : t('shirazeh.theme.to-dark');

    return `
      <style>
        :host {
          display: block;
          background-color: var(--pey-color-surface);
          border-block-end: 1px solid var(--pey-color-border);
        }
        .bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--pey-space-4);
          inline-size: min(100% - 2rem, 72rem);
          margin-inline: auto;
          padding-block: var(--pey-space-3);
        }
        .brand {
          display: flex;
          align-items: baseline;
          gap: var(--pey-space-3);
          text-decoration: none;
          color: inherit;
        }
        .brand strong {
          font-size: var(--pey-font-size-lg);
        }
        .actions {
          display: flex;
          gap: var(--pey-space-2);
        }
        button {
          font-family: inherit;
          font-size: var(--pey-font-size-sm);
          padding: var(--pey-space-1) var(--pey-space-3);
          border: 1px solid var(--pey-color-border);
          border-radius: var(--pey-radius-md);
          background-color: var(--pey-color-canvas);
          color: var(--pey-color-text);
          cursor: pointer;
        }
        button:hover {
          border-color: var(--pey-color-accent);
        }
        button:focus-visible {
          outline: 2px solid var(--pey-color-focus-ring);
          outline-offset: 1px;
        }
      </style>
      <nav class="bar" aria-label="${t('shirazeh.app-name')}">
        <a class="brand" href="#/" data-home>
          <strong>${t('shirazeh.app-name')}</strong>
          <span>${t('shirazeh.nav.home')}</span>
        </a>
        <div class="actions">
          <button type="button" data-theme-toggle aria-label="${themeLabel}" title="${themeLabel}">${themeIcon}</button>
          ${languageButtons}
        </div>
      </nav>
    `;
  }
}

customElements.define(TAG, ShirazehNavbar);

export { ShirazehNavbar, TAG };
