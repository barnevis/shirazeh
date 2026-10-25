// Fixture logic for the first-paint measurement of the CSS-attach spike: the
// page carries no other content, so first contentful paint happens exactly when
// the styled box first paints. The runner loads the page once per method
// (?method=link|style) and exposes raw timestamps; the numbers are findings,
// not assertions. See docs/decisions.md#css-attach-method.
import { attachStyleSheet } from '/pkg/base/attach-style-sheet.js';

const method = new URLSearchParams(location.search).get('method') ?? 'link';

let paintAt = null;
let styleAppliedAt = null;

const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.name === 'first-contentful-paint' && paintAt === null) paintAt = entry.startTime;
  }
});
observer.observe({ type: 'paint', buffered: true });

function attachLinkMethod(root, href) {
  const linkEl = document.createElement('link');
  linkEl.rel = 'stylesheet';
  linkEl.href = href;
  linkEl.addEventListener('load', () => {
    if (styleAppliedAt === null) styleAppliedAt = performance.now();
  });
  root.innerHTML = '<div id="box">styled</div>';
  root.appendChild(linkEl);
}

async function attachStyleMethod(root, href) {
  await attachStyleSheet(root, href);
  if (styleAppliedAt === null) styleAppliedAt = performance.now();
  const box = document.createElement('div');
  box.id = 'box';
  box.textContent = 'styled';
  root.appendChild(box);
}

class PeyStyled extends HTMLElement {
  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const cssUrl = new URL('./component.css', location.href).href;
    if (method === 'link') {
      attachLinkMethod(this.shadowRoot, cssUrl);
    } else {
      attachStyleMethod(this.shadowRoot, cssUrl).catch((error) => {
        window.__spikeFlash = { method, paintAt, styleAppliedAt, flash: null, error: error.message };
        window.__spikeDone = true;
      });
    }
  }
}
customElements.define('pey-styled', PeyStyled);

document.body.append(document.createElement('pey-styled'));

const start = performance.now();
const tick = () => {
  const elapsed = performance.now() - start;
  if (method === 'link' && styleAppliedAt !== null && (paintAt !== null || elapsed > 5000)) {
    window.__spikeFlash = { method, paintAt, styleAppliedAt, flash: paintAt !== null ? paintAt < styleAppliedAt : null };
    window.__spikeDone = true;
    return;
  }
  if (method === 'style' && paintAt !== null && styleAppliedAt !== null) {
    window.__spikeFlash = { method, paintAt, styleAppliedAt, flash: paintAt < styleAppliedAt };
    window.__spikeDone = true;
    return;
  }
  if (elapsed > 5000) {
    window.__spikeFlash = {
      method,
      paintAt,
      styleAppliedAt,
      flash: paintAt !== null && styleAppliedAt !== null && paintAt < styleAppliedAt,
      timeout: true,
    };
    window.__spikeDone = true;
    return;
  }
  setTimeout(tick, 20);
};
tick();
