// On-page table-of-contents panel: nested collapsible headings built from
// the rendered page toc, scrollspy highlighting via IntersectionObserver,
// and smooth scroll on entry click. Owns its styles; the content element to
// observe arrives through connect refs.

import { PeyElement } from 'pey.webui/base/pey-element';
import { activeBranchIds, buildTocTree } from '../pages/docs/toc-tree.js';

const TAG = 'shirazeh-toc';

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

class ShirazehToc extends PeyElement {
  #toc = [];
  #path = '/';
  #maxDepth = 3;
  #title = '';
  #contentRoot = null;
  #tree = [];
  #openIds = new Set();
  #activeId = null;
  #observer = null;
  #hovered = false;

  onConnect(refs) {
    this.#toc = Array.isArray(refs.toc) ? refs.toc : [];
    this.#path = typeof refs.path === 'string' ? refs.path : '/';
    this.#maxDepth = Number.isInteger(refs.maxDepth) && refs.maxDepth > 0 ? refs.maxDepth : 3;
    this.#title = typeof refs.title === 'string' ? refs.title : '';
    this.#contentRoot = refs.contentRoot ?? null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.#tree = buildTocTree(this.#toc, this.#maxDepth);
    // Sidebar parity: every parent starts open; the open state lives only in
    // this set so re-renders keep manually closed submenus closed.
    this.#openIds = new Set(this.#collectParentIds(this.#tree));
    this.#setupScrollspy();
  }

  #collectParentIds(nodes) {
    const ids = [];
    for (const node of nodes) {
      if (node.children.length > 0) {
        ids.push(node.id, ...this.#collectParentIds(node.children));
      }
    }
    return ids;
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#observer = null;
    super.disconnectedCallback();
  }

  // Scrollspy follows the topmost heading visible in the reading area and
  // highlights its entry; the panel follows the active entry unless the
  // user is hovering it.
  #setupScrollspy() {
    const headings = this.#contentRoot
      ? [...this.#contentRoot.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')]
      : [];
    if (headings.length === 0 || typeof IntersectionObserver !== 'function') {
      return;
    }

    this.shadowRoot?.querySelector('.toc-panel')
      ?.addEventListener('mouseenter', () => { this.#hovered = true; });
    this.shadowRoot?.querySelector('.toc-panel')
      ?.addEventListener('mouseleave', () => { this.#hovered = false; });

    const visible = new Set();
    const applyActive = () => {
      const topmost = headings.find((heading) => visible.has(heading));
      this.#setActive(topmost?.id ?? null);
    };

    this.#observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          visible.add(entry.target);
        } else {
          visible.delete(entry.target);
        }
      }
      applyActive();
    }, { rootMargin: '0px 0px -75% 0px', threshold: 0 });

    for (const heading of headings) {
      this.#observer.observe(heading);
    }
  }

  #setActive(id) {
    if (id === this.#activeId) {
      return;
    }
    this.#activeId = id;

    const branch = id === null ? new Set() : activeBranchIds(this.#tree, id);
    for (const link of this.shadowRoot?.querySelectorAll('[data-toc-link]') ?? []) {
      const linkId = link.dataset.tocLink;
      link.classList.toggle('is-active', linkId === id);
      link.classList.toggle('is-on-branch', branch.has(linkId) && linkId !== id);
    }

    if (!this.#hovered) {
      this.shadowRoot?.querySelector('[data-toc-link].is-active')
        ?.scrollIntoView?.({ block: 'nearest' });
    }
  }

  eventTypes() {
    return ['click'];
  }

  handleEvent(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const toggle = target.closest('button[data-toc-toggle]');
    if (toggle !== null) {
      event.preventDefault();
      const id = toggle.dataset.tocToggle;
      if (this.#openIds.has(id)) {
        this.#openIds.delete(id);
      } else {
        this.#openIds.add(id);
      }
      const listItem = toggle.closest('li');
      const submenu = listItem?.querySelector('ul');
      submenu?.classList.toggle('is-open');
      const isOpen = submenu?.classList.contains('is-open') ?? false;
      toggle.setAttribute('aria-expanded', String(isOpen));
      return;
    }

    const link = target.closest('a[data-toc-link]');
    if (link !== null) {
      event.preventDefault();
      // The toc ids are the heading ids verbatim (pey.markdown emits them
      // percent-encoded) — the router already decoded the query once, so no
      // extra decoding here: getElementById must see the exact id.
      const headingId = link.dataset.tocLink;
      // The headings live in the page's shadow root; getRootNode() reaches it
      // without coupling this component to the page element.
      this.#contentRoot?.getRootNode()?.getElementById?.(headingId)
        ?.scrollIntoView?.({ behavior: 'smooth' });
      this.#setActive(link.dataset.tocLink);
    }
  }

  #renderNodes(nodes) {
    return nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isOpen = this.#openIds.has(node.id);
      const isActive = node.id === this.#activeId;
      const toggle = hasChildren
        ? `<button type="button" class="toc-toggle" data-toc-toggle="${escapeHtml(node.id)}" aria-expanded="${isOpen}" aria-controls="toc-submenu-${escapeHtml(node.id)}" aria-label="باز و بسته کردن زیرمجموعه ${escapeHtml(node.text)}">›</button>`
        : '';
      const link = `<a href="#${this.#path}?a=${encodeURIComponent(node.id)}" data-toc-link="${escapeHtml(node.id)}" class="${isActive ? 'is-active' : ''}">${escapeHtml(node.text)}</a>`;
      const children = hasChildren
        ? `<ul id="toc-submenu-${escapeHtml(node.id)}" class="${isOpen ? 'is-open' : ''}">${this.#renderNodes(node.children)}</ul>`
        : '';
      return `<li>${toggle}${link}${children}</li>`;
    }).join('');
  }

  render() {
    if (this.#tree.length === 0) {
      return '';
    }

    return `
      <style>
        :host {
          display: none;
        }
        @media (min-width: 75rem) {
          :host {
            display: block;
            position: fixed;
            inset-block-start: 6rem;
            inset-inline-end: var(--pey-space-6);
            inline-size: 15rem;
            max-block-size: calc(100vh - 8rem);
            overflow-y: auto;
            font-size: var(--pey-font-size-sm);
            border-inline-start: 1px solid var(--pey-color-border);
            padding-inline-start: var(--pey-space-4);
          }
        }
        .toc-title {
          margin: 0 0 var(--pey-space-2);
          font-weight: 600;
        }
        ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        ul ul {
          padding-inline-start: var(--pey-space-4);
        }
        ul ul:not(.is-open) {
          display: none;
        }
        li {
          margin-block: var(--pey-space-1);
        }
        a {
          color: var(--pey-color-text-muted);
          text-decoration: none;
        }
        a:hover {
          color: var(--pey-color-text);
        }
        a.is-active {
          color: var(--pey-color-accent);
          font-weight: 600;
        }
        .toc-toggle {
          border: none;
          background: none;
          padding: 0 var(--pey-space-1);
          color: var(--pey-color-text-muted);
          cursor: pointer;
          font-size: inherit;
          display: inline-block;
          transition: transform 0.3s ease;
        }
        /* Sidebar parity: the chevron turns to point down when the submenu
           is open. */
        .toc-toggle[aria-expanded='true'] {
          transform: rotate(-90deg);
        }
      </style>
      <aside class="toc-panel" part="toc">
        <nav aria-label="${escapeHtml(this.#title)}">
          <p class="toc-title">${escapeHtml(this.#title)}</p>
          <ul>${this.#renderNodes(this.#tree)}</ul>
        </nav>
      </aside>
    `;
  }
}

customElements.define(TAG, ShirazehToc);

export { ShirazehToc, TAG };
