// Verifies the theme controller policy: configured value, auto mode with a
// live system listener, and explicit user choices overriding auto.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createThemeController, resolveTheme } from '../../ui/theme.js';

function createDocumentElement() {
  const attributes = new Map();
  return {
    setAttribute: (name, value) => attributes.set(name, value),
    get: (name) => attributes.get(name),
  };
}

function createSharedState() {
  const values = new Map();
  return {
    set: (key, value) => values.set(key, value),
    get: (key) => values.get(key),
  };
}

test('should_resolve_light_when_configured_light', () => {
  assert.equal(resolveTheme('light', { matches: true }), 'light');
});

test('should_resolve_dark_when_configured_dark', () => {
  assert.equal(resolveTheme('dark', { matches: false }), 'dark');
});

test('should_follow_system_when_configured_auto', () => {
  assert.equal(resolveTheme('auto', { matches: true }), 'dark');
  assert.equal(resolveTheme('auto', { matches: false }), 'light');
  assert.equal(resolveTheme('auto', null), 'light');
});

test('should_apply_configured_theme_when_initial_called', () => {
  const el = createDocumentElement();
  const sharedState = createSharedState();
  const controller = createThemeController({
    initialTheme: 'dark',
    sharedState,
    documentElement: el,
  });

  controller.applyInitial();

  assert.equal(el.get('data-theme'), 'dark');
  assert.equal(sharedState.get('theme'), 'dark');
  assert.equal(controller.currentTheme(), 'dark');
});

test('should_apply_system_theme_when_auto', () => {
  const el = createDocumentElement();
  const controller = createThemeController({
    initialTheme: 'auto',
    documentElement: el,
    matchMedia: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
  });

  controller.applyInitial();

  assert.equal(el.get('data-theme'), 'dark');
});

test('should_follow_system_changes_when_auto_and_no_user_choice', () => {
  const el = createDocumentElement();
  let listener = null;
  const media = {
    matches: false,
    addEventListener: (_, fn) => { listener = fn; },
    removeEventListener: () => {},
  };
  const controller = createThemeController({
    initialTheme: 'auto',
    documentElement: el,
    matchMedia: () => media,
  });

  controller.applyInitial();
  assert.equal(el.get('data-theme'), 'light');

  media.matches = true;
  listener();
  assert.equal(el.get('data-theme'), 'dark');
});

test('should_stop_following_system_when_user_chooses', () => {
  const el = createDocumentElement();
  let listener = null;
  const media = {
    matches: false,
    addEventListener: (_, fn) => { listener = fn; },
    removeEventListener: () => {},
  };
  const controller = createThemeController({
    initialTheme: 'auto',
    documentElement: el,
    matchMedia: () => media,
  });

  controller.applyInitial();
  controller.setTheme('dark');
  media.matches = false;
  listener();

  assert.equal(el.get('data-theme'), 'dark');
});

test('should_toggle_between_light_and_dark', () => {
  const el = createDocumentElement();
  const controller = createThemeController({ initialTheme: 'light', documentElement: el });

  controller.applyInitial();
  controller.toggle();
  assert.equal(el.get('data-theme'), 'dark');
  controller.toggle();
  assert.equal(el.get('data-theme'), 'light');
});

test('should_ignore_invalid_theme_values', () => {
  const el = createDocumentElement();
  const controller = createThemeController({ initialTheme: 'light', documentElement: el });

  controller.applyInitial();
  controller.setTheme('neon');

  assert.equal(el.get('data-theme'), 'light');
});

test('should_detach_listener_when_disposed', () => {
  const el = createDocumentElement();
  const removed = [];
  const media = {
    matches: false,
    addEventListener: () => {},
    removeEventListener: (type) => removed.push(type),
  };
  const controller = createThemeController({
    initialTheme: 'auto',
    documentElement: el,
    matchMedia: () => media,
  });

  controller.applyInitial();
  controller.dispose();

  assert.deepEqual(removed, ['change']);
});

test('should_reject_missing_document_element', () => {
  assert.throws(
    () => createThemeController({ initialTheme: 'light', documentElement: null }),
    TypeError,
  );
});
