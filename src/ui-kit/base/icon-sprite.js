// Resolves the shared SVG sprite URL and builds the <svg><use> markup contract.

const ICON_SPRITE_FILE = 'icons.svg';
const ERROR_SOURCE = 'pey.webui';
const SYMBOL_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function createError(code, message) {
  return Object.assign(new Error(message), {
    code,
    source: ERROR_SOURCE,
    type: 'operational',
  });
}

/**
 * Resolves the absolute sprite URL from a normalized assetBaseUrl directory
 * URL. `new URL(file, base)` appends the file inside the base directory, so a
 * trailing slash on assetBaseUrl keeps the `assets` segment intact. The URL is
 * derived exclusively from assetBaseUrl: never from the Router basePath, a
 * hardcoded path, or a global lookup. This is not a generic URL helper: it
 * only dials pey assets, so it rejects invalid bases with a stable code.
 * @param {string} assetBaseUrl Normalized absolute directory URL ending in `/`.
 * @returns {string} Absolute URL of the shared icon sprite.
 */
function resolveIconSpriteUrl(assetBaseUrl) {
  if (typeof assetBaseUrl !== 'string' || assetBaseUrl.trim().length === 0) {
    throw createError(
      'PEY_ICON_SPRITE_URL_INVALID',
      'Asset base URL must be a non-empty string',
    );
  }
  try {
    return new URL(ICON_SPRITE_FILE, assetBaseUrl).href;
  } catch {
    throw createError(
      'PEY_ICON_SPRITE_URL_INVALID',
      'Asset base URL must be a valid URL',
    );
  }
}

/**
 * Builds the shared markup contract for referencing one sprite symbol inside
 * any component, including inside Shadow DOM:
 * `<svg aria-hidden="true" focusable="false"><use href=".../icons.svg#id"></use></svg>`.
 * Decorative icons carry no label; a meaningful icon must pair this markup with
 * an accessible label on the control or host element.
 * @param {string} assetBaseUrl Normalized absolute directory URL ending in `/`.
 * @param {string} symbolId Strict lowercase kebab-case symbol identifier: starts
 *   with a letter, then lowercase letters/digits, with single hyphens between
 *   segments (no leading, trailing, doubled, or empty hyphens). This is the
 *   safe subset of SVG ids and the only shape that can reach the markup URL.
 * @returns {string} The complete `<svg><use>` markup string.
 */
function createIconMarkup(assetBaseUrl, symbolId) {
  if (typeof symbolId !== 'string' || !SYMBOL_ID_PATTERN.test(symbolId)) {
    throw createError(
      'PEY_ICON_SYMBOL_INVALID',
      'Icon symbol id must be strict lowercase kebab-case',
    );
  }
  const spriteUrl = resolveIconSpriteUrl(assetBaseUrl);
  return `<svg aria-hidden="true" focusable="false"><use href="${spriteUrl}#${symbolId}"></use></svg>`;
}

export { createIconMarkup, resolveIconSpriteUrl };