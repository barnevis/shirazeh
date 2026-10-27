// Top navigation bar: logo/brand, configured zones (navbar.md), theme
// toggle, language switch, GitHub link, and shrink/hide scroll behavior.

import { PeyElement } from 'pey.webui/base/pey-element';
import appCatalog from '../i18n/catalog.js';
import { createI18n } from 'pey.webui/i18n';

const TAG = 'shirazeh-navbar';
const LANGUAGE_KEY = 'language';
const DIRECTION_KEY = 'direction';
const THEME_KEY = 'theme';
const DIRECTION_BY_LANGUAGE = { fa: 'rtl', en: 'ltr' };
const LANGUAGES = ['fa', 'en'];
const ZONES = ['left', 'center', 'right'];

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function normalizeHref(href) {
  const withoutDot = href.startsWith('./') ? href.slice(2) : href;
  return withoutDot.startsWith('/') ? withoutDot : `/${withoutDot}`;
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
  #zones = null;
  #navbarConfig = {};
  #currentPath = '/';
  #theme = 'light';
  #unsubscribers = [];
  #scrollCleanup = null;
  #lastScrollY = 0;

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
    this.#zones = refs.navbarZones ?? null;
    this.#navbarConfig = refs.navbarConfig ?? {};
    this.#fallbackPath = typeof refs.fallbackPath === 'string' ? refs.fallbackPath : '/';
    this.#theme = this.#sharedState?.get(THEME_KEY) ?? 'light';
    this.#buildI18n(this.#sharedState?.get(LANGUAGE_KEY) ?? 'fa');
  }

  /** Applies parsed navbar zones fetched asynchronously by the entry point. */
  setZones(zones) {
    this.#zones = zones;
    this.requestRender({ preserve: false });
  }

  /** Sets the visually current path for active-link matching. */
  setCurrentPath(path) {
    if (typeof path === 'string' && path !== this.#currentPath) {
      this.#currentPath = path;
      this.requestRender({ preserve: false });
    }
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

    this.#attachScrollBehavior();
  }

  // shrink/hide scroll behavior: rAF-throttled window scroll listener that
  // toggles host classes instead of touching body styles.
  #attachScrollBehavior() {
    const behavior = this.#navbarConfig?.scrollBehavior;
    if (behavior !== 'shrink' && behavior !== 'hide') {
      return;
    }

    let ticking = false;
    const onScroll = () => {
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        const y = window.scrollY ?? 0;
        const goingDown = y > this.#lastScrollY;
        this.#lastScrollY = y;
        this.classList.toggle('is-scrolled', y > 10);
        if (behavior === 'hide') {
          this.classList.toggle('is-hidden', y > 10 && goingDown);
        }
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    this.#scrollCleanup = () => window.removeEventListener('scroll', onScroll);
  }

  disconnectedCallback() {
    this.#scrollCleanup?.();
    this.#scrollCleanup = null;
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
      return;
    }

    // Configured zone links route through the router; external links keep
    // their default behavior.
    const zoneLink = target.closest('a[data-zone-href]');
    if (zoneLink !== null) {
      const href = zoneLink.dataset.zoneHref;
      if (/^https?:\/\//i.test(href)) {
        return;
      }
      event.preventDefault();
      this.#navigate(href);
    }
  }

  // Longest-prefix active match: the configured link whose normalized href
  // is the deepest prefix of the current path.
  #isActiveZoneHref(href) {
    const route = normalizeHref(this.#currentPath);
    const target = normalizeHref(href);
    if (target === '/') {
      return route === '/';
    }
    return route === target || route.startsWith(`${target}/`);
  }

  #zoneOrder(zone) {
    // Zones are named for their visual side; keep that side stable when the
    // direction flips by reversing the visual order in RTL.
    const rtl = this.#i18n?.language?.startsWith('fa') ?? false;
    const ltrOrder = { left: 1, center: 2, right: 3 };
    const rtlOrder = { left: 3, center: 2, right: 1 };
    return rtl ? rtlOrder[zone] : ltrOrder[zone];
  }

  #renderZoneItems(items) {
    return items.map((item) => {
      if (item.type === 'divider') {
        return '<span class="zone-divider" role="separator"></span>';
      }

      const badge = item.badge !== null
        ? `<span class="zone-badge">${escapeHtml(item.badge)}</span>`
        : '';
      const children = item.children.length > 0
        ? `<ul class="zone-menu">${this.#renderZoneItems(item.children)}</ul>`
        : '';

      if (item.type === 'text') {
        return `<span class="zone-item zone-text">${escapeHtml(item.label)}${badge}${children}</span>`;
      }

      const classes = [
        'zone-item',
        item.cta === true ? 'zone-cta' : '',
        this.#isActiveZoneHref(item.href) ? 'is-active' : '',
      ].filter(Boolean).join(' ');
      const external = /^https?:\/\//i.test(item.href);
      const externalAttrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
      const href = external ? escapeHtml(item.href) : `#${normalizeHref(item.href)}`;
      const dataHref = external ? '' : ` data-zone-href="${escapeHtml(normalizeHref(item.href))}"`;

      return `<a class="${classes}" href="${href}"${dataHref}${externalAttrs}>${escapeHtml(item.label)}${badge}</a>${children}`;
    }).join('');
  }

  #renderZones() {
    if (this.#zones === null) {
      return '';
    }

    return ZONES.map((zone) => {
      const items = this.#zones.zones?.[zone] ?? [];
      if (items.length === 0) {
        return '';
      }
      return `<div class="navbar-zone zone-${zone}" style="order: ${this.#zoneOrder(zone)}"><nav aria-label="${zone}">${this.#renderZoneItems(items)}</nav></div>`;
    }).join('');
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
      ? (github.style === 'corner'
        ? `<a class="github-corner" href="${escapeHtml(github.url)}" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">
             <svg viewBox="0 0 250 250" aria-hidden="true"><path d="M0 0 115 115h250V0Z"/><path class="octo-arm" d="M128.3 109c-14.5-9.3-9.3-19.4-9.3-19.4 3-6.9 1.5-11 1.5-11-1.3-6.6 2.9-2.3 3.9-1.7 4.6 2.7 7.4 10.1 7.4 10.1 5.6 13.5 14.6 10.1 18.1 7.7.4-4 .8-6.6 1-7.7-3.5-3.9-7.4-9.7-7.4-18.4 0-6.4 2-11.4 5.2-15.4-.5-.4-2.3-2.7 0-6.7 0 0 4.3 1.4 10.1 5.2 4.1-1.1 8.5-1.7 12.9-1.7s8.8.6 12.9 1.7c5.8-3.8 10.1-5.2 10.1-5.2 2.3 4 1.5 6.3.5 6.7 3.2 4 5.2 9 5.2 15.4 0 8.7-3.9 14.5-7.4 18.4.5.4 2.4 2.1 1 6.7-.1.1-4.5 8.9-19.4 9.3 2.6 2.2 4.9 6.4 4.9 12.9v19.2c0 2.1 1.5 4.6 5 3.8 30.7-10.2 52.8-39.2 52.8-73.2C250 55.7 194.3 0 125 0S0 55.7 0 124c0 34 22.1 63 52.8 73.2 3.5.8 5-1.7 5-3.8V169c-24.3 5.3-29.4-11.7-29.4-11.7-3.9-10-9.6-12.7-9.6-12.7-7.9-5.4.6-5.3.6-5.3 8.7.6 13.3 9 13.3 9 7.8 13.3 20.4 9.5 25.4 7.3.8-5.7 3-9.5 5.5-11.7-19.4-2.2-39.8-9.7-39.8-43.2 0-9.5 3.4-17.3 9-23.4-.9-2.2-3.9-11.1.9-23.1 0 0 7.3-2.3 23.9 8.9 6.9-1.9 14.4-2.9 21.8-3 7.4.1 14.9 1.1 21.8 3 16.6-11.2 23.9-8.9 23.9-8.9 4.8 12 1.8 20.9.9 23.1 5.6 6.1 9 13.9 9 23.4 0 33.6-20.5 41-40 43.2 3.1 2.7 5.9 8 5.9 16.1v23.9c0 2.1 1.4 4.6 5 3.8 30.6-10.3 52.7-39.2 52.7-73.3C250 55.7 194.3 0 125 0Z" fill="currentColor"/></svg>
           </a>`
        : `<a class="github-link" href="${escapeHtml(github.url)}" target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub">
             <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
           </a>`)
      : '';

    return `
      <style>
        :host {
          display: block;
          background-color: var(--pey-color-surface);
          border-block-end: 1px solid var(--pey-color-border);
          transition: transform var(--pey-duration-base) ease;
        }
        :host(.is-scrolled) {
          box-shadow: var(--pey-shadow-sm);
        }
        :host(.is-hidden) {
          transform: translateY(-100%);
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
        /* Configured zones (navbar.md) */
        .navbar-zone nav {
          display: flex;
          align-items: center;
          gap: var(--pey-space-2);
          flex-wrap: wrap;
        }
        .zone-item {
          display: inline-flex;
          align-items: center;
          gap: var(--pey-space-2);
          padding: var(--pey-space-1) var(--pey-space-2);
          border-radius: var(--pey-radius-md);
          color: var(--pey-color-text);
          text-decoration: none;
          font-size: var(--pey-font-size-sm);
        }
        a.zone-item:hover {
          background-color: var(--pey-color-surface);
        }
        a.zone-item.is-active {
          color: var(--pey-color-accent);
          font-weight: 600;
        }
        .zone-cta {
          border: 1px solid var(--pey-color-accent);
          color: var(--pey-color-accent);
        }
        .zone-badge {
          padding: 0 var(--pey-space-2);
          border-radius: 999px;
          background-color: var(--pey-color-accent);
          color: var(--pey-color-canvas);
          font-size: 0.7rem;
        }
        .zone-divider {
          inline-size: 1px;
          block-size: 1.2rem;
          background-color: var(--pey-color-border);
        }
        .zone-item {
          position: relative;
        }
        .zone-menu {
          display: none;
          position: absolute;
          inset-block-start: calc(100% + var(--pey-space-1));
          inset-inline-start: 0;
          min-inline-size: 12rem;
          padding: var(--pey-space-1);
          border: 1px solid var(--pey-color-border);
          border-radius: var(--pey-radius-md);
          background-color: var(--pey-color-canvas);
          box-shadow: var(--pey-shadow-sm);
          z-index: 10;
        }
        .zone-item:is(:hover, :focus-within) > .zone-menu,
        .zone-text:is(:hover, :focus-within) > .zone-menu {
          display: grid;
        }
        .zone-menu .zone-item {
          inline-size: 100%;
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
        /* Classic octocat corner (githubCorner.style === 'corner') */
        .github-corner {
          position: fixed;
          inset-block-start: 0;
          inset-inline-end: 0;
          inline-size: 4.5rem;
          block-size: 4.5rem;
          color: var(--pey-color-canvas);
          z-index: 40;
        }
        .github-corner svg {
          inline-size: 100%;
          block-size: 100%;
          fill: var(--pey-color-text);
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
        ${this.#renderZones()}
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
