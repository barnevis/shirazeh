// Sidebar navigation component: nested collapsible tree, active-branch
// auto-open, and the mobile slide-in drawer (hamburger + click-outside
// overlay). Receives the parsed sidebar tree and the current route path via
// connect refs; navigates through the router service.

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
  #openLabel = '';
  #openIds = new Set();
  #everRendered = false;

  onConnect(refs) {
    this.#tree = Array.isArray(refs.tree) ? refs.tree : [];
    this.#path = typeof refs.path === 'string' ? refs.path : '/';
    this.#router = refs.router ?? null;
    this.#openLabel = typeof refs.openLabel === 'string' ? refs.openLabel : '';
    this.#openBranchTo(this.#path, this.#tree);
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

  eventTypes() {
    return ['click'];
  }

  handleEvent(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const toggle = target.closest('button[data-sidebar-toggle]');
    if (toggle !== null) {
      event.preventDefault();
      this.#toggleSubmenu(toggle);
      return;
    }

    // Mobile drawer controls: hamburger opens, overlay closes.
    const hamburger = target.closest('button[data-sidebar-hamburger]');
    if (hamburger !== null) {
      this.#openDrawer();
      return;
    }
    if (target.closest('[data-sidebar-overlay]') !== null) {
      this.#closeDrawer();
      return;
    }

    // Navigating to a sidebar page re-opens its branch and closes the drawer;
    // navigation itself goes through the router like every other chrome link.
    const link = target.closest('a[data-route]');
    if (link !== null) {
      event.preventDefault();
      const route = link.dataset.route;
      this.#openIds.clear();
      this.#openBranchTo(route, this.#tree);
      this.#closeDrawer();
      this.#router?.navigate?.(route);
      this.requestRender({ preserve: false });
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
    toggle.closest('li')?.querySelector('.sidebar-submenu')?.classList.toggle('is-open', !isOpen);
  }

  #openDrawer() {
    this.#aside()?.classList.add('is-mobile-open');
    this.#overlay()?.classList.add('is-visible');
  }

  #closeDrawer() {
    this.#aside()?.classList.remove('is-mobile-open');
    this.#overlay()?.classList.remove('is-visible');
  }

  #aside() {
    return this.shadowRoot?.querySelector('aside');
  }

  #overlay() {
    return this.shadowRoot?.querySelector('.sidebar-overlay');
  }

  #renderNodes(nodes) {
    return nodes.map((node) => {
      const route = normalizeHref(node.href);
      const hasChildren = node.children.length > 0;
      const isCurrent = route === this.#path ? ' aria-current="page"' : '';
      const isOpen = this.#openIds.has(node.href);
      const self = `<a href="#${route}" data-route="${escapeHtml(route)}"${isCurrent}>${escapeHtml(node.title)}</a>`;
      const toggle = hasChildren
        ? `<button type="button" class="sidebar-toggle-item" data-sidebar-toggle="${escapeHtml(node.href)}" aria-expanded="${isOpen}">›</button>`
        : '';
      const submenu = hasChildren
        ? `<ul class="sidebar-submenu${isOpen ? ' is-open' : ''}">${this.#renderNodes(node.children)}</ul>`
        : '';
      return `<li class="${hasChildren ? 'has-children' : ''}">${self}${toggle}${submenu}</li>`;
    }).join('');
  }

  render() {
    return `
      <style>
        :host {
          display: block;
          min-inline-size: 0;
        }
        aside {
          display: block;
        }
        aside[hidden] {
          display: none;
        }
        ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: var(--pey-space-1);
        }
        li.has-children {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
        }
        li.has-children > a {
          grid-column: 1;
        }
        .sidebar-toggle-item {
          grid-column: 2;
          border: none;
          background: none;
          padding: 0 var(--pey-space-1);
          color: var(--pey-color-text-muted);
          cursor: pointer;
          font-size: inherit;
        }
        .sidebar-toggle-item[aria-expanded='true'] {
          transform: rotate(90deg);
          display: inline-block;
        }
        .sidebar-submenu {
          display: none;
          padding-inline-start: var(--pey-space-4);
          grid-column: 1 / -1;
        }
        .sidebar-submenu.is-open {
          display: grid;
        }
        a {
          display: block;
          padding: var(--pey-space-1) var(--pey-space-2);
          border-radius: var(--pey-radius-sm);
          color: var(--pey-color-text);
          text-decoration: none;
          font-size: var(--pey-font-size-sm);
        }
        a:hover {
          background-color: var(--pey-color-surface);
        }
        a[aria-current='page'] {
          font-weight: 600;
          color: var(--pey-color-accent);
        }
        .sidebar-overlay {
          display: none;
        }
        .sidebar-overlay.is-visible {
          display: block;
        }
        .sidebar-hamburger {
          display: none;
        }
        /* Mobile: the sidebar becomes a slide-in drawer with an overlay. */
        @media (max-width: 48rem) {
          .sidebar-hamburger {
            display: block;
            position: fixed;
            inset-block-start: var(--pey-space-4);
            inset-inline-start: var(--pey-space-4);
            z-index: 25;
            border: 1px solid var(--pey-color-border);
            border-radius: var(--pey-radius-md);
            background-color: var(--pey-color-canvas);
            color: var(--pey-color-text);
            padding: var(--pey-space-1) var(--pey-space-3);
            cursor: pointer;
            font-size: 1rem;
          }
          aside {
            position: fixed;
            inset-block: 0;
            inset-inline-start: 0;
            inline-size: min(80vw, 18rem);
            background-color: var(--pey-color-canvas);
            border-inline-end: 1px solid var(--pey-color-border);
            padding: var(--pey-space-4);
            margin: 0;
            transform: translateX(110%);
            transition: transform var(--pey-duration-base) ease;
            z-index: 30;
          }
          aside.is-mobile-open {
            transform: translateX(0);
          }
          .sidebar-overlay.is-visible {
            display: block;
            position: fixed;
            inset: 0;
            background-color: rgb(0 0 0 / 0.4);
            z-index: 20;
          }
        }
      </style>
      <div class="sidebar-overlay" data-sidebar-overlay></div>
      <button type="button" class="sidebar-hamburger" data-sidebar-hamburger aria-label="${escapeHtml(this.#openLabel)}">☰</button>
      <aside part="sidebar"${this.#tree.length === 0 ? ' hidden' : ''}>
        <nav aria-label="documentation">
          <ul>${this.#renderNodes(this.#tree)}</ul>
        </nav>
      </aside>
    `;
  }
}

customElements.define(TAG, ShirazehSidebar);

export { ShirazehSidebar, TAG };
