// Builds the parsneshan extension bundle for the docs service from the
// plugin's `extensions` configuration flags. The parsneshan package is
// vendored at vendor/node_modules/parsneshan (browser: import map; Node:
// root node_modules for the micromark internals it imports).

import {
  caution,
  cautionHtml,
  important,
  importantHtml,
  note,
  noteHtml,
  persianFootnoteOptions,
  persianListExtension,
  persianListHtml,
  persianPoem,
  persianPoemHtml,
  tip,
  tipHtml,
  warning,
  warningHtml,
} from '../../../vendor/node_modules/parsneshan/index.js';

const ADMONITION_FACTORIES = [
  [warning, warningHtml],
  [caution, cautionHtml],
  [important, importantHtml],
  [tip, tipHtml],
  [note, noteHtml],
];

/**
 * Normalizes the `extensions` configuration flags.
 *
 * @param {object|undefined} extensions Raw configuration value.
 * @returns {{admonitions: boolean, persianList: boolean, persianPoem: boolean, persianFootnote: boolean}}
 */
function normalizeFlags(extensions) {
  const raw = extensions === null || typeof extensions !== 'object' ? {} : extensions;
  return {
    admonitions: raw.admonitions !== false,
    persianList: raw.persianList !== false,
    persianPoem: raw.persianPoem !== false,
    persianFootnote: raw.persianFootnote !== false,
  };
}

/**
 * Creates the render options for pey.markdown.service from configuration.
 *
 * @param {object|undefined} extensions Raw `extensions` configuration.
 * @returns {{syntaxExtensions: Array, htmlExtensions: Array, footnoteOptions: object|null}}
 */
export function createParsneshanOptions(extensions) {
  const flags = normalizeFlags(extensions);
  const syntaxExtensions = [];
  const htmlExtensions = [];

  if (flags.admonitions) {
    for (const [syntaxFactory, htmlFactory] of ADMONITION_FACTORIES) {
      syntaxExtensions.push(syntaxFactory());
      htmlExtensions.push(htmlFactory());
    }
  }

  if (flags.persianList) {
    syntaxExtensions.push(persianListExtension());
    htmlExtensions.push(persianListHtml());
  }

  if (flags.persianPoem) {
    syntaxExtensions.push(persianPoem());
    htmlExtensions.push(persianPoemHtml());
  }

  return {
    syntaxExtensions,
    htmlExtensions,
    footnoteOptions: flags.persianFootnote ? persianFootnoteOptions : null,
  };
}
