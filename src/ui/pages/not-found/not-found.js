// Not-found page shown when the router falls back to notFoundPath.

import { PeyElement } from 'pey.webui/base/pey-element';

const TAG = 'app-page-not-found';

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

class NotFoundPage extends PeyElement {
  #t = null;
  #router = null;

  onConnect(refs) {
    this.#t = typeof refs.t === 'function' ? refs.t : (key) => key;
    this.#router = refs.router ?? null;
  }

  eventTypes() {
    return ['click'];
  }

  handleEvent(event) {
    const target = event.target;
    if (!(target instanceof Element) || target.closest('a[data-home]') === null) {
      return;
    }

    event.preventDefault();
    if (this.#router && typeof this.#router.navigate === 'function') {
      this.#router.navigate('/');
    }
  }

  render() {
    const t = this.#t;

    return `
      <style>
        :host {
          display: block;
        }
        .missing {
          inline-size: min(100% - 2rem, 40rem);
          margin-inline: auto;
          padding-block: var(--pey-space-8);
          text-align: center;
        }
        .missing h1 {
          font-size: var(--pey-font-size-lg);
        }
        a {
          color: var(--pey-color-accent);
        }
      </style>
      <div class="missing">
        <h1>${escapeHtml(t('shirazeh.page.not-found-title'))}</h1>
        <p>${escapeHtml(t('shirazeh.page.not-found-body'))}</p>
        <p><a href="#/" data-home>${escapeHtml(t('shirazeh.page.go-home'))}</a></p>
      </div>
    `;
  }
}

customElements.define(TAG, NotFoundPage);

export { NotFoundPage, TAG };
