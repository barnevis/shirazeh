// jsdom tests for the shirazeh-sidebar component: tree rendering, submenu
// toggling, active-branch auto-open, and the mobile drawer.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createEventsRecorder, createElement, importSidebarComponent } from './setup-dom.js';

await importSidebarComponent();

async function flushRender() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const TREE = [
  {
    href: '/', title: 'خانه', attrTitle: null, level: 1, children: [
      { href: 'guide', title: 'راهنما', attrTitle: null, level: 2, children: [
        { href: 'guide/config', title: 'پیکربندی', attrTitle: null, level: 3, children: [] },
      ] },
    ],
  },
  { href: 'about', title: 'درباره', attrTitle: null, level: 1, children: [] },
];

async function mount({ path = '/guide', tree = TREE, router = null } = {}) {
  document.body.innerHTML = '';
  const recorder = createEventsRecorder();
  const sidebar = createElement('shirazeh-sidebar');
  sidebar.connect({
    infrastructure: { events: recorder.facade },
    refs: { tree, path, router, openLabel: 'باز کن' },
  });
  document.body.append(sidebar);
  await flushRender();
  return { sidebar, shadow: sidebar.shadowRoot, recorder };
}

test('should_render_tree_links_when_connected', async () => {
  const { shadow, sidebar } = await mount();

  const links = [...shadow.querySelectorAll('a[data-route]')];
  assert.deepEqual(links.map((a) => a.dataset.route), ['/', '/guide', '/guide/config', '/about']);
});

test('should_open_active_branch_when_mounted', async () => {
  const { shadow, sidebar } = await mount({ path: '/guide/config' });

  const open = [...shadow.querySelectorAll('.sidebar-submenu.is-open')];
  assert.equal(open.length, 2);
  assert.equal(shadow.querySelector("a[aria-current='page']")?.dataset.route, '/guide/config');
});

test('should_toggle_submenu_when_toggle_button_is_clicked', async () => {
  const { shadow, sidebar } = await mount({ path: '/about' });

  const toggle = shadow.querySelector('button[data-sidebar-toggle]');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(shadow.querySelectorAll('.sidebar-submenu.is-open').length, 1);
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('should_open_drawer_when_hamburger_clicked_and_close_on_overlay', async () => {
  const { shadow, sidebar } = await mount();

  const aside = shadow.querySelector('aside');
  const overlay = shadow.querySelector('.sidebar-overlay');
  assert.equal(aside.classList.contains('is-mobile-open'), false);

  shadow.querySelector('button[data-sidebar-hamburger]').click();
  assert.equal(aside.classList.contains('is-mobile-open'), true);
  assert.equal(overlay.classList.contains('is-visible'), true);

  overlay.click();
  assert.equal(aside.classList.contains('is-mobile-open'), false);
});

test('should_navigate_through_router_when_link_clicked', async () => {
  const navigated = [];
  const { shadow, sidebar } = await mount({
    path: '/',
    router: { navigate: (path) => navigated.push(path) },
  });

  const link = [...shadow.querySelectorAll('a[data-route]')]
    .find((a) => a.dataset.route === '/guide');
  link.click();

  assert.deepEqual(navigated, ['/guide']);
});

test('should_render_hidden_aside_when_tree_is_empty', async () => {
  const { shadow, sidebar } = await mount({ tree: [] });

  assert.equal(shadow.querySelector('aside').hasAttribute('hidden'), true);
});
