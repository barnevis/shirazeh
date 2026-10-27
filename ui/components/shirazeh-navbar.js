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
  #appName = '';
  #logo = null;
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
    this.#appName = typeof refs.appName === 'string' && refs.appName.trim().length > 0
      ? refs.appName
      : null;
    this.#logo = refs.logo ?? null;
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

  #navigate(path) {
    if (this.#router && typeof this.#router.navigate === 'function') {
      this.#router.navigate(path);
    }
  }

  render() {
    const t = this.#i18n?.t ?? ((key) => key);
    const appName = this.#appName ?? t('shirazeh.app-name');
    const logo = this.#logo ?? {};
    const logoHtml = logo.enabled === true && typeof logo.src === 'string' && logo.src.length > 0
      ? `<img class="brand-logo" src="${escapeHtml(logo.src)}" alt="" style="inline-size: ${escapeHtml(logo.size ?? '32px')}">`
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
        .github-link:hover {
          color: var(--pey-color-accent);
        }
        /* Classic octocat corner (githubCorner.style === 'corner') */
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
      </nav>
    `;
  }
}

customElements.define(TAG, ShirazehNavbar);

export { ShirazehNavbar, TAG };
