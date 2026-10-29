// Sidebar navigation component — visual port of the old Shirazeh sidebar:
// brand header (logo + app name), collapsible tree with animated submenus,
// active link with a colored border, desktop collapse, and the mobile
// drawer (hamburger + click-outside overlay). Receives the parsed sidebar
// tree and the current route path via connect refs; navigates through the
// router service.

import { PeyElement } from 'pey.webui/base/pey-element';

const TAG = 'shirazeh-sidebar';

function normalizeHref(href) {
  const withoutDot = href.startsWith('./') ? href.slice(2) : href;
  return withoutDot.startsWith('/') ? withoutDot : `/${withoutDot}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

class ShirazehSidebar extends PeyElement {
  #tree = [];
  #path = '/';
  #router = null;
  #appName = null;
  #logo = null;
  #openIds = new Set();
  #everRendered = false;
  #collapsed = null;

  onConnect(refs) {
    this.#tree = Array.isArray(refs.tree) ? refs.tree : [];
    this.#path = typeof refs.path === 'string' ? refs.path : '/';
    this.#router = refs.router ?? null;
    this.#appName = typeof refs.appName === 'string' && refs.appName.trim().length > 0
      ? refs.appName
      : null;
    this.#logo = refs.logo ?? null;
    this.#openBranchTo(this.#path, this.#tree);
    // Old behavior: the drawer starts closed on mobile, open on desktop.
    if (this.#collapsed === null) {
      const mobile = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 767px)').matches
        : false;
      this.#collapsed = mobile;
    }
    this.#applyOffset();
  }

  /** Replaces the parsed tree (async sidebar data) and re-renders. */
  setTree(tree) {
    this.#tree = Array.isArray(tree) ? tree : [];
    this.#openBranchTo(this.#path, this.#tree);
    this.requestRender({ preserve: false });
  }

  /** Updates the active route; keeps the sidebar persistent across pages. */
  setCurrentPath(path) {
    if (typeof path !== 'string' || path === this.#path) {
      return;
    }
    this.#path = path;
    this.#openBranchTo(path, this.#tree);
    this.requestRender({ preserve: false });
  }

  #applyOffset() {
    // The page content offsets itself through this custom property; mobile
    // overrides it to 0 via its own media query.
    document.documentElement.style.setProperty(
      '--shirazeh-sidebar-offset',
      this.#collapsed === true ? '0px' : 'var(--sidebar-width, 280px)',
    );
  }

  #openBranchTo(path, nodes) {
    for (const node of nodes) {
      if (normalizeHref(node.href) === path || this.#openBranchTo(path, node.children)) {
        this.#openIds.add(node.href);
        return true;
      }
    }
    return false;
  }

  #isMobile() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 767px)').matches
      : false;
  }

  eventTypes() {
    return ['click'];
  }

  handleEvent(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    // Chevron (parents with a link): toggles the submenu only — the click
    // must not fall through to the surrounding anchor's navigation.
    const chevron = target.closest('.submenu-arrow[data-sidebar-toggle]');
    if (chevron !== null) {
      event.preventDefault();
      this.#toggleSubmenu(chevron);
      return;
    }

    // Text parents (no own link): the whole row is the toggle.
    const toggle = target.closest('.submenu-toggle[data-sidebar-toggle]');
    if (toggle !== null) {
      event.preventDefault();
      this.#toggleSubmenu(toggle);
      return;
    }

    // Collapse button: closes the drawer on mobile, collapses the column on
    // desktop; clicking again reopens — the old sidebar-collapsed toggle.
    // State lives on the host class only: a requestRender here would wipe the
    // shadow root and destroy the mounted component.
    if (target.closest('button[data-sidebar-collapse]') !== null) {
      this.#collapsed = !this.#collapsed;
      this.#applyOffset();
      this.classList.toggle('is-collapsed', this.#collapsed);
      return;
    }

    if (target.closest('[data-sidebar-overlay]') !== null) {
      this.#collapsed = true;
      this.classList.add('is-collapsed');
      return;
    }

    // All row links navigate; the fresh page mount re-applies the branch
    // state from #openIds (and closes the mobile drawer).
    const link = target.closest('a[data-route]');
    if (link !== null) {
      event.preventDefault();
      const route = link.dataset.route;
      this.#openIds.clear();
      this.#openBranchTo(route, this.#tree);
      if (this.#isMobile()) {
        this.#collapsed = true;
        this.#applyOffset();
        this.classList.add('is-collapsed');
      }
      this.#router?.navigate?.(route);
      return;
    }
  }

  #toggleSubmenu(toggle) {
    const key = toggle.dataset.sidebarToggle;
    const isOpen = this.#openIds.has(key);
    if (isOpen) {
      this.#openIds.delete(key);
    } else {
      this.#openIds.add(key);
    }
    toggle.setAttribute('aria-expanded', String(!isOpen));
    const listItem = toggle.closest('li');
    listItem?.querySelector('.sidebar-submenu')?.classList.toggle('open', !isOpen);
    listItem?.classList.toggle('open', !isOpen);
  }

  #renderNodes(nodes) {
    return nodes.map((node) => {
      const route = normalizeHref(node.href);
      const hasChildren = node.children.length > 0;
      const isOpen = this.#openIds.has(node.href);
      const liClass = [
        hasChildren ? 'has-submenu' : '',
        hasChildren && isOpen ? 'open' : '',
      ].filter(Boolean).join(' ');

      // For link parents the chevron is its own toggle (clicking the row
      // navigates to the page); for text parents the whole row toggles.
      const arrow = hasChildren
        ? `<span class="submenu-arrow" role="button" tabindex="0" data-sidebar-toggle="${escapeHtml(node.href)}" aria-expanded="${isOpen}" aria-controls="submenu-${escapeHtml(node.href)}" aria-label="باز و بسته کردن زیرمجموعه ${escapeHtml(node.title)}"></span>`
        : '';
      const toggleAttr = node.type === 'text' && hasChildren
        ? ` data-sidebar-toggle="${escapeHtml(node.href)}" aria-expanded="${isOpen}" aria-controls="submenu-${escapeHtml(node.href)}"`
        : '';

      let entry;
      if (node.type === 'text') {
        entry = `<button type="button" class="submenu-toggle"${toggleAttr}>${escapeHtml(node.title)}${arrow}</button>`;
      } else {
        const isCurrent = route === this.#path ? ' class="active"' : '';
        entry = `<a href="#${route}" data-route="${escapeHtml(route)}"${isCurrent}>${escapeHtml(node.title)}${arrow}</a>`;
      }

      const submenu = hasChildren
        ? `<ul class="sidebar-submenu${isOpen ? ' open' : ''}" id="submenu-${escapeHtml(node.href)}">${this.#renderNodes(node.children)}</ul>`
        : '';
      return `<li class="${liClass}">${entry}${submenu}</li>`;
    }).join('');
  }

  #brandHtml() {
    const logo = this.#logo ?? {};
    const logoHtml = logo.enabled === true && typeof logo.src === 'string' && logo.src.length > 0
      ? `<img class="app-logo" src="${escapeHtml(logo.src)}" alt="" style="inline-size: ${escapeHtml(logo.size ?? '32px')}">`
      : '';
    const appName = this.#appName ?? 'شیرازه';
    const hasBrand = logoHtml !== '' || this.#appName !== null;
    if (!hasBrand) {
      return '';
    }
    return `
      <div class="sidebar-header">
        <a class="app-title-link" href="#/" data-route="/">
          ${logoHtml}
          <h2>${escapeHtml(appName)}</h2>
        </a>
      </div>
    `;
  }

  render() {
    const collapsed = this.#collapsed === true;
    return `
      <style>
        :host {
          display: block;
          min-inline-size: 0;
          flex-shrink: 0;
        }
        .sidebar-overlay {
          display: none;
        }
        aside {
          inline-size: var(--sidebar-width, 280px);
          background-color: var(--pey-color-surface);
          block-size: 100vh;
          /* Fixed chrome: the sidebar persists across page navigations and
             never scrolls with the content. */
          position: fixed;
          inset-block: 0;
          inset-inline-start: 0;
          border-inline-end: 1px solid var(--pey-color-border);
          transition: margin 0.3s ease;
          z-index: 100;
          display: flex;
          flex-direction: column;
          margin: 0;
        }
        :host(.is-collapsed) aside {
          margin-inline-start: calc(-1 * var(--sidebar-width, 280px));
        }
        .sidebar-header {
          display: flex;
          align-items: center;
          padding: 0 1.5rem;
          block-size: var(--header-height, 60px);
          border-block-end: 1px solid var(--pey-color-border);
          flex-shrink: 0;
        }
        .app-title-link {
          text-decoration: none;
          color: inherit;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          overflow: hidden;
        }
        .app-logo {
          flex-shrink: 0;
          align-self: center;
        }
        .sidebar-header h2 {
          margin: 0;
          font-size: 1.5rem;
          color: var(--pey-color-heading);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sidebar-nav {
          overflow-y: auto;
          flex: 1;
        }
        .sidebar-nav ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .sidebar-nav a,
        .sidebar-nav .submenu-toggle {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          inline-size: 100%;
          padding: 0.75rem 1.5rem;
          color: var(--pey-color-text);
          text-decoration: none;
          border-inline-start: 3px solid transparent;
          transition: background-color 0.2s, border-color 0.2s, color 0.2s;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          position: relative;
        }
        .sidebar-nav .submenu-toggle {
          background: none;
          border: none;
          border-inline-start: 3px solid transparent;
          font-family: inherit;
          font-size: inherit;
          cursor: pointer;
          color: var(--pey-color-text);
        }
        .sidebar-nav a:hover,
        .sidebar-nav .submenu-toggle:hover {
          background-color: var(--pey-color-border);
        }
        .sidebar-nav a.active {
          color: var(--pey-color-accent);
          border-inline-start-color: var(--pey-color-accent);
          background-color: color-mix(in srgb, var(--pey-color-accent) 10%, transparent);
        }
        .sidebar-submenu {
          background-color: rgb(0 0 0 / 0.05);
          max-block-size: 0;
          overflow: hidden;
          transition: max-block-size 0.3s ease-out;
          padding-inline-start: 1rem;
        }
        .sidebar-submenu.open {
          max-block-size: 1000px;
        }
        .submenu-arrow {
          /* Chevron in the gap between the sidebar's inline edge and the
             title (the title text starts at 1.5rem padding). */
          position: absolute;
          inset-inline-start: 0.4rem;
          inset-block: 0;
          margin-block: auto;
          block-size: 1rem;
          inline-size: 1rem;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.3s ease;
        }
        .submenu-arrow::before {
          content: '›';
          display: inline-block;
          font-weight: bold;
        }
        li.has-submenu.open > a > .submenu-arrow,
        li.has-submenu.open > .submenu-toggle .submenu-arrow {
          transform: rotate(-90deg);
        }
        .sidebar-collapse {
          background: none;
          border: none;
          color: var(--pey-color-text);
          cursor: pointer;
          position: fixed;
          inset-block-start: 10px;
          inset-inline-start: 15px;
          z-index: 101;
          display: flex;
          align-items: center;
          justify-content: center;
          inline-size: 44px;
          block-size: 44px;
          padding: 0;
          border-radius: 50%;
          transition: inset 0.3s ease, background-color 0.2s;
        }
        .sidebar-collapse:hover {
          background-color: var(--pey-color-border);
        }
        .sidebar-collapse svg {
          inline-size: 24px;
          block-size: 24px;
        }
        @media (min-width: 768px) {
          :host(:not(.is-collapsed)) .sidebar-collapse {
            inset-inline-start: calc(var(--sidebar-width, 280px) - 50px);
          }
        }
        .sidebar-overlay {
          position: fixed;
          inset: 0;
          background-color: rgb(0 0 0 / 0.5);
          z-index: 99;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        /* Mobile: slide-in drawer over a dimmed page (old responsive.css). */
        @media (max-width: 767px) {
          aside {
            position: fixed;
            inset-block: 0;
            inset-inline-start: 0;
            margin: 0;
            transform: translateX(100%);
            transition: transform 0.3s ease;
          }
          :host(:dir(ltr)) aside {
            transform: translateX(-100%);
          }
          :host(:not(.is-collapsed)) aside {
            transform: translateX(0);
          }
          :host(.is-collapsed) aside {
            margin-inline-start: 0;
          }
          :host(:not(.is-collapsed)) .sidebar-overlay {
            opacity: 1;
            visibility: visible;
          }
        }
      </style>
      <button type="button" class="sidebar-collapse" data-sidebar-collapse aria-label="sidebar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>
      <div class="sidebar-overlay" data-sidebar-overlay></div>
      <aside part="sidebar"${this.#tree.length === 0 ? ' hidden' : ''}>
        ${this.#brandHtml()}
        <nav class="sidebar-nav" aria-label="documentation">
          <ul>${this.#renderNodes(this.#tree)}</ul>
        </nav>
      </aside>
    `;
  }
}

customElements.define(TAG, ShirazehSidebar);

export { ShirazehSidebar, TAG };
