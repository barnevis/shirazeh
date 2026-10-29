// Parses the Shirazeh navbar.md format into three link zones.
//
// Syntax (docsify-like):
//   `{.position: left|center|right}` switches the target zone (default right).
//   Markdown list items define links; 2-space indentation nests a submenu.
//   `---` renders a divider; `[label](href)` is a link; trailing `{.cta}`
//   styles a call-to-action; `{.badge:Text}` adds a pill badge; plain text
//   items render as non-link labels. Comments (`<!-- -->`) are ignored.

const ZONES = ['left', 'center', 'right'];
const POSITION_PATTERN = /^\s*\{\.position:\s*(left|center|right)\s*\}\s*$/;
const LIST_ITEM_PATTERN = /^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/;
const LINK_PATTERN = /^\[([^\]]*)\]\(([^)\s]+)\)(.*)$/;
const CTA_PATTERN = /\{\.cta\}/;
const BADGE_PATTERN = /\{\.badge:([^}]*)\}/;
const DIVIDER_PATTERN = /^-{3,}\s*$/;

/**
 * Parses navbar markdown into the three-zone structure.
 *
 * @param {string} navbarMarkdown Raw navbar.md content.
 * @returns {{zones: {left: NavbarItem[], center: NavbarItem[], right: NavbarItem[]}}}
 * @throws {object} Standard NAVBAR_PARSE_FAILED error when the input is not text.
 */
export function parseNavbar(navbarMarkdown) {
  if (typeof navbarMarkdown !== 'string') {
    throw createParseError('The navbar file is not valid text');
  }

  const zones = { left: [], center: [], right: [] };
  let currentZone = 'right';

  for (const rawLine of navbarMarkdown.split('\n')) {
    const line = stripComments(rawLine);
    if (line.trim().length === 0) {
      continue;
    }

    const position = POSITION_PATTERN.exec(line);
    if (position !== null) {
      currentZone = position[1];
      continue;
    }

    if (DIVIDER_PATTERN.test(line)) {
      zones[currentZone].push({ type: 'divider', children: [] });
      continue;
    }

    const listItem = LIST_ITEM_PATTERN.exec(line);
    if (listItem === null) {
      continue;
    }

    const indent = listItem[1].length;
    const item = parseItem(listItem[2].trim());
    if (item === null) {
      continue;
    }

    if (indent === 0 || zones[currentZone].length === 0) {
      item.level = indent === 0 ? 1 : 2;
      zones[currentZone].push(item);
    } else {
      // Indented items nest under the last top-level item of the zone.
      item.level = 2;
      const parent = zones[currentZone][zones[currentZone].length - 1];
      parent.children.push(item);
    }
  }

  return { zones };
}

function parseItem(content) {
  if (content.length === 0) {
    return null;
  }

  const isCta = CTA_PATTERN.test(content);
  const badge = BADGE_PATTERN.exec(content);
  const cleaned = content.replace(CTA_PATTERN, '').replace(BADGE_PATTERN, '').trim();

  const link = LINK_PATTERN.exec(cleaned);
  if (link !== null) {
    return {
      type: 'link',
      label: link[1].trim(),
      href: link[2].trim(),
      cta: isCta,
      badge: badge !== null && badge[1].length > 0 ? badge[1].trim() : null,
      children: [],
    };
  }

  // A plain-text item only makes sense as a submenu parent; top-level plain
  // text with no link is dropped (nothing to render or navigate).
  if (cleaned.startsWith('[') || cleaned.length === 0) {
    return null;
  }
  return {
    type: 'text',
    label: cleaned,
    href: null,
    cta: false,
    badge: badge !== null && badge[1].length > 0 ? badge[1].trim() : null,
    children: [],
  };
}

function stripComments(line) {
  return line.replace(/<!--[\s\S]*?-->/g, '');
}

function createParseError(message) {
  return {
    code: 'NAVBAR_PARSE_FAILED',
    message,
    source: 'shirazeh.docs',
    type: 'operational',
    timestamp: new Date().toISOString(),
  };
}
