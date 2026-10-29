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
    this.#theme = this.#sharedState?.get('theme') ?? 'light';
    const language = this.#sharedState?.get(LANGUAGE_KEY) ?? 'fa';
    this.#i18n = createI18n({ language, catalog: appCatalog });
  }

  connectedCallback() {
    super.connectedCallback();

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
    const githubHtml = github.enabled === true && typeof github.url === 'string' && github.url.length > 0
      ? `<a class="github-corner" href="${escapeHtml(github.url)}" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">
           <svg viewBox="0 0 250 250" aria-hidden="true">
             <path class="corner-bg" d="M0 0 115 115h250V0Z"/>
             <path class="octo-body" d="M128.3 109c-14.5-9.3-9.3-19.4-9.3-19.4 3-6.9 1.5-11 1.5-11-1.3-6.6 2.9-2.3 3.9-1.7 4.6 2.7 7.4 10.1 7.4 10.1 5.6 13.5 14.6 10.1 18.1 7.7.4-4 .8-6.6 1-7.7-3.5-3.9-7.4-9.7-7.4-18.4 0-6.4 2-11.4 5.2-15.4-.5-.4-2.3-2.7 0-6.7 0 0 4.3 1.4 10.1 5.2 4.1-1.1 8.5-1.7 12.9-1.7s8.8.6 12.9 1.7c5.8-3.8 10.1-5.2 10.1-5.2 2.3 4 1.5 6.3.5 6.7 3.2 4 5.2 9 5.2 15.4 0 8.7-3.9 14.5-7.4 18.4.5.4 2.4 2.1 1 6.7-.1.1-4.5 8.9-19.4 9.3 2.6 2.2 4.9 6.4 4.9 12.9v19.2c0 2.1 1.5 4.6 5 3.8 30.7-10.2 52.8-39.2 52.8-73.2C250 55.7 194.3 0 125 0S0 55.7 0 124c0 34 22.1 63 52.8 73.2 3.5.8 5-1.7 5-3.8v-24.2c-24.3-5.3-29.4-11.7-29.4-11.7-3.9-10-9.6-12.7-9.6-12.7-7.9-5.4.6-5.3.6-5.3 8.7.6 13.3 9 13.3 9 7.8 13.3 20.4 9.5 25.4 7.3.8-5.7 3-9.5 5.5-11.7-19.4-2.2-39.8-9.7-39.8-43.2 0-9.5 3.4-17.3 9-23.4-.9-2.2-3.9-11.1.9-23.1 0 0 7.3-2.3 23.9 8.9 6.9-1.9 14.4-2.9 21.8-3 7.4.1 14.9 1.1 21.8 3 16.6-11.2 23.9-8.9 23.9-8.9 4.8 12 1.8 20.9.9 23.1 5.6 6.1 9 13.9 9 23.4 0 33.6-20.5 41-40 43.2 3.1 2.7 5.9 8 5.9 16.1v23.9c0 2.1 1.4 4.6 5 3.8 30.6-10.3 52.7-39.2 52.7-73.3C250 55.7 194.3 0 125 0Z" fill="currentColor"/>
           </svg>
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
        .actions-stack button {
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
        .actions-stack button:hover {
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
        /* Classic octocat corner (old widgets.css colors) */
        .github-corner {
          position: fixed;
          inset-block-start: 0;
          inset-inline-end: 0;
          inline-size: 4.5rem;
          block-size: 4.5rem;
          z-index: 999;
        }
        .github-corner svg {
          inline-size: 100%;
          block-size: 100%;
        }
        .github-corner .corner-bg {
          fill: var(--pey-color-accent);
        }
        .github-corner .octo-body {
          color: var(--pey-color-surface);
        }
        .github-corner .octo-arm {
          transform-origin: 62% 35%;
        }
        .github-corner:hover .octo-arm {
          animation: shirazeh-octo-wave 560ms ease-in-out;
        }
        @keyframes shirazeh-octo-wave {
          0%, 100% { transform: rotate(0); }
          20%, 60% { transform: rotate(-25deg); }
          40%, 80% { transform: rotate(10deg); }
        }
        @media (max-width: 48rem) {
          .github-corner {
            inline-size: 3.4rem;
            block-size: 3.4rem;
          }
        }
        @media print {
          :host {
            display: none;
          }
        }
      </style>
      <div class="actions-stack">
        <button type="button" data-theme-toggle aria-label="${escapeHtml(themeLabel)}" title="${escapeHtml(themeLabel)}">${themeIcon}</button>
        ${languageButton}
      </div>
      ${githubHtml}
    `;
  }
}

customElements.define(TAG, ShirazehActions);

export { ShirazehActions, TAG };
