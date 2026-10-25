// Fixture logic for the SVG-use spike. Runs under a target CSP policy, so it
// must be an external same-origin module (inline scripts are blocked there).
import { createIconMarkup, resolveIconSpriteUrl } from '/pkg/base/icon-sprite.js';

const results = [];
const record = (name, pass, detail) => results.push({ name, pass, detail: String(detail) });
const flush = () => {
  window.__spike = results;
  window.__spikeDone = true;
};

// Delegated clicks are asserted by the runner with a real Playwright click; the
// fixture only records whatever composed clicks reach the document.
window.__spikeClicks = [];
document.addEventListener('click', (event) => window.__spikeClicks.push(event.target.nodeName), true);

// Polls until the external sprite has been fetched and the referenced symbol
// actually paints, instead of assuming a fixed wait.
function waitFor(predicate, { timeout = 5000, interval = 50 } = {}) {
  const start = performance.now();
  return new Promise((resolve) => {
    const attempt = () => {
      if (predicate()) return resolve(true);
      if (performance.now() - start > timeout) return resolve(false);
      setTimeout(attempt, interval);
    };
    attempt();
  });
}

customElements.define('pey-icon', class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }
  connectedCallback() {
    this.render();
  }
  render() {
    const assetBase = new URL('./', location.href).href;
    const symbolId = this.dataset.icon;
    this.shadowRoot.innerHTML = createIconMarkup(assetBase, symbolId);
  }
});

window.addEventListener('load', async () => {
  try {
    // Resolution is derived from an independent asset base under a subpath
    // deployment, never from the router basePath or a hardcoded path.
    const assetBase = new URL('./', location.href).href;
    const spriteUrl = resolveIconSpriteUrl(assetBase);
    record(
      'resolve-under-subpath',
      spriteUrl === new URL('./icons.svg', assetBase).href && assetBase.includes('/assets/'),
      spriteUrl,
    );

    const host = document.querySelector('pey-icon');
    const svg = host.shadowRoot.querySelector('svg');
    const use = host.shadowRoot.querySelector('use');
    record('markup-svg-aria-hidden', svg.getAttribute('aria-hidden') === 'true', svg.outerHTML);
    record('markup-svg-focusable-false', svg.getAttribute('focusable') === 'false', svg.outerHTML);
    record('use-href-ends-with-symbol', use.getAttribute('href').endsWith('#arrow'), use.getAttribute('href'));
    record('use-owner-is-shadow-root', use.getRootNode() === host.shadowRoot, use.getRootNode().nodeName);

    // Wait for the external sprite to be fetched and painted inside the open
    // Shadow DOM (polled, not a fixed delay), then confirm the symbol geometry.
    const rendered = await waitFor(() => {
      const box = use.getBBox();
      return Boolean(box) && (box.width > 0 || box.height > 0);
    });
    record('external-use-renders-in-shadow-dom', rendered, JSON.stringify(use.getBBox() ?? null));

    // A meaningful icon pairs the markup with a label on the control; the
    // decorative svg itself must not carry a role or name.
    record('decorative-svg-no-role', svg.getAttribute('role') === null, svg.outerHTML);
  } catch (error) {
    record('spike-exception', false, error.message);
  }
  flush();
});
