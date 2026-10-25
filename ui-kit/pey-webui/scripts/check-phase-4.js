// Validates phase 4 exports, shell component, and asset contracts.
import { readFile } from 'node:fs/promises';

import '../tests/setup-dom.js';
import { createIconMarkup, resolveIconSpriteUrl } from '../base/icon-sprite.js';
import { PeyElement } from '../base/pey-element.js';
import { AppShell, TAG } from '../shell/app-shell.js';

const PACKAGE_URL = new URL('../package.json', import.meta.url);
const TOKENS_URL = new URL('../tokens.css', import.meta.url);
const SPRITE_URL = new URL('../assets/icons.svg', import.meta.url);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  const packageData = JSON.parse(await readFile(PACKAGE_URL, 'utf8'));
  const tokensSource = await readFile(TOKENS_URL, 'utf8');
  const spriteSource = await readFile(SPRITE_URL, 'utf8');

  for (const exportName of [
    './base/icon-sprite',
    './base/attach-style-sheet',
    './shell/app-shell',
    './tokens.css',
    './assets/icons.svg',
  ]) {
    assert(
      typeof packageData.exports[exportName] === 'string',
      `Phase 4 export is missing: ${exportName}`,
    );
  }

  assert(TAG === 'pey-app-shell', 'AppShell must use the pey-app-shell tag');
  assert(AppShell.prototype instanceof PeyElement, 'AppShell must extend PeyElement');
  assert(customElements.get(TAG) === AppShell, 'AppShell must be a defined element');

  const element = document.createElement(TAG);
  element.connect({
    infrastructure: { events: { subscribe: () => () => {}, publish: () => ({ success: true }) } },
    refs: { theme: 'dark', direction: 'rtl' },
  });
  document.body.append(element);
  await flush();
  assert(element.shadowRoot, 'AppShell must attach an open shadow root');
  assert(
    element.shadowRoot.querySelector('main[part="page"]'),
    'AppShell must render a page landmark',
  );
  assert(
    element.shadowRoot.querySelector('slot[name="page"]'),
    'AppShell must define the page slot',
  );
  assert(element.hasAttribute('data-theme'), 'AppShell must reflect the theme state');
  assert(element.getAttribute('dir') === 'rtl', 'AppShell must reflect the direction state');

  assert(tokensSource.includes(':root'), 'tokens.css must declare :root tokens');
  assert(tokensSource.includes('--pey-'), 'tokens.css must define pey-prefixed tokens');
  assert(tokensSource.includes('--pey-font-family-base'), 'tokens.css must define the font token');
  assert(tokensSource.includes('--pey-color-text'), 'tokens.css must define the color token');

  assert(spriteSource.includes('<svg'), 'icons.svg must contain an svg root');
  assert(spriteSource.includes('aria-hidden="true"'), 'icons.svg must be decorative');
  assert(resolveIconSpriteUrl('https://example.test/ui/assets/')
    === 'https://example.test/ui/assets/icons.svg', 'Sprite URL must resolve inside assets');
  assert(createIconMarkup('https://example.test/ui/assets/', 'star')
    === '<svg aria-hidden="true" focusable="false"><use href="https://example.test/ui/assets/icons.svg#star"></use></svg>',
  'Icon markup must match the documented contract');

  console.log('Phase 4 contracts are valid.');
}

await main();