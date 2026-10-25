// Shirazeh UI entry point for Pey Core, built on the pey.webui kit.
// The UI is not a plugin: it receives bound services, the Event Bus facade,
// and its config, then mounts the shell, chrome, and the page host.

import { PEY_ROUTER_SERVICE } from 'pey.webui/contracts';
import { createI18n } from 'pey.webui/i18n';
import { createPageHost } from 'pey.webui/routing/page-host';
import { createPageLoaderRegistry } from 'pey.webui/routing/page-loader';
import { TAG as APP_SHELL_TAG } from 'pey.webui/shell/app-shell';
import { createApplicationSetup } from 'pey.webui/shell/create-application-setup';
import { createSharedState } from 'pey.webui/shared-state';
import './components/shirazeh-navbar.js';
import appCatalog from './i18n/catalog.js';

const DOCS_SERVICE = 'shirazeh.docs.service';
const LANGUAGE_KEY = 'language';
const DIRECTION_KEY = 'direction';

// Documentation routes have free depth; the router pattern syntax is fixed
// segments, so one pattern per depth (up to five) covers the address space.
const DOC_ROUTE_PATTERNS = [
  '/',
  '/:page',
  '/:page/:sub1',
  '/:page/:sub1/:sub2',
  '/:page/:sub1/:sub2/:sub3',
  '/:page/:sub1/:sub2/:sub3/:sub4',
];

function loadDocsPage() {
  return import('./pages/docs/docs.js');
}

function loadNotFoundPage() {
  return import('./pages/not-found/not-found.js');
}

export const setup = createApplicationSetup({
  assetBaseUrlBase: import.meta.url,
  requiredServices: [DOCS_SERVICE],
  optionalServices: [],

  mountShell(resources) {
    document.getElementById('boot')?.remove();

    const sharedState = createSharedState();
    sharedState.set(LANGUAGE_KEY, resources.config.language);
    sharedState.set(DIRECTION_KEY, resources.config.direction);

    const shell = document.createElement(APP_SHELL_TAG);
    shell.connect({
      infrastructure: { events: resources.events },
      refs: {
        theme: resources.config.theme,
        direction: resources.config.direction,
        sharedState,
      },
    });
    document.body.append(shell);
    resources.shell = shell;

    const navbar = document.createElement('shirazeh-navbar');
    navbar.slot = 'extension';
    navbar.connect({
      infrastructure: { events: resources.events },
      refs: {
        sharedState,
        fallbackPath: resources.config.fallbackPath,
      },
    });
    shell.append(navbar);
    resources.navbar = navbar;

    const i18n = createI18n({
      language: resources.config.language,
      catalog: appCatalog,
    });

    const registry = createPageLoaderRegistry({
      routes: DOC_ROUTE_PATTERNS.map((pattern) => ({
        pattern,
        load: loadDocsPage,
        element: 'app-page-docs',
      })),
      notFound: {
        load: loadNotFoundPage,
        element: 'app-page-not-found',
      },
    });

    resources.pageHost = createPageHost({
      hostElement: shell,
      events: resources.events,
      router: resources.router,
      registry,
      infrastructure: { events: resources.events },
      refs: {
        services: resources.required,
        router: resources.router,
        sharedState,
        config: resources.config,
        t: i18n.t,
        format: i18n.format,
      },
      config: resources.config,
    });

    // Routes are registered after the page host subscribes, so the
    // router:changed fired by re-resolving the current path reaches it.
    resources.router.registerRoutes(DOC_ROUTE_PATTERNS);
  },

  cleanup(resources) {
    resources.pageHost?.dispose();
    resources.navbar?.remove();
    resources.shell?.remove();
  },

  onCoreShutdown() {
    // Nothing blocking is needed before the synchronous cleanup.
  },
});
