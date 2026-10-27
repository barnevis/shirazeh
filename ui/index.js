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
import './components/shirazeh-actions.js';
import { TAG as SIDEBAR_TAG } from './components/shirazeh-sidebar.js';
import appCatalog from './i18n/catalog.js';
import { createThemeController } from './theme.js';

const DOCS_SERVICE = 'shirazeh.docs.service';
const PREFS_SERVICE = 'shirazeh.prefs.service';
const LANGUAGE_KEY = 'language';
const DIRECTION_KEY = 'direction';
const DIRECTION_BY_LANGUAGE = { fa: 'rtl', en: 'ltr' };
const SUPPORTED_LANGUAGES = ['fa', 'en'];

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

// Applies preferences saved by shirazeh.prefs over the configured defaults.
// Runs after the synchronous mount: a brief default-theme flash is the cost
// of keeping the setup contract synchronous.
async function applyStoredPreferences(resources, sharedState, themeController) {
  const prefs = resources.optional?.[PREFS_SERVICE];
  if (prefs === null || prefs === undefined) {
    return;
  }

  const [savedTheme, savedLanguage] = await Promise.all([
    prefs.get('theme'),
    prefs.get('language'),
  ]);

  if (savedTheme === 'light' || savedTheme === 'dark') {
    themeController.setTheme(savedTheme);
  }

  if (SUPPORTED_LANGUAGES.includes(savedLanguage)) {
    const direction = DIRECTION_BY_LANGUAGE[savedLanguage];
    sharedState.set(LANGUAGE_KEY, savedLanguage);
    sharedState.set(DIRECTION_KEY, direction);
    document.documentElement.lang = savedLanguage;
    document.documentElement.dir = direction;
  }
}

export const setup = createApplicationSetup({
  assetBaseUrlBase: import.meta.url,
  requiredServices: [DOCS_SERVICE],
  optionalServices: [PREFS_SERVICE],

  mountShell(resources) {
    document.getElementById('boot')?.remove();

    const sharedState = createSharedState();
    sharedState.set(LANGUAGE_KEY, resources.config.language);
    sharedState.set(DIRECTION_KEY, resources.config.direction);

    // Theme: the controller mirrors the effective theme onto <html> and the
    // shared state (the shell reflects it as its data-theme attribute).
    const themeController = createThemeController({
      initialTheme: resources.config.theme,
      sharedState,
      documentElement: document.documentElement,
      matchMedia: (query) => window.matchMedia(query),
    });
    themeController.applyInitial();
    resources.themeController = themeController;

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

    // Old-look chrome: the floating action stack (theme + language toggles
    // and the optional octocat corner) on the shell; the rich navbar renders
    // only when explicitly enabled (the old app shipped it disabled).
    const actions = document.createElement('shirazeh-actions');
    actions.slot = 'extension-end';
    actions.connect({
      infrastructure: { events: resources.events },
      refs: {
        sharedState,
        themeController,
        prefs: resources.optional?.[PREFS_SERVICE] ?? null,
        githubCorner: resources.config.githubCorner,
      },
    });
    shell.append(actions);
    resources.actions = actions;

    // Persistent sidebar: mounted once on the shell so it never re-mounts on
    // navigation — only the page content swaps. Tree data and the active
    // path arrive asynchronously.
    const sidebar = document.createElement(SIDEBAR_TAG);
    sidebar.slot = 'extension';
    sidebar.connect({
      infrastructure: { events: resources.events },
      refs: {
        router: resources.router,
        path: '/',
        appName: resources.config.appName,
        logo: resources.config.logo,
      },
    });
    shell.append(sidebar);
    resources.sidebar = sidebar;

    const docsService = resources.required[DOCS_SERVICE];
    void Promise.resolve(docsService?.getSidebar?.()).then((parsedSidebar) => {
      if (parsedSidebar !== null && parsedSidebar !== undefined) {
        sidebar.setTree(parsedSidebar.tree);
      }
    }).catch(() => undefined);
    resources.events.subscribe('router:changed', () => {
      try {
        const path = resources.router.getCurrentRoute().path;
        sidebar.setCurrentPath(path);
      } catch {
        // A route read failure only skips the active-path update.
      }
    });

    if (resources.config.navbar?.enabled === true) {
      const navbar = document.createElement('shirazeh-navbar');
      navbar.slot = 'extension';
      navbar.connect({
        infrastructure: { events: resources.events },
        refs: {
          sharedState,
          fallbackPath: resources.config.fallbackPath,
          appName: resources.config.appName,
          logo: resources.config.logo,
          navbarZones: null,
          navbarConfig: resources.config.navbar ?? {},
        },
      });
      shell.append(navbar);
      resources.navbar = navbar;

      void Promise.resolve(docsService?.getNavbar?.()).then((parsedNavbar) => {
        if (parsedNavbar !== null && parsedNavbar !== undefined) {
          navbar.setZones(parsedNavbar);
        }
      }).catch(() => undefined);
      resources.events.subscribe('router:changed', () => {
        try {
          navbar.setCurrentPath(resources.router.getCurrentRoute().path);
        } catch {
          // A route read failure only skips the active-link update.
        }
      });
    }

    // Favicon: the configured icon overrides the default tag in index.html.
    const favicon = resources.config.favicon ?? {};
    if (favicon.enabled === true && typeof favicon.src === 'string' && favicon.src.length > 0) {
      for (const existing of [...document.querySelectorAll('link[rel*="icon"]')]) {
        existing.remove();
      }
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = favicon.src;
      document.head.append(link);
    }

    // Stored preferences override the configured defaults right after the
    // first paint; the prefs service degrades to null when unavailable.
    void applyStoredPreferences(resources, sharedState, themeController);

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
        events: resources.events,
        t: i18n.t,
        format: i18n.format,
        appName: resources.config.appName,
      },
      config: resources.config,
    });

    // Routes are registered after the page host subscribes, so the
    // router:changed fired by re-resolving the current path reaches it.
    resources.router.registerRoutes(DOC_ROUTE_PATTERNS);
  },

  cleanup(resources) {
    resources.pageHost?.dispose();
    resources.themeController?.dispose();
    resources.navbar?.remove();
    resources.shell?.remove();
  },

  onCoreShutdown() {
    // Nothing blocking is needed before the synchronous cleanup.
  },
});
