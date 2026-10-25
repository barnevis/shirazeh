// Validates phase 5 routing exports, registry, host, and fallback contracts.
import { readFile } from 'node:fs/promises';

import '../tests/setup-dom.js';
import { defaultConnect, createPageLoaderRegistry } from '../routing/page-loader.js';
import { PageFallback, PAGE_FALLBACK_STATES, TAG } from '../routing/page-fallback.js';
import { createPageHost } from '../routing/page-host.js';

const PACKAGE_URL = new URL('../package.json', import.meta.url);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createEvents() {
  const listeners = new Map();
  return {
    subscribe(type, listener) {
      listeners.set(type, listener);
      return () => listeners.delete(type);
    },
    publish() {
      return { success: true };
    },
    emit(type, event) {
      listeners.get(type)?.(event);
    },
  };
}

function createRouter(route) {
  return {
    getCurrentRoute() {
      return route;
    },
    async back() {},
    async replace() {},
  };
}

class RefsProbe extends PageFallback {
  onConnect(refs) {
    super.onConnect(refs);
    this.probeRefs = refs;
    return this;
  }
}

async function main() {
  const packageData = JSON.parse(await readFile(PACKAGE_URL, 'utf8'));

  for (const exportName of [
    './routing/page-loader',
    './routing/page-host',
    './routing/page-fallback',
  ]) {
    assert(
      typeof packageData.exports[exportName] === 'string',
      `Phase 5 export is missing: ${exportName}`,
    );
  }

  assert(TAG === 'pey-page-fallback', 'Fallback must use the pey-page-fallback tag');
  assert(PageFallback.prototype instanceof HTMLElement, 'Fallback must extend HTMLElement');
  assert(customElements.get(TAG) === PageFallback, 'Fallback must be a defined element');
  assert(PAGE_FALLBACK_STATES.NOT_FOUND === 'not-found', 'Fallback states must expose not-found');
  assert(PAGE_FALLBACK_STATES.LOAD_FAILED === 'load-failed', 'Fallback states must expose load-failed');

  const registry = createPageLoaderRegistry({
    routes: [
      { pattern: '/', load: () => {}, element: 'phase-5-page-home' },
      { pattern: '/accounts/:id', load: () => {}, element: 'phase-5-page-account' },
    ],
    notFound: { load: () => {}, element: 'phase-5-page-not-found' },
  });
  assert(registry.getEntry('/accounts/:id')?.element === 'phase-5-page-account', 'Registry must resolve entries by pattern');
  assert(registry.getEntry('/missing') === null, 'Registry must return null for unknown patterns');
  assert(registry.notFoundEntry?.element === 'phase-5-page-not-found', 'Registry must expose the notFound slot');

  customElements.define('phase-5-page-home', class extends PageFallback {});
  customElements.define('phase-5-page-account', class extends PageFallback {});
  customElements.define('phase-5-page-not-found', class extends PageFallback {});
  customElements.define('phase-5-refs-probe', RefsProbe);

  const probe = document.createElement('phase-5-refs-probe');
  defaultConnect(probe, { events: createEvents() }, { services: {} }, { params: { id: '7' }, query: { tab: 'profile' } });
  assert(probe.probeRefs.routeParams.id === '7' && probe.probeRefs.routeQuery.tab === 'profile', 'defaultConnect must pass route params and query');

  const events = createEvents();
  const router = createRouter({ pattern: '/', params: {}, query: {}, isNotFound: false });
  const shell = document.createElement('div');
  document.body.append(shell);
  const host = createPageHost({
    hostElement: shell,
    events,
    router,
    registry,
    infrastructure: { events },
    refs: { services: {} },
    config: { fallbackPath: '/home' },
  });

  await host.mountForRoute(router.getCurrentRoute());
  await flush();
  assert(shell.firstElementChild?.tagName === 'PHASE-5-PAGE-HOME', 'Host must mount the resolved page element');
  assert(shell.firstElementChild.slot === 'page', 'Mounted page must fill the page slot');

  router.getCurrentRoute = () => ({ pattern: '/nope', params: {}, query: {}, isNotFound: false });
  await host.mountForRoute(router.getCurrentRoute());
  await flush();
  assert(shell.firstElementChild?.tagName === 'PEY-PAGE-FALLBACK', 'Host must mount fallback for unknown patterns');
  assert(
    shell.firstElementChild.shadowRoot?.querySelector('button[data-action="retry"]') === null,
    'Unknown-pattern fallback must not offer retry',
  );

  router.getCurrentRoute = () => ({ pattern: '/not-found', params: {}, query: {}, isNotFound: true });
  await host.mountForRoute(router.getCurrentRoute());
  await flush();
  assert(shell.firstElementChild?.tagName === 'PHASE-5-PAGE-NOT-FOUND', 'Host must mount the notFound slot page');

  events.emit('router:changed', {});
  await flush();
  assert(shell.firstElementChild, 'Host must react to router:changed');

  host.dispose();
  assert(shell.childElementCount === 0, 'Host dispose must unmount the current page');

  console.log('Phase 5 contracts are valid.');
}

await main();
