// Floating chrome actions — visual port of the old Shirazeh widgets: the
// circular theme toggle (dock-top-left in the old widget system) next to the
// language toggle, plus the optional classic octocat corner. Lives outside
// page re-renders, attached to the app shell.

import { PeyElement } from 'pey.webui/base/pey-element';
import appCatalog from '../i18n/catalog.js';
import { createI18n } from 'pey.webui/i18n';

const TAG = 'shirazeh-actions';
const LANGUAGE_KEY = 'language';
const DIRECTION_KEY = 'direction';
const DIRECTION_BY_LANGUAGE = { fa: 'rtl', en: 'ltr' };
// GitHub octocat mark (simple-icons), rendered inside the circular stack button.
const GITHUB_MARK_PATH = 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

class ShirazehActions extends PeyElement {
  #sharedState = null;
  #themeController = null;
  #prefs = null;
  #githubCorner = null;
  #languageToggle = null;
  #exportConfig = null;
  #exportMenuOpen = false;
  #outsideClickListener = null;
  #i18n = null;
  #theme = 'light';
  #unsubscribers = [];

  onConnect(refs) {
    this.#sharedState = refs.sharedState ?? null;
    this.#themeController = refs.themeController ?? null;
    this.#prefs = refs.prefs ?? null;
    this.#githubCorner = refs.githubCorner ?? null;
    // The floating language toggle ships disabled; config/config.js opts in.
    this.#languageToggle = refs.languageToggle ?? null;
    this.#exportConfig = refs.exportConfig ?? null;
    this.#theme = this.#sharedState?.get('theme') ?? 'light';
    const language = this.#sharedState?.get(LANGUAGE_KEY) ?? 'fa';
    this.#i18n = createI18n({ language, catalog: appCatalog });
  }

  connectedCallback() {
    super.connectedCallback();

    // A click anywhere outside the export dropdown closes it; the component
    // itself is removed from the composed path so its own clicks keep working.
    this.#outsideClickListener = (event) => {
      if (this.#exportMenuOpen && event instanceof MouseEvent
        && !event.composedPath().includes(this)) {
        this.#setExportMenu(false);
      }
    };
    document.addEventListener('click', this.#outsideClickListener);

    if (this.#sharedState) {
      const unsubscribeTheme = this.#sharedState.subscribe('theme', (theme) => {
        if (theme === 'light' || theme === 'dark') {
          this.#theme = theme;
          this.requestRender({ preserve: false });
        }
      });
      const unsubscribeLanguage = this.#sharedState.subscribe(LANGUAGE_KEY, (language) => {
        try {
          this.#i18n = createI18n({ language, catalog: appCatalog });
        } catch {
          // Keep the previous i18n on an invalid tag.
        }
        this.requestRender({ preserve: false });
      });
      this.#unsubscribers.push(unsubscribeTheme, unsubscribeLanguage);
    }
  }

  disconnectedCallback() {
    if (this.#outsideClickListener !== null) {
      document.removeEventListener('click', this.#outsideClickListener);
      this.#outsideClickListener = null;
    }
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

    if (target.closest('button[data-theme-toggle]') !== null) {
      const next = this.#themeController?.currentTheme() === 'dark' ? 'light' : 'dark';
      this.#themeController?.setTheme(next);
      void this.#prefs?.set('theme', next);
      return;
    }

    const exportToggle = target.closest('button[data-export-toggle]');
    if (exportToggle !== null) {
      this.#setExportMenu(!this.#exportMenuOpen);
      return;
    }
    const exportItem = target.closest('button[data-export]');
    if (exportItem !== null) {
      const format = exportItem.dataset.export;
      if (format === 'html' || format === 'md') {
        this.#setExportMenu(false);
        this.publishUIEvent('ui:export-requested', { format });
      }
      return;
    }

    const languageButton = target.closest('button[data-language]');
    if (languageButton !== null) {
      const language = languageButton.dataset.language;
      const direction = DIRECTION_BY_LANGUAGE[language];
      if (direction === undefined || !this.#sharedState) {
        return;
      }
      this.#sharedState.set(LANGUAGE_KEY, language);
      this.#sharedState.set(DIRECTION_KEY, direction);
      void this.#prefs?.set('language', language);
      this.publishUIEvent('ui:language-changed', { language });
    }
  }

  // Page export (standalone HTML / markdown): the button lives in the
  // floating stack, the export itself runs in the docs page which listens
  // for the 'ui:export-requested' event.
  #exportButtonHtml() {
    if (this.#exportConfig?.enabled === false) {
      return '';
    }
    const t = this.#i18n?.t ?? ((key) => key);
    const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><line x1="5" y1="21" x2="19" y2="21"/></svg>';
    return `
        <div class="export-wrap" data-export-wrap>
          <button type="button" data-export-toggle aria-haspopup="true" aria-expanded="${this.#exportMenuOpen}" aria-label="${escapeHtml(t('shirazeh.export.download'))}" title="${escapeHtml(t('shirazeh.export.download'))}">${icon}</button>
          <div class="export-menu" data-export-menu${this.#exportMenuOpen ? '' : ' hidden'}>
            <button type="button" data-export="html">${escapeHtml(t('shirazeh.export.html'))}</button>
            <button type="button" data-export="md">${escapeHtml(t('shirazeh.export.md'))}</button>
          </div>
        </div>`;
  }

  #setExportMenu(open) {
    this.#exportMenuOpen = open;
    const menu = this.shadowRoot?.querySelector('[data-export-menu]');
    const button = this.shadowRoot?.querySelector('[data-export-toggle]');
    if (menu !== null && menu !== undefined) {
      menu.hidden = !open;
    }
    button?.setAttribute('aria-expanded', String(open));
  }

  // The toggle shows the language it switches TO, not the active one.
  #languageButtonHtml() {
    const t = this.#i18n?.t ?? ((key) => key);
    const currentLanguage = this.#i18n?.language ?? 'fa';
    const targetLanguage = currentLanguage === 'fa' ? 'en' : 'fa';
    const targetLabel = targetLanguage === 'en' ? 'EN' : 'فا';
    return `<button type="button" data-language="${targetLanguage}" aria-label="${escapeHtml(t('shirazeh.nav.switch-language'))}" title="${escapeHtml(t('shirazeh.nav.switch-language'))}">${targetLabel}</button>`;
  }

  render() {
    const t = this.#i18n?.t ?? ((key) => key);
    const themeIcon = this.#theme === 'dark'
      ? '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
      : '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    const languageButton = this.#languageToggle?.enabled === true
      ? this.#languageButtonHtml()
      : '';
    const themeLabel = this.#theme === 'dark' ? t('shirazeh.theme.to-light') : t('shirazeh.theme.to-dark');

    const github = this.#githubCorner ?? {};
    const githubEnabled = github.enabled === true && typeof github.url === 'string' && github.url.length > 0;
    const githubButtonHtml = githubEnabled
      ? `<a class="github-button" href="${escapeHtml(github.url)}" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">
           <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${GITHUB_MARK_PATH}"/></svg>
         </a>`
      : '';

    return `
      <style>
        :host {
          display: block;
        }
        .actions-stack {
          position: fixed;
          inset-block-start: 1.25rem;
          inset-inline-end: 1.25rem;
          z-index: 999;
          display: flex;
          gap: 0.5rem;
        }
        .actions-stack button,
        .actions-stack .github-button {
          background: none;
          border: 1px solid transparent;
          border-radius: 50%;
          inline-size: 40px;
          block-size: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          color: var(--pey-color-text);
          transition: background-color 0.2s;
          padding: 0;
          margin: 0;
          font-family: var(--pey-font-family-base);
          font-size: 0.85rem;
        }
        .actions-stack button:hover,
        .actions-stack .github-button:hover {
          background-color: var(--pey-color-border);
        }
        .actions-stack svg {
          inline-size: 20px;
          block-size: 20px;
        }
        /* Show the icon matching the active theme */
        :host([data-theme='dark']) .icon-sun { display: block; }
        :host([data-theme='dark']) .icon-moon { display: none; }
        :host([data-theme='light']) .icon-sun { display: none; }
        :host([data-theme='light']) .icon-moon { display: block; }
        .export-wrap {
          position: relative;
          display: flex;
        }
        .export-menu {
          position: absolute;
          inset-block-start: calc(100% + var(--pey-space-2));
          inset-inline-end: 0;
          min-inline-size: 11rem;
          display: grid;
          padding: var(--pey-space-1);
          border: 1px solid var(--pey-color-border);
          border-radius: var(--pey-radius-md);
          background-color: var(--pey-color-canvas);
          box-shadow: var(--pey-shadow-sm);
          z-index: 1000;
        }
        .export-menu[hidden] {
          display: none;
        }
        .export-menu button {
          font-family: var(--pey-font-family-base);
          font-size: var(--pey-font-size-sm);
          text-align: start;
          padding: var(--pey-space-2) var(--pey-space-3);
          border: none;
          border-radius: var(--pey-radius-sm);
          background: none;
          color: var(--pey-color-text);
          cursor: pointer;
          inline-size: 100%;
        }
        .export-menu button:hover {
          background-color: var(--pey-color-surface);
        }
        @media print {
          :host {
            display: none;
          }
        }
      </style>
      <div class="actions-stack">
        <button type="button" data-theme-toggle aria-label="${escapeHtml(themeLabel)}" title="${escapeHtml(themeLabel)}">${themeIcon}</button>
        ${githubButtonHtml}
        ${this.#exportButtonHtml()}
        ${languageButton}
      </div>
    `;
  }
}

customElements.define(TAG, ShirazehActions);

export { ShirazehActions, TAG };
