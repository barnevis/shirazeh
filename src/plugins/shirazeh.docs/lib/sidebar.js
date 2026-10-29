// Parses sidebar markdown and resolves documentation paths.

import { ERROR_CODES } from './constants.js';
import { createDocsError } from './error.js';

const LIST_ITEM_PATTERN = /^\s*(?:[-*+]|\d+\.)\s+(.*)$/;
const MARKDOWN_LINK_PATTERN = /^\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)(.*)$/;

/**
 * Parses a docsify-style sidebar markdown into a flat link list.
 *
 * Each markdown list item that contains a link becomes one entry. Indentation
 * depth (2 spaces per level) maps to `level`, starting at 1.
 *
 * @param {string} sidebarMarkdown Raw sidebar markdown.
 * @returns {{links: Array<{href: string, title: string, level: number}>}} Parsed links.
 * @throws {object} Standard SIDEBAR_PARSE_FAILED error when no link is found.
 */
export function parseSidebar(sidebarMarkdown) {
  if (typeof sidebarMarkdown !== 'string') {
    throw createDocsError(ERROR_CODES.SIDEBAR_PARSE_FAILED, 'The sidebar file is not valid text');
  }

  const links = [];
  for (const line of sidebarMarkdown.split('\n')) {
    const listItemMatch = LIST_ITEM_PATTERN.exec(line);
    if (listItemMatch === null) {
      continue;
    }

    const linkMatch = MARKDOWN_LINK_PATTERN.exec(listItemMatch[1].trim());
    if (linkMatch === null) {
      continue;
    }

    const indent = line.match(/^\s*/)[0].length;
    const attrTitle = typeof linkMatch[3] === 'string' && linkMatch[3].trim().length > 0
      ? linkMatch[3].trim()
      : null;
    links.push({
      href: linkMatch[2],
      title: linkMatch[1].trim(),
      attrTitle,
      level: Math.max(1, Math.floor(indent / 2) + 1),
    });
  }

  if (links.length === 0) {
    throw createDocsError(ERROR_CODES.SIDEBAR_PARSE_FAILED, 'The sidebar file contains no links');
  }

  return { links };
}

/**
 * Validates a documentation route path.
 *
 * @param {string} path Route path such as '/' or '/guide/setup'.
 * @returns {string} Validated path.
 * @throws {object} Standard DOC_PATH_INVALID error.
 */
export function validatePath(path) {
  if (typeof path !== 'string' || path.length === 0 || !path.startsWith('/')) {
    throw createDocsError(ERROR_CODES.PATH_INVALID, 'Page path must start with "/"');
  }

  if (path.includes('..') || path.includes('#') || path.includes('?') || path.includes('\0')) {
    throw createDocsError(ERROR_CODES.PATH_INVALID, 'Page path contains unsupported characters');
  }

  return path;
}

/**
 * Maps a route path to the markdown document URL under the docs root.
 *
 * '/' maps to the configured home page; deeper paths append '.md' to the
 * final segment.
 *
 * @param {string} path Validated route path.
 * @param {string} docsRoot Configured docs root ending without a slash.
 * @param {string} homePage Configured home page file name.
 * @returns {string} Document URL relative to the application origin.
 */
export function pathToDocumentUrl(path, docsRoot, homePage) {
  if (path === '/') {
    return `${docsRoot}/${homePage}`;
  }

  const cleanPath = path.endsWith('/') ? path.slice(0, -1) : path;
  const documentPath = /\.[a-z0-9]+$/i.test(cleanPath) ? cleanPath : `${cleanPath}.md`;
  return `${docsRoot}${documentPath}`;
}

/**
 * Extracts a page title from the first heading of rendered table-of-contents entries.
 *
 * @param {Array<{level: number, text: string}>} toc Rendered toc entries.
 * @returns {string} First h1/h2 text, or '' when no headings exist.
 */
export function titleFromToc(toc) {
  const heading = toc.find((entry) => entry.level <= 2);
  return heading ? heading.text : '';
}

/**
 * Finds previous and next sidebar neighbors for a path.
 *
 * @param {Array<{href: string}>} links Sidebar links.
 * @param {string} path Current route path.
 * @returns {{previous: object|null, next: object|null}} Neighbor links.
 */
export function neighborsForPath(links, path) {
  const index = links.findIndex((link) => normalizeHref(link.href) === path);
  if (index === -1) {
    return { previous: null, next: null };
  }

  return {
    previous: index > 0 ? links[index - 1] : null,
    next: index < links.length - 1 ? links[index + 1] : null,
  };
}

/**
 * Builds a sidebar tree from the flat level-annotated links.
 *
 * A link at level N becomes a child of the nearest preceding link at a level
 * lower than N; malformed jumps still produce a sane tree (the same stack
 * rule as the toc builder).
 *
 * @param {Array<{href: string, title: string, attrTitle: string|null, level: number}>} links Flat links.
 * @returns {Array<object>} Tree roots, each node { href, title, attrTitle, level, children }.
 */
export function buildSidebarTree(links) {
  if (!Array.isArray(links)) {
    return [];
  }

  const roots = [];
  const stack = [];

  for (const link of links) {
    if (!link || typeof link.href !== 'string') {
      continue;
    }

    const node = { ...link, children: [] };

    while (stack.length > 0 && stack[stack.length - 1].level >= link.level) {
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
 * Resolves the browser document title for a path.
 *
 * Source chain: the sidebar link's title attribute (`attrTitle`), then the
 * sidebar link's label text, then the page's first h1/h2 heading text, then
 * an empty string.
 *
 * @param {Array<{href: string, title: string, attrTitle: string|null}>} links Sidebar links.
 * @param {string} path Current route path.
 * @param {string} headingTitle First h1/h2 heading text of the rendered page ('' when none).
 * @returns {string} Document title ('' when no source produced one).
 */
export function documentTitleForPath(links, path, headingTitle) {
  const link = links.find((entry) => normalizeHref(entry.href) === path) ?? null;
  if (link !== null && link.attrTitle !== null) {
    return link.attrTitle;
  }
  if (link !== null && typeof link.title === 'string' && link.title.length > 0) {
    return link.title;
  }
  return typeof headingTitle === 'string' ? headingTitle : '';
}

/**
 * Normalizes a sidebar href to a route path.
 *
 * @param {string} href Sidebar href such as 'guide/setup', './guide/setup', or '/guide/setup'.
 * @returns {string} Route path starting with '/'.
 */
export function normalizeHref(href) {
  const withoutDot = href.startsWith('./') ? href.slice(2) : href;
  return withoutDot.startsWith('/') ? withoutDot : `/${withoutDot}`;
}
