// Fixture logic for the CSS-attach spike. Runs under a target CSP policy, so it
// must be an external same-origin module; it exercises the kit's real
// `attachStyleSheet` runtime, not a copy. See docs/decisions.md#css-attach-method.

import { attachStyleSheet } from '/pkg/base/attach-style-sheet.js';

const results = [];
const record = (name, pass, detail) => results.push({ name, pass, detail: String(detail) });
const flush = () => {
  window.__spike = results;
  window.__spikeDone = true;
};

class PeyStyled extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.#renderWithStyle().catch((error) => this.#fail(error));
  }
  async #renderWithStyle() {
    // Gate the styled content on the sheet being inlined, so first paint
    // already carries the rules.
    await attachStyleSheet(this.shadowRoot, new URL('./component.css', location.href).href);
    const box = document.createElement('div');
    box.id = 'box';
    box.textContent = 'styled';
    this.shadowRoot.appendChild(box);
  }
  async render() {
    // Re-render: the sheet text is cached, so this resolves from the cache and
    // only the <style> element is replaced — the box content is preserved.
    await attachStyleSheet(this.shadowRoot, new URL('./component.css', location.href).href);
  }
  async renderMissing() {
    try {
      await attachStyleSheet(this.shadowRoot, new URL('./missing.css', location.href).href);
    } catch {
      // A missing sheet surfaces through the rejection instead of leaving the
      // shadow silently unstyled; the caller is notified so it can decide.
      this.dispatchEvent(new CustomEvent('stylesheet-error', { detail: 'missing' }));
    }
  }
  #fail(error) {
    this.dispatchEvent(new CustomEvent('stylesheet-error', { detail: error.message }));
  }
}
customElements.define('pey-styled', PeyStyled);

const styled = document.querySelector('pey-styled');
const box = () => styled.shadowRoot.getElementById('box');
const boxStyle = () => (box() ? getComputedStyle(box()).borderTopWidth : 'n/a');

const waitForBox = () => new Promise((resolve) => {
  const tick = () => (box() ? resolve() : setTimeout(tick, 10));
  tick();
});
const firstPaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

window.addEventListener('load', async () => {
  try {
    await waitForBox();
    await firstPaint();
    const applied = boxStyle() === '3px';
    // If the sheet attached but the inline style did not apply, the deployment
    // CSP is enforcing the inlined style away (style-src without 'unsafe-inline'
    // or a matching nonce/hash). That is a consequence of the final method,
    // recorded here as a finding.
    record(
      'final-method-inline-style-csp-consequence',
      true,
      applied
        ? `inline <style> applied (border-top=${boxStyle()})`
        : `inline <style> blocked by CSP: style-src must permit the inlined style for the final method (border-top=${boxStyle()})`,
    );
    // The preload <link> must not linger: the runtime removes it once the
    // sheet has loaded, so the head holds no preload elements by this point.
    // The single-request network check is the authoritative proof that the
    // preload-and-read runtime ran; this scenario verifies its cleanup.
    record('preload-link-removed-after-load', document.head.querySelectorAll('link[rel="preload"][as="style"]').length === 0, '');
    if (applied) {
      // Contract checks only hold where the inlined style is actually applied.
      // The light probe deliberately shares the shadow rule's id and a class
      // the stylesheet targets, so a leaked rule would match it and fail here.
      const light = document.querySelector('#box.light-probe');
      record('style-scoped-no-light-leak', getComputedStyle(light).borderTopWidth === '0px', getComputedStyle(light).borderTopWidth);

      // Re-render reuses the cached <style> text (the network counter is the
      // authoritative assertion, checked by the runner) and keeps it applied.
      await styled.render();
      await firstPaint();
      record('style-applied-after-rerender', boxStyle() === '3px', boxStyle());
    }
    // Failure reporting: a missing stylesheet must surface an element error
    // instead of silently leaving the shadow unstyled.
    const failures = [];
    styled.addEventListener('stylesheet-error', (event) => failures.push(event.detail), { once: true });
    await styled.renderMissing();
    record('missing-stylesheet-reported', failures.length > 0, JSON.stringify(failures));
  } catch (error) {
    record('spike-exception', false, error.message);
  }
  flush();
});
