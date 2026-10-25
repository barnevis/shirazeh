// Documentation page: sidebar navigation, rendered markdown content, and
// previous/next links. Data comes from shirazeh.docs.service; this component
// only displays it and forwards navigation.

import { PeyElement } from 'pey.webui/base/pey-element';
import { addCodeCopyButtons, addHeadingAnchors, applyImageSizes, wrapTables } from './enhance-content.js';
import { activeBranchIds, buildTocTree } from './toc-tree.js';

const TAG = 'app-page-docs';
const DOCS_SERVICE = 'shirazeh.docs.service';
const PARAM_KEYS = ['page', 'sub1', 'sub2', 'sub3', 'sub4'];
const TOC_MIN_HEADINGS = 2;

function routePathFromParams(params) {
  if (params === null || typeof params !== 'object') {
    return '/';
  }

  const segments = [];
  for (const key of PARAM_KEYS) {
    const value = params[key];
    if (typeof value !== 'string' || value.length === 0) {
      break;
    }
    segments.push(value);
  }

  return `/${segments.join('/')}`;
}

function isBonyanError(value) {
  return value !== null
    && typeof value === 'object'
    && typeof value.code === 'string'
    && typeof value.message === 'string';
}

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

class DocsPage extends PeyElement {
  #docsService = null;
  #router = null;
  #t = null;
  #config = {};
  #state = { status: 'loading' };
  #sidebarLinks = null;
  #tocTree = [];
  #tocOpenIds = new Set();
  #tocActiveId = null;
  #tocObserver = null;
  #tocHovered = false;
  #toastTimer = null;

  onConnect(refs) {
    this.#docsService = refs.services?.[DOCS_SERVICE] ?? null;
    this.#router = refs.router ?? null;
    this.#t = typeof refs.t === 'function' ? refs.t : (key) => key;
    this.#config = refs.config ?? {};
    this.#path = routePathFromParams(refs.routeParams);
    this.#anchorTarget = typeof refs.routeQuery?.a === 'string' ? refs.routeQuery.a : null;
  }

  #path = '/';
  #anchorTarget = null;

  connectedCallback() {
    super.connectedCallback();
    this.#loadPage();
  }

  disconnectedCallback() {
    clearTimeout(this.#toastTimer);
    this.#teardownScrollspy();
    super.disconnectedCallback();
  }

  async #loadPage() {
    const path = this.#path;

    if (this.#docsService === null) {
      this.#state = { status: 'error', code: 'SERVICE_UNAVAILABLE' };
      this.requestRender({ preserve: false });
      return;
    }

    const [page, sidebar] = await Promise.all([
      this.#docsService.getPage(path),
      this.#docsService.getSidebar().catch(() => null),
    ]);

    // A newer route may have mounted while the fetch was in flight.
    if (path !== this.#path) {
      return;
    }

    if (isBonyanError(page)) {
      this.#state = { status: 'error', code: page.code };
      this.#applyDocumentTitle(null);
    } else {
      this.#state = { status: 'ready', page };
      this.#applyDocumentTitle(page.documentTitle);
    }
    this.#sidebarLinks = Array.isArray(sidebar) ? sidebar : null;
    this.requestRender({ preserve: false });
    // The base class flushes the render in a microtask; queueMicrotask is
    // FIFO, so this post-processing runs against the freshly rendered DOM.
    queueMicrotask(() => this.#enhanceContent());
  }

  // The browser tab title: the page's resolved document title (sidebar
  // title attribute → sidebar label → first heading), else the app name
  // alone for error and not-found states.
  #applyDocumentTitle(documentTitle) {
    const appName = this.#t('shirazeh.app-name');
    if (typeof documentTitle === 'string' && documentTitle.length > 0) {
      document.title = `${documentTitle} | ${appName}`;
    } else {
      document.title = appName;
    }
  }

  #enhanceContent() {
    const content = this.shadowRoot?.querySelector('.markdown-body');
    if (content !== null && content !== undefined) {
      wrapTables(content);
      addHeadingAnchors(content, { path: this.#path });
      addCodeCopyButtons(content, { label: this.#t('shirazeh.code-copy.copy') });
      applyImageSizes(content);
      this.#setupScrollspy(content);
    } else {
      this.#teardownScrollspy();
    }

    // A deep link (#/path?a=<heading id>) scrolls to its heading after the
    // content and its anchors exist; consumed once per mount.
    if (this.#anchorTarget !== null) {
      const id = this.#anchorTarget;
      this.#anchorTarget = null;
      this.shadowRoot?.getElementById(decodeURIComponent(id))
        ?.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // Scrollspy follows the topmost heading visible in the reading area and
  // highlights its TOC entry; the panel itself follows the active entry
  // unless the user is hovering it.
  #setupScrollspy(content) {
    this.#teardownScrollspy();

    const headings = [...content.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')];
    if (headings.length === 0 || typeof IntersectionObserver !== 'function') {
      return;
    }

    const panel = this.shadowRoot?.querySelector('.toc-panel');
    if (panel !== null && panel !== undefined) {
      panel.addEventListener('mouseenter', () => { this.#tocHovered = true; });
      panel.addEventListener('mouseleave', () => { this.#tocHovered = false; });
    }

    const visible = new Set();
    const applyActive = () => {
      const topmost = headings.find((heading) => visible.has(heading));
      this.#setTocActive(topmost?.id ?? null);
    };

    this.#tocObserver = new IntersectionObserver((entries) => {
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
      this.#tocObserver.observe(heading);
    }
  }

  #teardownScrollspy() {
    this.#tocObserver?.disconnect();
    this.#tocObserver = null;
  }

  #setTocActive(id) {
    if (id === this.#tocActiveId) {
      return;
    }
    this.#tocActiveId = id;

    const branch = id === null ? new Set() : activeBranchIds(this.#tocTree, id);
    for (const link of this.shadowRoot?.querySelectorAll('[data-toc-link]') ?? []) {
      const linkId = link.dataset.tocLink;
      link.classList.toggle('is-active', linkId === id);
      link.classList.toggle('is-on-branch', branch.has(linkId) && linkId !== id);
    }

    if (!this.#tocHovered) {
      this.shadowRoot?.querySelector('[data-toc-link].is-active')
        ?.scrollIntoView({ block: 'nearest' });
    }
  }

  // Heading-anchor clicks copy the shareable deep-link URL and confirm with
  // a short toast instead of navigating (the page is already here).
  #copyHeadingLink(href) {
    const url = new URL(href, globalThis.location?.href ?? 'https://shirazeh.invalid').href;
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      clipboard.writeText(url).then(
        () => this.#showToast(this.#t('shirazeh.anchor.copied')),
        () => this.#showToast(this.#t('shirazeh.anchor.copy-failed')),
      );
      return;
    }
    this.#showToast(this.#t('shirazeh.anchor.copy-failed'));
  }

  #showToast(message) {
    const root = this.shadowRoot;
    if (root === null || root === undefined) {
      return;
    }

    root.querySelector('.page-toast')?.remove();
    const toast = root.ownerDocument?.createElement('div') ?? document.createElement('div');
    toast.className = 'page-toast';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    root.append(toast);

    clearTimeout(this.#toastTimer);
    this.#toastTimer = setTimeout(() => {
      toast.remove();
    }, 2000);
  }

  // Copy buttons confirm on themselves (label swap) instead of a toast, so
  // the feedback sits next to the block that was copied.
  #copyCode(button, code) {
    const setLabel = (key, stateClass) => {
      button.textContent = this.#t(key);
      button.classList.add(stateClass);
      setTimeout(() => {
        button.textContent = this.#t('shirazeh.code-copy.copy');
        button.classList.remove(stateClass);
      }, 2000);
    };

    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      clipboard.writeText(code).then(
        () => setLabel('shirazeh.code-copy.copied', 'is-success'),
        () => setLabel('shirazeh.code-copy.copy-failed', 'is-error'),
      );
      return;
    }
    setLabel('shirazeh.code-copy.copy-failed', 'is-error');
  }

  eventTypes() {
    return ['click'];
  }

  handleEvent(event) {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const headingAnchor = target.closest('a.heading-anchor');
    if (headingAnchor !== null) {
      event.preventDefault();
      this.#copyHeadingLink(headingAnchor.getAttribute('href') ?? '');
      return;
    }

    const copyButton = target.closest('button.copy-code-button');
    if (copyButton !== null) {
      const code = copyButton.closest('pre')?.querySelector('code')?.textContent ?? '';
      this.#copyCode(copyButton, code);
      return;
    }

    const tocToggle = target.closest('button[data-toc-toggle]');
    if (tocToggle !== null) {
      event.preventDefault();
      const id = tocToggle.dataset.tocToggle;
      if (this.#tocOpenIds.has(id)) {
        this.#tocOpenIds.delete(id);
      } else {
        this.#tocOpenIds.add(id);
      }
      const listItem = tocToggle.closest('li');
      const submenu = listItem?.querySelector('ul');
      submenu?.classList.toggle('is-open');
      tocToggle.setAttribute('aria-expanded', String(submenu?.classList.contains('is-open') ?? false));
      return;
    }

    const tocLink = target.closest('a[data-toc-link]');
    if (tocLink !== null) {
      event.preventDefault();
      this.shadowRoot?.getElementById(decodeURIComponent(tocLink.dataset.tocLink))
        ?.scrollIntoView({ behavior: 'smooth' });
      this.#setTocActive(tocLink.dataset.tocLink);
      return;
    }

    const anchor = target.closest('a');
    if (anchor === null) {
      return;
    }

    const href = anchor.getAttribute('href') ?? '';

    // Router-owned fragment links (#!/route style hrefs produced by this
    // page) navigate through the router, never through the raw hash.
    if (href.startsWith('#/')) {
      event.preventDefault();
      this.#navigate(href.slice(1));
      return;
    }

    // In-page heading anchors scroll within the page; they must never reach
    // the URL fragment, which the hash router owns.
    if (href.startsWith('#')) {
      event.preventDefault();
      const anchorId = href.slice(1);
      if (anchorId.length > 0) {
        this.shadowRoot.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth' });
      }
      return;
    }

    // Absolute URLs and other schemes keep their default browser behavior.
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      return;
    }

    // Relative document links route through the router instead of reloading.
    event.preventDefault();
    this.#navigate(normalizeHref(href));
  }

  #navigate(path) {
    if (this.#router && typeof this.#router.navigate === 'function') {
      this.#router.navigate(path);
    }
  }

  #renderSidebar() {
    if (this.#sidebarLinks === null) {
      return '<aside part="sidebar" hidden></aside>';
    }

    const currentPath = this.#path;
    const items = this.#sidebarLinks.map((link) => {
      const route = normalizeHref(link.href);
      const isCurrent = route === currentPath ? ' aria-current="page"' : '';
      const indentStyle = `margin-inline-start: ${(link.level - 1) * 0.9}rem`;
      return `<li style="${indentStyle}"><a href="#${route}" data-route="${escapeHtml(route)}"${isCurrent}>${escapeHtml(link.title)}</a></li>`;
    }).join('');

    return `
      <aside part="sidebar">
        <nav aria-label="documentation">
          <ul>${items}</ul>
        </nav>
      </aside>
    `;
  }

  // The on-page table of contents: a fixed side panel (wide screens only)
  // rebuilt per page from the rendered toc, with scrollspy highlighting.
  #tocEnabled() {
    return this.#config.toc?.enabled !== false;
  }

  #tocPanelHtml() {
    const page = this.#state.page;
    const tocConfig = this.#config.toc ?? {};
    const maxDepth = Number.isInteger(tocConfig.maxDepth) ? tocConfig.maxDepth : 3;

    if (!this.#tocEnabled() || !Array.isArray(page?.toc) || page.toc.length < TOC_MIN_HEADINGS) {
      return '';
    }

    this.#tocTree = buildTocTree(page.toc, maxDepth);
    if (this.#tocTree.length === 0) {
      return '';
    }

    const branch = this.#tocActiveId === null
      ? new Set()
      : activeBranchIds(this.#tocTree, this.#tocActiveId);

    const renderNodes = (nodes) => nodes.map((node) => {
      const hasChildren = node.children.length > 0;
      const isOpen = this.#tocOpenIds.size === 0 || this.#tocOpenIds.has(node.id);
      const isActive = node.id === this.#tocActiveId;
      const onBranch = branch.has(node.id) && !isActive;
      const toggle = hasChildren
        ? `<button type="button" class="toc-toggle" data-toc-toggle="${escapeHtml(node.id)}" aria-expanded="${isOpen}">›</button>`
        : '';
      const link = `<a href="#${this.#path}?a=${encodeURIComponent(node.id)}" data-toc-link="${escapeHtml(node.id)}" class="${isActive ? 'is-active' : ''}${onBranch ? ' is-on-branch' : ''}">${escapeHtml(node.text)}</a>`;
      const children = hasChildren
        ? `<ul class="${isOpen ? 'is-open' : ''}">${renderNodes(node.children)}</ul>`
        : '';
      return `<li>${toggle}${link}${children}</li>`;
    }).join('');

    return `
      <aside class="toc-panel" part="toc">
        <nav aria-label="${escapeHtml(this.#t('shirazeh.toc.title'))}">
          <p class="toc-title">${escapeHtml(this.#t('shirazeh.toc.title'))}</p>
          <ul class="toc-list">${renderNodes(this.#tocTree)}</ul>
        </nav>
      </aside>
    `;
  }

  #renderState() {
    const t = this.#t;

    if (this.#state.status === 'loading') {
      return `<div part="content" class="content loading">${escapeHtml(t('shirazeh.page.loading'))}</div>`;
    }

    if (this.#state.status === 'error') {
      const isNotFound = this.#state.code === 'DOC_PAGE_NOT_FOUND';
      const title = isNotFound ? t('shirazeh.page.not-found-title') : t('shirazeh.page.error-title');
      const body = isNotFound ? t('shirazeh.page.not-found-body') : escapeHtml(this.#state.code);
      return `
        <div part="content" class="content">
          <h1>${escapeHtml(title)}</h1>
          <p>${body}</p>
          <p><a href="#/" data-route="/">${escapeHtml(t('shirazeh.page.go-home'))}</a></p>
        </div>
      `;
    }

    const page = this.#state.page;
    const previous = page.previous
      ? `<a href="#${escapeHtml(normalizeHref(page.previous.href))}" data-route="${escapeHtml(normalizeHref(page.previous.href))}">${escapeHtml(t('shirazeh.page.previous'))}: ${escapeHtml(page.previous.title)}</a>`
      : '<span></span>';
    const next = page.next
      ? `<a href="#${escapeHtml(normalizeHref(page.next.href))}" data-route="${escapeHtml(normalizeHref(page.next.href))}">${escapeHtml(t('shirazeh.page.next'))}: ${escapeHtml(page.next.title)}</a>`
      : '<span></span>';

    return `
      <article part="content" class="content markdown-body">${page.html}</article>
      <nav part="pager" class="pager" aria-label="pagination">
        ${previous}
        ${next}
      </nav>
      ${this.#tocPanelHtml()}
    `;
  }

  render() {
    return `
      <style>
        :host {
          display: block;
        }
        .layout {
          display: grid;
          grid-template-columns: minmax(14rem, 18rem) minmax(0, 1fr);
          gap: var(--pey-space-8);
          inline-size: min(100% - 2rem, 72rem);
          margin-inline: auto;
          padding-block: var(--pey-space-6) var(--pey-space-8);
        }
        @media (max-width: 55rem) {
          .layout {
            grid-template-columns: minmax(0, 1fr);
          }
          aside[part="sidebar"] {
            border-block-end: 1px solid var(--pey-color-border);
            padding-block-end: var(--pey-space-4);
          }
        }
        aside[part="sidebar"] ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: var(--pey-space-1);
        }
        aside[part="sidebar"] a {
          display: block;
          padding: var(--pey-space-1) var(--pey-space-2);
          border-radius: var(--pey-radius-sm);
          color: var(--pey-color-text);
          text-decoration: none;
          font-size: var(--pey-font-size-sm);
        }
        aside[part="sidebar"] a:hover {
          background-color: var(--pey-color-surface);
        }
        aside[part="sidebar"] a[aria-current="page"] {
          font-weight: 600;
          color: var(--pey-color-accent);
        }
        .content {
          min-inline-size: 0;
        }
        .content.loading {
          color: var(--pey-color-text-muted);
          padding-block: var(--pey-space-8);
        }
        .markdown-body {
          line-height: var(--pey-line-height-base);
        }
        .markdown-body h1, .markdown-body h2, .markdown-body h3 {
          line-height: 1.3;
        }
        .markdown-body :is(h1, h2, h3, h4, h5, h6) .heading-anchor {
          margin-inline-start: var(--pey-space-2);
          opacity: 0;
          text-decoration: none;
          font-weight: 400;
        }
        .markdown-body :is(h1, h2, h3, h4, h5, h6):hover .heading-anchor,
        .markdown-body :is(h1, h2, h3, h4, h5, h6):focus-within .heading-anchor {
          opacity: 1;
        }
        .page-toast {
          position: fixed;
          inset-block-end: var(--pey-space-6);
          inset-inline: 0;
          margin-inline: auto;
          inline-size: fit-content;
          padding: var(--pey-space-2) var(--pey-space-4);
          border-radius: var(--pey-radius-md);
          background-color: var(--pey-color-text);
          color: var(--pey-color-canvas);
          box-shadow: var(--pey-shadow-sm);
          font-size: var(--pey-font-size-sm);
        }
        .markdown-body pre {
          direction: ltr;
          text-align: start;
          background-color: var(--pey-color-surface);
          border: 1px solid var(--pey-color-border);
          border-radius: var(--pey-radius-md);
          padding: var(--pey-space-4);
          overflow-x: auto;
          font-size: var(--pey-font-size-sm);
          position: relative;
        }
        .markdown-body pre .copy-code-button {
          position: absolute;
          inset-block-start: var(--pey-space-2);
          inset-inline-end: var(--pey-space-2);
          opacity: 0;
          font-family: var(--pey-font-family-base);
          font-size: var(--pey-font-size-sm);
          padding: var(--pey-space-1) var(--pey-space-3);
          border: 1px solid var(--pey-color-border);
          border-radius: var(--pey-radius-md);
          background-color: var(--pey-color-canvas);
          color: var(--pey-color-text);
          cursor: pointer;
        }
        .markdown-body pre:hover .copy-code-button,
        .markdown-body pre .copy-code-button:focus-visible {
          opacity: 1;
        }
        .markdown-body pre .copy-code-button.is-success {
          color: #059669;
          border-color: #059669;
        }
        .markdown-body pre .copy-code-button.is-error {
          color: var(--pey-color-status-error);
          border-color: var(--pey-color-status-error);
        }
        @media print {
          .markdown-body pre .copy-code-button,
          .page-toast,
          .toc-panel {
            display: none;
          }
        }
        .toc-panel {
          display: none;
        }
        @media (min-width: 75rem) {
          .toc-panel {
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
          .layout {
            padding-inline-end: 16rem;
          }
        }
        .toc-title {
          margin: 0 0 var(--pey-space-2);
          font-weight: 600;
        }
        .toc-list,
        .toc-list ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .toc-list ul {
          padding-inline-start: var(--pey-space-4);
        }
        .toc-list ul:not(.is-open) {
          display: none;
        }
        .toc-list li {
          margin-block: var(--pey-space-1);
        }
        .toc-list a {
          color: var(--pey-color-text-muted);
          text-decoration: none;
        }
        .toc-list a:hover {
          color: var(--pey-color-text);
        }
        .toc-list a.is-on-branch {
          color: var(--pey-color-text);
        }
        .toc-list a.is-active {
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
        }
        .toc-toggle[aria-expanded='true'] {
          transform: rotate(90deg);
          display: inline-block;
        }
        .markdown-body code {
          font-family: ui-monospace, monospace;
        }
        .markdown-body table {
          border-collapse: collapse;
          inline-size: 100%;
        }
        .markdown-body .table-wrapper {
          overflow-x: auto;
        }
        .markdown-body th, .markdown-body td {
          border: 1px solid var(--pey-color-border);
          padding: var(--pey-space-2) var(--pey-space-3);
        }
        .markdown-body img {
          max-inline-size: 100%;
        }
        .markdown-body [class^='parsneshan-']:not(.parsneshan-poem):not(.parsneshan-verse):not(.parsneshan-hemistich) {
          border-inline-start: 3px solid var(--pey-color-accent);
          border-radius: var(--pey-radius-md);
          background-color: var(--pey-color-surface);
          padding: var(--pey-space-3) var(--pey-space-4);
          margin-block: var(--pey-space-4);
        }
        .markdown-body .parsneshan-caution { border-inline-start-color: var(--pey-color-status-error); }
        .markdown-body .parsneshan-warning { border-inline-start-color: #d97706; }
        .markdown-body .parsneshan-important { border-inline-start-color: var(--pey-color-accent); }
        .markdown-body .parsneshan-tip { border-inline-start-color: #059669; }
        .markdown-body .parsneshan-note { border-inline-start-color: var(--pey-color-text-muted); }
        .markdown-body .parsneshan-poem {
          margin-block: var(--pey-space-6);
          padding: var(--pey-space-4) var(--pey-space-6);
          background-color: var(--pey-color-surface);
          border-radius: var(--pey-radius-md);
          display: grid;
          gap: var(--pey-space-3);
          justify-items: center;
        }
        .markdown-body .parsneshan-verse {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--pey-space-8);
          inline-size: 100%;
          justify-items: center;
        }
        .markdown-body .parsneshan-hemistich {
          text-align: center;
        }
        @media (max-width: 37.5rem) {
          .markdown-body .parsneshan-verse {
            grid-template-columns: minmax(0, 1fr);
            gap: var(--pey-space-1);
          }
        }
        .markdown-body .footnotes {
          margin-block-start: var(--pey-space-8);
          padding-block-start: var(--pey-space-4);
          border-block-start: 1px solid var(--pey-color-border);
          font-size: var(--pey-font-size-sm);
        }
        .markdown-body .data-footnote-backref {
          text-decoration: none;
        }
        .pager {
          display: flex;
          justify-content: space-between;
          gap: var(--pey-space-4);
          margin-block-start: var(--pey-space-8);
          padding-block-start: var(--pey-space-4);
          border-block-start: 1px solid var(--pey-color-border);
        }
        .pager a {
          color: var(--pey-color-accent);
          text-decoration: none;
        }
        a {
          color: var(--pey-color-accent);
        }
        a:focus-visible {
          outline: 2px solid var(--pey-color-focus-ring);
          outline-offset: 1px;
        }
      </style>
      <div class="layout">
        ${this.#renderSidebar()}
        ${this.#renderState()}
      </div>
    `;
  }
}

customElements.define(TAG, DocsPage);

export { DocsPage, TAG };
