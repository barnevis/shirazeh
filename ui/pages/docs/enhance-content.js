// Post-processing for rendered markdown content in the docs page.
// Display-only enhancements live here (the architecture keeps product
// decisions in the shirazeh.docs plugin); each function mutates the given
// root element in place and is covered by jsdom tests.

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
