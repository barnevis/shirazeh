// Top navigation bar: logo/brand, home link, theme toggle, language switch,
// and the optional GitHub link.

import { PeyElement } from 'pey.webui/base/pey-element';
import appCatalog from '../i18n/catalog.js';
import { createI18n } from 'pey.webui/i18n';

const TAG = 'shirazeh-navbar';
const LANGUAGE_KEY = 'language';
const DIRECTION_KEY = 'direction';
const THEME_KEY = 'theme';
const DIRECTION_BY_LANGUAGE = { fa: 'rtl', en: 'ltr' };
const LANGUAGES = ['fa', 'en'];

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

class ShirazehNavbar extends PeyElement {
  #sharedState = null;
  #i18n = null;
  #router = null;
  #fallbackPath = null;
  #themeController = null;
  #prefs = null;
  #appName = '';
  #logo = null;
  #githubCorner = null;
  #theme = 'light';
  #unsubscribers = [];

  onConnect(refs) {
    this.#sharedState = refs.sharedState ?? null;
    this.#router = refs.router ?? null;
    this.#themeController = refs.themeController ?? null;
    this.#prefs = refs.prefs ?? null;
    this.#appName = typeof refs.appName === 'string' && refs.appName.trim().length > 0
      ? refs.appName
      : null;
    this.#logo = refs.logo ?? null;
    this.#githubCorner = refs.githubCorner ?? null;
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
    const appName = this.#appName ?? t('shirazeh.app-name');
    const logo = this.#logo ?? {};
    const logoHtml = logo.enabled === true && typeof logo.src === 'string' && logo.src.length > 0
      ? `<img class="brand-logo" src="${escapeHtml(logo.src)}" alt="" style="inline-size: ${escapeHtml(logo.size ?? '32px')}">`
      : '';
    const github = this.#githubCorner ?? {};
    const githubHtml = github.enabled === true && typeof github.url === 'string' && github.url.length > 0
      ? `<a class="github-link" href="${escapeHtml(github.url)}" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">
           <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
         </a>`
      : '';

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
        .brand-logo {
          align-self: center;
          border-radius: var(--pey-radius-sm);
        }
        .github-link {
          display: inline-flex;
          align-items: center;
          color: var(--pey-color-text);
        }
        .github-link:hover {
          color: var(--pey-color-accent);
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
          ${logoHtml}
          <strong>${escapeHtml(appName)}</strong>
          <span>${t('shirazeh.nav.home')}</span>
        </a>
        <div class="actions">
          ${githubHtml}
          <button type="button" data-theme-toggle aria-label="${themeLabel}" title="${themeLabel}">${themeIcon}</button>
          ${languageButtons}
        </div>
      </nav>
    `;
  }
}

customElements.define(TAG, ShirazehNavbar);

export { ShirazehNavbar, TAG };
