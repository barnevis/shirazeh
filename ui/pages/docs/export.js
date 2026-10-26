// Page export for the docs page: self-contained HTML and raw markdown.
// Markdown comes from the docs service (getRawMarkdown); the standalone
// HTML wraps the rendered page html with the content stylesheet and embeds
// same-origin images as data URLs. Downloads go through Blob URLs.

const CONTENT_STYLESHEET = new URL('../../styles/content.css', import.meta.url).href;
const HLJS_THEMES = {
  light: new URL('../../../vendor/highlight/github-light.min.css', import.meta.url).href,
  dark: new URL('../../../vendor/highlight/github-dark.min.css', import.meta.url).href,
};

/**
 * Builds the export file name from the page title, sanitizing characters
 * that file systems refuse.
 *
 * @param {object} options Options.
 * @param {string} options.documentTitle Page title ('' allowed).
 * @param {string} options.appName Application name.
 * @returns {string} Safe base file name.
 */
export function buildExportFileName({ documentTitle, appName }) {
  const raw = `${documentTitle || appName} - ${appName}`;
  return raw.replace(/[\\/:*?<>|]/g, '-');
}

/**
 * Triggers a client-side download.
 *
 * @param {object} options Options.
 * @param {string} options.fileName Base name without extension.
 * @param {string} options.extension Extension without dot ('html'|'md').
 * @param {string} options.text File content.
 * @param {Document} [options.ownerDocument] Document to create the anchor in.
 */
export function downloadText({ fileName, extension, text, ownerDocument = document }) {
  const blob = new Blob([text], { type: extension === 'md' ? 'text/markdown;charset=utf-8' : 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = ownerDocument.createElement('a');
  anchor.href = url;
  anchor.download = `${fileName}.${extension}`;
  ownerDocument.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Embeds same-origin images of the content as data URLs so the exported
 * HTML stays self-contained. External (absolute) images keep their URLs.
 *
 * @param {Element} container Element whose images are rewritten in place.
 * @returns {Promise<number>} Number of images embedded.
 */
export async function embedImages(container) {
  if (!container) {
    return 0;
  }

  let embedded = 0;
  for (const image of [...container.querySelectorAll('img')]) {
    const src = image.getAttribute('src') ?? '';
    if (src === '' || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//') || src.startsWith('data:')) {
      continue;
    }

    try {
      const response = await fetch(src);
      if (!response.ok) {
        continue;
      }
      const blob = await response.blob();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      image.setAttribute('src', dataUrl);
      embedded += 1;
    } catch {
      // An unreadable image keeps its relative URL in the export.
    }
  }

  return embedded;
}

/**
 * Builds a standalone HTML document for one page.
 *
 * @param {object} options Options.
 * @param {string} options.pageHtml Rendered page html (from getPage).
 * @param {string} options.documentTitle Page title.
 * @param {string} options.appName Application name.
 * @param {'light'|'dark'} options.theme Theme for the exported look.
 * @param {string} options.contentCss Content stylesheet text.
 * @param {string} options.hljsCss Highlight theme CSS text ('' to skip).
 * @param {string} options.fontCssUrl Vazirmatn font-face stylesheet URL (CDN).
 * @param {Document} [options.ownerDocument] Document used for parsing.
 * @returns {Promise<string>} The standalone HTML document text.
 */
export async function buildStandaloneHtml({
  pageHtml,
  documentTitle,
  appName,
  theme,
  contentCss,
  hljsCss = '',
  fontCssUrl = 'https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css',
  ownerDocument = document,
}) {
  const container = ownerDocument.createElement('div');
  container.innerHTML = pageHtml;
  await embedImages(container);

  const hljsBlock = hljsCss.length > 0 ? `<style>${hljsCss}</style>` : '';
  return `<!doctype html>
<html lang="fa" dir="rtl" data-theme="${theme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeText(documentTitle || appName)} | ${escapeText(appName)}</title>
  <link rel="stylesheet" href="${fontCssUrl}">
  <style>${contentCss}</style>
  ${hljsBlock}
</head>
<body>
<main class="content markdown-body">${container.innerHTML}</main>
</body>
</html>
`;
}

function escapeText(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Resolves the stylesheet texts the export needs.
 *
 * @param {object} options Options.
 * @param {string} options.contentCssHref Absolute URL of content.css.
 * @param {'light'|'dark'} options.theme Active theme.
 * @param {boolean} options.withHljsTheme Whether code highlighting ran.
 * @returns {Promise<{contentCss: string, hljsCss: string}>}
 */
export async function fetchExportStyles({ contentCssHref, theme, withHljsTheme }) {
  const contentCss = await (await fetch(contentCssHref)).text();
  let hljsCss = '';
  if (withHljsTheme) {
    hljsCss = await (await fetch(HLJS_THEMES[theme])).text();
  }
  return { contentCss, hljsCss };
}
