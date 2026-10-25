// Post-processing for rendered markdown content in the docs page.
// Display-only enhancements live here (the architecture keeps product
// decisions in the shirazeh.docs plugin); each function mutates the given
// root element in place and is covered by jsdom tests.

const HEADING_SELECTOR = 'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]';
const IMAGE_SIZE_PATTERN = /^\{\s*([0-9۰-۹]*)(?:\s*[x×]\s*([0-9۰-۹]*))?\s*\}$/;
const PERSIAN_DIGITS = /[۰-۹]/g;
const PERSIAN_TO_ASCII = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };

function toAsciiDigits(value) {
  return value.replaceAll(PERSIAN_DIGITS, (digit) => PERSIAN_TO_ASCII[digit]);
}

function parsePixelSize(value) {
  if (value.length === 0) {
    return null;
  }
  const size = Number.parseInt(toAsciiDigits(value), 10);
  return Number.isFinite(size) && size > 0 ? `${size}px` : null;
}

/**
 * Applies `![alt](src){WxH}` sizes to images.
 *
 * The size suffix survives markdown parsing as a `{...}` text node after
 * the image. Forms: `{300}` (square), `{300x200}`, `{300x}`, `{x200}` —
 * Persian digits (and ×) accepted; the consumed text node is removed.
 *
 * @param {Element} root Rendered content root.
 * @returns {number} Number of images resized.
 */
export function applyImageSizes(root) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return 0;
  }

  let resized = 0;
  for (const image of [...root.querySelectorAll('img')]) {
    const sibling = image.nextSibling;
    if (sibling === null || sibling.nodeType !== 3) {
      continue;
    }

    const match = IMAGE_SIZE_PATTERN.exec(sibling.textContent.trim());
    if (match === null) {
      continue;
    }

    const width = parsePixelSize(match[1] ?? '');
    const height = match[2] === undefined ? width : parsePixelSize(match[2]);
    if (width !== null) {
      image.style.width = width;
    }
    if (height !== null) {
      image.style.height = height;
    }

    sibling.remove();
    resized += 1;
  }

  return resized;
}

/**
 * Appends a hover anchor link to every heading that carries an id.
 *
 * The link's href is the router-owned deep-link form `#<path>?a=<id>` — the
 * hash router owns the fragment, so heading anchors travel as a query
 * parameter. Clicking is intercepted by the page (copy + toast) instead of
 * navigating.
 *
 * @param {Element} root Rendered content root.
 * @param {object} options Options.
 * @param {string} options.path Current route path, e.g. '/guide'.
 * @returns {number} Number of headings that received an anchor.
 */
export function addHeadingAnchors(root, { path } = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return 0;
  }

  const headings = [...root.querySelectorAll(HEADING_SELECTOR)];
  let anchored = 0;

  for (const heading of headings) {
    if (heading.querySelector('.heading-anchor') !== null) {
      continue;
    }

    const anchor = heading.ownerDocument.createElement('a');
    anchor.className = 'heading-anchor';
    anchor.href = `#${path ?? '/'}?a=${encodeURIComponent(heading.id)}`;
    anchor.setAttribute('aria-label', heading.textContent ?? '');
    anchor.textContent = '#';
    heading.append(anchor);
    anchored += 1;
  }

  return anchored;
}

/**
 * Appends a copy button to every code block of the root.
 *
 * The button carries no state: clicking is handled by the page, which reads
 * the sibling code text, copies it, and swaps the label briefly.
 *
 * @param {Element} root Rendered content root.
 * @param {object} options Options.
 * @param {string} options.label Visible button label (translated).
 * @returns {number} Number of buttons added.
 */
export function addCodeCopyButtons(root, { label } = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return 0;
  }

  const blocks = [...root.querySelectorAll('pre')];
  let added = 0;

  for (const block of blocks) {
    if (block.querySelector('.copy-code-button') !== null) {
      continue;
    }

    const button = block.ownerDocument.createElement('button');
    button.type = 'button';
    button.className = 'copy-code-button';
    button.textContent = label ?? '';
    block.append(button);
    added += 1;
  }

  return added;
}

/**
 * Wraps direct tables of the root in a horizontally scrollable container.
 *
 * Wide tables stay readable on narrow screens instead of overflowing the
 * page; the wrapper uses logical properties so RTL and RTL-adjacent layout
 * both behave.
 *
 * @param {Element} root Rendered content root.
 * @returns {number} Number of wrapped tables.
 */
export function wrapTables(root) {
  if (!root || typeof root.querySelectorAll !== 'function') {
    return 0;
  }

  const tables = [...root.querySelectorAll('table')];
  let wrapped = 0;

  for (const table of tables) {
    const parent = table.parentElement;
    if (parent === null || parent.classList.contains('table-wrapper')) {
      continue;
    }

    const wrapper = table.ownerDocument.createElement('div');
    wrapper.className = 'table-wrapper';
    table.replaceWith(wrapper);
    wrapper.append(table);
    wrapped += 1;
  }

  return wrapped;
}
