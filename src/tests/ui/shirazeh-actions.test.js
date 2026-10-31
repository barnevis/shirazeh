// jsdom tests for the floating actions component's language toggle: it ships
// disabled (only the theme toggle shows), renders when config enables it,
// and a click switches the shared language/direction state.

import assert from 'node:assert/strict';
import test from 'node:test';
import { createEventsRecorder, createElement } from './setup-dom.js';

const { TAG } = await import('../../ui/components/shirazeh-actions.js');

async function flushRender() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function createFakeSharedState(initial = {}) {
  const values = { ...initial };
  const listeners = new Map();
  return {
    values,
    get: (key) => values[key],
    set: (key, value) => {
      values[key] = value;
      for (const listener of listeners.get(key) ?? []) {
        listener(value);
      }
    },
    subscribe: (key, listener) => {
      const list = listeners.get(key) ?? [];
      list.push(listener);
      listeners.set(key, list);
      return () => {
        listeners.set(key, (listeners.get(key) ?? []).filter((entry) => entry !== listener));
      };
    },
  };
}

async function mountActions({ languageToggle, sharedState = createFakeSharedState(), githubCorner = null } = {}) {
  const recorder = createEventsRecorder();
  const actions = createElement(TAG);
  actions.connect({
    infrastructure: { events: recorder.facade },
    refs: {
      sharedState,
      themeController: null,
      prefs: null,
      githubCorner,
      languageToggle,
    },
  });
  document.body.append(actions);
  await flushRender();
  return { actions, shadow: actions.shadowRoot, sharedState, recorder };
}

test('should_hide_language_button_by_default', async () => {
  document.body.innerHTML = '';
  const { shadow } = await mountActions();

  assert.equal(shadow.querySelector('button[data-theme-toggle]') !== null, true);
  assert.equal(shadow.querySelector('button[data-language]'), null);
});

test('should_render_language_button_when_config_enables_it', async () => {
  document.body.innerHTML = '';
  const { shadow } = await mountActions({ languageToggle: { enabled: true } });

  const button = shadow.querySelector('button[data-language]');
  assert.equal(button !== null, true);
  // The interface starts Persian, so the button offers English and shows it.
  assert.equal(button.dataset.language, 'en');
  assert.equal(button.textContent.trim(), 'EN');
});

test('should_switch_language_and_direction_on_click', async () => {
  document.body.innerHTML = '';
  const { shadow, sharedState } = await mountActions({ languageToggle: { enabled: true } });

  shadow.querySelector('button[data-language]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await flushRender();

  assert.equal(sharedState.values.language, 'en');
  assert.equal(sharedState.values.direction, 'ltr');
  // After switching, the button offers the way back to Persian.
  const button = shadow.querySelector('button[data-language]');
  assert.equal(button.dataset.language, 'fa');
  assert.equal(button.textContent.trim(), 'فا');
});

test('should_render_github_button_in_stack_when_style_is_button', async () => {
  document.body.innerHTML = '';
  const { shadow } = await mountActions({
    githubCorner: { enabled: true, url: 'https://github.com/barnevis/shirazeh', style: 'button' },
  });

  const button = shadow.querySelector('.actions-stack a.github-button');
  assert.equal(button !== null, true);
  assert.equal(button.getAttribute('href'), 'https://github.com/barnevis/shirazeh');
  assert.equal(shadow.querySelector('.github-corner'), null);
});

test('should_render_github_corner_when_style_is_corner', async () => {
  document.body.innerHTML = '';
  const { shadow } = await mountActions({
    githubCorner: { enabled: true, url: 'https://github.com/barnevis/shirazeh', style: 'corner' },
  });

  assert.equal(shadow.querySelector('.actions-stack a.github-button'), null);
  assert.equal(shadow.querySelector('.github-corner') !== null, true);
});

test('should_render_no_github_when_disabled', async () => {
  document.body.innerHTML = '';
  const { shadow } = await mountActions({
    githubCorner: { enabled: false, url: 'https://github.com/barnevis/shirazeh', style: 'button' },
  });

  assert.equal(shadow.querySelector('.actions-stack a.github-button'), null);
  assert.equal(shadow.querySelector('.github-corner'), null);
});
