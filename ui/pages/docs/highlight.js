// Code syntax highlighting for the docs page, backed by the vendored
// Highlight.js bundle (vendor/highlight/, loaded as a classic script). Adds
// the old Shirazeh's fence syntax: ```lang:filename{1-3,5} — language label,
// file name, per-line highlighting ranges, and CSS-counter line numbers.
// Theme CSS text is fetched from the vendored themes and applied inside the
// page's shadow root (external stylesheets in the main document cannot
// penetrate Shadow DOM).

const FENCE_PATTERN = /language-([^:{}\s]+)(?::([^:{}\s]+))?(?:\{([\d,\s-]+)\})?/;
const HIGHLIGHT_BASE = new URL('../../../vendor/highlight/', import.meta.url);
const THEMES = { light: 'github-light.min.css', dark: 'github-dark.min.css' };

let scriptPromise = null;
const themeTextCache = new Map();

/**
 * Parses a code element's fence info string.
 *
 * @param {Element} code The code element carrying `language-...` classes.
 * @returns {{language: string, fileName: string|null, ranges: Array<[number, number]>}}
 */
export function parseFenceInfo(code) {
  const match = FENCE_PATTERN.exec(code.className);
  if (match === null) {
    return { language: null, fileName: null, ranges: [] };
  }

  const ranges = [];
  if (typeof match[3] === 'string' && match[3].trim().length > 0) {
    for (const part of match[3].split(',')) {
      const trimmed = part.trim();
      if (trimmed.includes('-')) {
        const [start, end] = trimmed.split('-').map((value) => Number.parseInt(value, 10));
        if (Number.isInteger(start) && Number.isInteger(end)) {
          ranges.push([start, end]);
        }
      } else {
        const line = Number.parseInt(trimmed, 10);
        if (Number.isInteger(line)) {
          ranges.push([line, line]);
        }
      }
    }
  }

  return { language: match[1] ?? null, fileName: match[2] ?? null, ranges };
}

function injectStylesheetLink(ownerDocument, href, id, disabled) {
  const existing = ownerDocument.getElementById(id);
  if (existing !== null) {
    existing.disabled = disabled;
    return;
  }
  const link = ownerDocument.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  link.disabled = disabled;
  ownerDocument.head.append(link);
}

function injectHighlightScript(ownerDocument) {
  if (scriptPromise !== null) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const script = ownerDocument.createElement('script');
    script.src = new URL('highlight.min.js', HIGHLIGHT_BASE).href;
    script.onload = () => resolve(ownerDocument.defaultView?.hljs ?? null);
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error('highlight.js bundle could not be loaded'));
    };
    ownerDocument.head.append(script);
  });
  return scriptPromise;
}

/**
 * Loads the vendored bundle and theme link elements (once per document).
 *
 * @param {object} options Options.
 * @param {Document} options.ownerDocument Main document to inject into.
 * @param {'light'|'dark'} options.theme Initially active theme.
 * @returns {Promise<unknown>} The global hljs object.
 */
export async function ensureHighlightJs({ ownerDocument, theme }) {
  injectStylesheetLink(ownerDocument, new URL(THEMES.light, HIGHLIGHT_BASE).href, 'shirazeh-hljs-light', theme !== 'light');
  injectStylesheetLink(ownerDocument, new URL(THEMES.dark, HIGHLIGHT_BASE).href, 'shirazeh-hljs-dark', theme !== 'dark');
  return injectHighlightScript(ownerDocument);
}

/**
 * Flips the active theme stylesheet (called on theme changes).
 *
 * @param {Document} ownerDocument Main document holding the theme links.
 * @param {'light'|'dark'} theme Theme to activate.
 */
export function setHighlightTheme(ownerDocument, theme) {
  const light = ownerDocument.getElementById('shirazeh-hljs-light');
  const dark = ownerDocument.getElementById('shirazeh-hljs-dark');
  if (light !== null) light.disabled = theme !== 'light';
  if (dark !== null) dark.disabled = theme !== 'dark';
}

/**
 * Splits highlighted code into line spans, marking requested ranges, so CSS
 * counters can number lines. Empty lines get a zero-width space to keep
 * their height.
 *
 * @param {Element} code Highlighted code element (innerHTML consumed).
 * @param {Array<[number, number]>} ranges 1-based inclusive line ranges.
 */
function splitIntoLines(code, ranges) {
  const isHighlighted = (line) => ranges.some(([start, end]) => line >= start && line <= end);
  const lines = code.innerHTML.split('\n');
  code.innerHTML = lines
    .map((line, index) => {
      const content = line.length === 0 ? '&#8203;' : line;
      const highlighted = isHighlighted(index + 1) ? ' hljs-line-highlight' : '';
      return `<span class="hljs-line${highlighted}">${content}</span>`;
    })
    .join('');
}

async function themeStyleText(theme) {
  if (!themeTextCache.has(theme)) {
    const response = await fetch(new URL(THEMES[theme], HIGHLIGHT_BASE).href);
    if (!response.ok) {
      throw new Error(`highlight theme could not be loaded: ${theme}`);
    }
    themeTextCache.set(theme, await response.text());
  }
  return themeTextCache.get(theme);
}

/**
 * Applies the current theme's CSS text inside the given shadow root so
 * highlight colors cross the Shadow DOM boundary.
 *
 * @param {ShadowRoot} shadowRoot Page shadow root.
 * @param {'light'|'dark'} theme Active theme.
 * @returns {Promise<void>}
 */
export async function applyThemeInRoot(shadowRoot, theme) {
  if (!shadowRoot) {
    return;
  }
  const text = await themeStyleText(theme);
  const existing = shadowRoot.querySelector('style[data-hljs-theme]');
  if (existing !== null) {
    existing.textContent = text;
    return;
  }
  const style = shadowRoot.ownerDocument.createElement('style');
  style.setAttribute('data-hljs-theme', theme);
  style.textContent = text;
  shadowRoot.append(style);
}

/**
 * Highlights every code block under the content root and decorates it with
 * the fence-syntax label, line spans, and range marks.
 *
 * @param {object} options Options.
 * @param {Element} options.contentRoot Rendered markdown root.
 * @param {unknown} options.hljs The Highlight.js global (window.hljs).
 * @returns {number} Number of blocks highlighted.
 */
export function highlightCodeBlocks({ contentRoot, hljs }) {
  if (!contentRoot || typeof contentRoot.querySelectorAll !== 'function' || !hljs) {
    return 0;
  }

  let highlighted = 0;
  for (const code of [...contentRoot.querySelectorAll('pre > code')]) {
    const { language, fileName, ranges } = parseFenceInfo(code);

    // The raw fence class carries the whole info string
    // (language-js:app.js{1-3}); replace it with the clean language class so
    // highlight.js gets a valid hint.
    if (language !== null) {
      for (const cls of [...code.classList]) {
        if (cls.startsWith('language-')) {
          code.classList.remove(cls);
        }
      }
      code.classList.add(`language-${language}`);
    }

    if (typeof hljs.highlightElement === 'function' && language !== null && hljs.getLanguage?.(language)) {
      hljs.highlightElement(code);
    }

    if (language !== null || ranges.length > 0) {
      const ownerDocument = code.ownerDocument;
      const label = ownerDocument.createElement('div');
      label.className = 'hljs-language-label';
      label.textContent = fileName !== null ? `${language ?? ''}: ${fileName}` : (language ?? '');
      code.closest('pre')?.append(label);
    }

    if (ranges.length > 0) {
      splitIntoLines(code, ranges);
    }

    highlighted += 1;
  }

  return highlighted;
}
