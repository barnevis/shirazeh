// Documentation page: orchestrates loading a route's page from the docs
// service, mounting the sidebar and TOC components, running display
// enhancements, and forwarding navigation. Tree/panel internals live in
// their own components; display enhancements in enhance-content.js.

import { PeyElement } from 'pey.webui/base/pey-element';
import { addCodeCopyButtons, addHeadingAnchors, applyImageSizes, wrapTables } from './enhance-content.js';
import { TAG as SIDEBAR_TAG } from '../../components/shirazeh-sidebar.js';
import { TAG as TOC_TAG } from '../../components/shirazeh-toc.js';

const TAG = 'app-page-docs';
const DOCS_SERVICE = 'shirazeh.docs.service';
const PARAM_KEYS = ['page', 'sub1', 'sub2', 'sub3', 'sub4'];
const TOC_MIN_HEADINGS = 2;
const CONTENT_STYLESHEET = new URL('../../styles/content.css', import.meta.url).href;

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
  #sidebar = null;
  #toastTimer = null;

  onConnect(refs) {
    this.#docsService = refs.services?.[DOCS_SERVICE] ?? null;
    this.#router = refs.router ?? null;
    this.#t = typeof refs.t === 'function' ? refs.t : (key) => key;
    this.#config = refs.config ?? {};
    this.#events = refs.events ?? null;
    this.#path = routePathFromParams(refs.routeParams);
    this.#anchorTarget = typeof refs.routeQuery?.a === 'string' ? refs.routeQuery.a : null;
  }

  #path = '/';
  #anchorTarget = null;
  #events = null;

  connectedCallback() {
    super.connectedCallback();
    this.#loadPage();
  }

  disconnectedCallback() {
    clearTimeout(this.#toastTimer);
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
    this.#sidebar = sidebar !== null && Array.isArray(sidebar?.tree) ? sidebar : null;
    this.requestRender({ preserve: false });
    // The base class flushes the render in a microtask; queueMicrotask is
    // FIFO, so this post-render step runs against the freshly rendered DOM.
    queueMicrotask(() => this.#afterRender());
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

  // Runs after each render flush: wires the sidebar/TOC components, applies
  // the display enhancements, and consumes a pending deep-link anchor.
  #afterRender() {
    this.#mountComponents();
    const content = this.shadowRoot?.querySelector('.markdown-body');
    if (content !== null && content !== undefined) {
      wrapTables(content);
      addHeadingAnchors(content, { path: this.#path });
      addCodeCopyButtons(content, { label: this.#t('shirazeh.code-copy.copy') });
      applyImageSizes(content);
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

  #mountComponents() {
    const sidebarSlot = this.shadowRoot?.querySelector('[data-sidebar-slot]');
    if (sidebarSlot !== null && sidebarSlot !== undefined) {
      sidebarSlot.replaceChildren();
      if (this.#sidebar !== null) {
        const sidebar = document.createElement(SIDEBAR_TAG);
        sidebar.connect({
          infrastructure: { events: this.#eventsFacade() },
          refs: {
            tree: this.#sidebar.tree,
            path: this.#path,
            router: this.#router,
            openLabel: this.#t('shirazeh.sidebar.open'),
          },
        });
        sidebarSlot.append(sidebar);
      }
    }

    const tocSlot = this.shadowRoot?.querySelector('[data-toc-slot]');
    if (tocSlot !== null && tocSlot !== undefined) {
      tocSlot.replaceChildren();
      const page = this.#state.status === 'ready' ? this.#state.page : null;
      const tocConfig = this.#config.toc ?? {};
      const content = this.shadowRoot?.querySelector('.markdown-body');
      if (this.#tocEnabled() && page !== null && Array.isArray(page.toc) && page.toc.length >= TOC_MIN_HEADINGS && content) {
        const toc = document.createElement(TOC_TAG);
        toc.connect({
          infrastructure: { events: this.#eventsFacade() },
          refs: {
            toc: page.toc,
            path: this.#path,
            maxDepth: tocConfig.maxDepth,
            title: this.#t('shirazeh.toc.title'),
            contentRoot: content,
          },
        });
        tocSlot.append(toc);
      }
    }
  }

  // The real Event Bus facade flows through page refs, so the child
  // components' contained errors still reach ui:component-error.
  #eventsFacade() {
    return this.#events ?? {
      publish: () => ({ success: true }),
      subscribe: () => () => {},
    };
  }

  #tocEnabled() {
    return this.#config.toc?.enabled !== false;
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

    const anchor = target.closest('a');
    if (anchor === null || anchor.closest('aside') !== null || anchor.closest('.toc-panel') !== null) {
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
    `;
  }

  // The content stylesheet loads through PeyElement's stylesheet runtime so
  // prose/enhancement styles stay out of this file.
  stylesheetHref() {
    return CONTENT_STYLESHEET;
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
          [data-sidebar-slot] {
            border-block-end: 1px solid var(--pey-color-border);
            padding-block-end: var(--pey-space-4);
          }
        }
        .content {
          min-inline-size: 0;
        }
        .content.loading {
          color: var(--pey-color-text-muted);
          padding-block: var(--pey-space-8);
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
        <div data-sidebar-slot></div>
        ${this.#renderState()}
      </div>
      <div data-toc-slot></div>
    `;
  }
}

customElements.define(TAG, DocsPage);

export { DocsPage, TAG };
