// Builds the table-of-contents tree for the docs page panel.

/**
 * Builds a heading tree from the rendered toc entries.
 *
 * Entries deeper than maxDepth are dropped. The tree is built with a level
 * stack: an entry becomes a child of the nearest shallower entry before it,
 * so malformed level jumps (e.g. h2 followed by h4) still produce a sane
 * tree instead of nesting errors.
 *
 * @param {Array<{id: string, level: number, text: string}>} toc Entries from getPage.
 * @param {number} [maxDepth=3] Deepest heading level included (1-based).
 * @returns {Array<{id: string, level: number, text: string, children: Array}} } Tree roots.
 */
export function buildTocTree(toc, maxDepth = 3) {
  if (!Array.isArray(toc)) {
    return [];
  }

  const depth = Number.isInteger(maxDepth) && maxDepth > 0 ? maxDepth : 3;
  const roots = [];
  // Stack of ancestors; each item is { level, children } of the last node
  // opened at that level.
  const stack = [];

  for (const entry of toc) {
    if (!entry || typeof entry.id !== 'string' || typeof entry.text !== 'string') {
      continue;
    }
    if (entry.level < 1 || entry.level > depth) {
      continue;
    }

    const node = { id: entry.id, level: entry.level, text: entry.text, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].level >= entry.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }

  return roots;
}

/**
 * Collects the ids on the active branch (the entry itself plus its ancestors).
 *
 * @param {Array} tree Tree roots from buildTocTree.
 * @param {string} id Active heading id.
 * @returns {Set<string>} Ids to mark open/active, empty when the id is absent.
 */
export function activeBranchIds(tree, id) {
  const result = new Set();

  function walk(nodes) {
    for (const node of nodes) {
      if (node.id === id || walk(node.children)) {
        result.add(node.id);
        return true;
      }
    }
    return false;
  }

  walk(tree);
  return result;
}
