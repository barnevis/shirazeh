// Post-processing for rendered markdown content in the docs page.
// Display-only enhancements live here (the architecture keeps product
// decisions in the shirazeh.docs plugin); each function mutates the given
// root element in place and is covered by jsdom tests.

const HEADING_SELECTOR = 'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]';

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
