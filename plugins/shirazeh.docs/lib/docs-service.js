// Provides the documentation page and sidebar service for shirazeh.docs.

import {
  DEFAULT_DOCS_ROOT,
  DEFAULT_HOME_PAGE,
  DEFAULT_SIDEBAR_FILE,
  ERROR_CODES,
  EVENT_NAMES,
} from './constants.js';
import { createDocsError } from './error.js';
import { createParsneshanOptions } from './parsneshan-extensions.js';
import {
  documentTitleForPath,
  neighborsForPath,
  parseSidebar,
  pathToDocumentUrl,
  titleFromToc,
  validatePath,
} from './sidebar.js';

const SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE';
const HTTP_SERVICE_NAME = 'shirazeh.http.service';
const MARKDOWN_SERVICE_NAME = 'pey.markdown.service';

function unavailableError() {
  return createDocsError(SERVICE_UNAVAILABLE, 'Docs service is unavailable');
}

function isBonyanError(value) {
  return value !== null
    && typeof value === 'object'
    && typeof value.code === 'string'
    && typeof value.message === 'string'
    && typeof value.source === 'string'
    && typeof value.timestamp === 'string';

}

/**
 * Normalizes the final plugin configuration.
 *
 * @param {object} config Merged plugin configuration.
 * @returns {{docsRoot: string, homePage: string, sidebarFile: string}} Normalized config.
 */
function normalizeConfig(config) {
  const trimTrailingSlash = (value) => value.replace(/\/+$/, '');
  return {
    docsRoot: trimTrailingSlash(config.docsRoot || DEFAULT_DOCS_ROOT),
    homePage: config.homePage || DEFAULT_HOME_PAGE,
    sidebarFile: config.sidebarFile || DEFAULT_SIDEBAR_FILE,
  };
}

/**
 * Creates the documentation service.
 *
 * @param {object} options Service options.
 * @param {object} options.config Plugin configuration.
 * @param {Function} options.publish Event publisher bound to the plugin's manifest source.
 * @returns {{service: object, bindDependencies: Function, deactivate: Function}} Service and lifecycle controls.
 */
export function createDocsService({ config, publish }) {
  const { docsRoot, homePage, sidebarFile } = normalizeConfig(config);
  const parsneshanOptions = createParsneshanOptions(config.extensions);
  let available = true;
  let httpService = null;
  let markdownService = null;
  let sidebarCache = null;

  function assertAvailable() {
    if (!available) {
      throw unavailableError();
    }
  }

  function requiredService(name) {
    const service = name === HTTP_SERVICE_NAME ? httpService : markdownService;
    if (!service) {
      throw createDocsError(SERVICE_UNAVAILABLE, 'Docs service dependencies are not bound yet');
    }
    return service;
  }

  async function loadSidebarLinks() {
    if (sidebarCache !== null) {
      return sidebarCache;
    }

    const http = requiredService(HTTP_SERVICE_NAME);
    const result = await http.getText(`${docsRoot}/${sidebarFile}`);
    if (isBonyanError(result)) {
      if (result.code === 'HTTP_NOT_FOUND') {
        throw createDocsError(ERROR_CODES.SIDEBAR_NOT_FOUND, 'The sidebar file was not found');
      }
      if (result.code === 'HTTP_MEDIA_TYPE_UNEXPECTED') {
        throw createDocsError(ERROR_CODES.SIDEBAR_PARSE_FAILED, 'The sidebar file has an unexpected type');
      }
      throw createDocsError(ERROR_CODES.RENDER_FAILED, 'The sidebar file could not be loaded');
    }

    const { links } = parseSidebar(result.body);
    sidebarCache = links;
    return links;
  }

  return {
    service: {
      /**
       * Returns the parsed sidebar navigation links.
       *
       * @returns {Promise<Array<object>|object>} Links or a standard Bonyan error.
       */
      async getSidebar() {
        try {
          assertAvailable();
          return await loadSidebarLinks();
        } catch (error) {
          return isBonyanError(error) ? error : createDocsError(ERROR_CODES.SIDEBAR_PARSE_FAILED, 'The sidebar could not be loaded');
        }
      },

      /**
       * Loads and renders one documentation page for a route path.
       *
       * @param {string} path Route path, '/' for the home page.
       * @returns {Promise<object|object>} PageData or a standard Bonyan error.
       */
      async getPage(path) {
        try {
          assertAvailable();
          validatePath(path);
        } catch (error) {
          return isBonyanError(error) ? error : unavailableError();
        }

        const documentUrl = pathToDocumentUrl(path, docsRoot, homePage);

        let http;
        try {
          http = requiredService(HTTP_SERVICE_NAME);
        } catch (error) {
          return isBonyanError(error) ? error : unavailableError();
        }
        let document;
        try {
          document = await http.getText(documentUrl);
        } catch {
          return unavailableError();
        }
        if (isBonyanError(document)) {
          if (document.code === 'HTTP_NOT_FOUND') {
            return createDocsError(ERROR_CODES.PAGE_NOT_FOUND, 'The requested page was not found');
          }
          return createDocsError(ERROR_CODES.RENDER_FAILED, 'The page document could not be loaded');
        }

        let markdown;
        try {
          markdown = requiredService(MARKDOWN_SERVICE_NAME);
        } catch (error) {
          return isBonyanError(error) ? error : unavailableError();
        }
        let rendered;
        try {
          rendered = markdown.renderFragment({
            markdown: document.body,
            syntaxExtensions: parsneshanOptions.syntaxExtensions,
            htmlExtensions: parsneshanOptions.htmlExtensions,
            footnoteOptions: parsneshanOptions.footnoteOptions,
          });
        } catch {
          return createDocsError(ERROR_CODES.RENDER_FAILED, 'The page could not be rendered');
        }
        if (isBonyanError(rendered)) {
          return createDocsError(ERROR_CODES.RENDER_FAILED, 'The page could not be rendered');
        }

        let links = [];
        try {
          links = await loadSidebarLinks();
        } catch {
          // A missing sidebar reduces capability (no title/neighbors) but the
          // page itself rendered successfully.
        }
        const { previous, next } = neighborsForPath(links, path);
        const headingTitle = titleFromToc(rendered.toc);

        const page = {
          path,
          html: rendered.html,
          toc: rendered.toc,
          title: headingTitle,
          documentTitle: documentTitleForPath(links, path, headingTitle),
          previous,
          next,
        };

        publish(EVENT_NAMES.PAGE_LOADED, { path });
        return page;
      },
    },

    /**
     * Binds resolved declared dependencies after settlement.
     *
     * @param {Record<string, object>} services Direct service references keyed by name.
     */
    bindDependencies(services) {
      httpService = services[HTTP_SERVICE_NAME] ?? null;
      markdownService = services[MARKDOWN_SERVICE_NAME] ?? null;
    },

    deactivate() {
      available = false;
      sidebarCache = null;
    },
  };
}
