// Verifies the shared PeyElement lifecycle, rendering, events, and preservation.

import '../setup-dom.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import { PeyElement } from '../../base/pey-element.js';
import { getStyleText } from '../../base/attach-style-sheet.js';

let tagCounter = 0;

function nextTag() {
  tagCounter += 1;
  return `pey-test-element-${tagCounter}`;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createEvents() {
  const subscriptions = new Map();
  const published = [];
  return {
    published,
    subscribe(type, listener) {
      subscriptions.set(type, listener);
      return () => subscriptions.delete(type);
    },
    publish(type, data) {
      published.push({ type, data });
      return { success: true };
    },
    emit(type, event = {}) {
      subscriptions.get(type)?.(event);
    },
    subscriptionCount() {
      return subscriptions.size;
    },
  };
}

function defineComponent(Component) {
  const tag = nextTag();
  customElements.define(tag, Component);
  return tag;
}

function connectElement(element, events, refs = {}) {
  element.connect({ infrastructure: { events }, refs });
}

function appendExpectError(element, code = null) {
  return new Promise((resolve, reject) => {
    const onError = (event) => {
      window.removeEventListener('error', onError);
      if (code === null || event.error?.code === code) resolve();
      else reject(new Error(`expected error code ${code}, received ${event.error?.code}`));
    };
    window.addEventListener('error', onError);
    document.body.append(element);
  });
}

function assertRenderFallback(element) {
  assert.ok(element.shadowRoot.querySelector('[part="error"]'), 'expected the render fallback');
}

test('should_render_shadow_dom_when_element_is_connected', async () => {
  class TestElement extends PeyElement {
    render() { return '<p>ready</p>'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);

  document.body.append(element);
  await flush();

  assert.equal(element.shadowRoot.textContent, 'ready');
});

test('should_reject_second_connect_when_element_was_connected_once', () => {
  class TestElement extends PeyElement {}
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);

  assert.throws(
    () => element.connect({ infrastructure: { events }, refs: {} }),
    (error) => error.code === 'PEY_ELEMENT_ALREADY_CONNECTED',
  );
});

test('should_receive_only_component_refs_in_on_connect', () => {
  let receivedRefs = null;
  class TestElement extends PeyElement {
    onConnect(refs) { receivedRefs = refs; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const refs = { value: 'provided' };
  const element = document.createElement(tag);
  connectElement(element, events, refs);

  assert.equal(receivedRefs, refs);
});

test('should_subscribe_and_unsubscribe_through_base_class', () => {
  let receivedEvent = null;
  class TestElement extends PeyElement {
    subscriptions() { return { 'example:changed': (event) => { receivedEvent = event; } }; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);

  events.emit('example:changed', { data: { id: '1' } });
  assert.deepEqual(receivedEvent.data, { id: '1' });
  element.remove();
  events.emit('example:changed', { data: { id: '2' } });
  assert.equal(events.subscriptionCount(), 0);
});

test('should_delegate_events_once_across_renders', async () => {
  let clickCount = 0;
  class TestElement extends PeyElement {
    eventTypes() { return ['click']; }
    handleEvent() { clickCount += 1; }
    render() { return '<button>click</button>'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  element.requestRender();
  element.requestRender();
  await flush();
  element.shadowRoot.querySelector('button').dispatchEvent(new Event('click', { bubbles: true }));

  assert.equal(clickCount, 1);
});

test('should_publish_component_error_and_render_fallback_when_render_throws', async () => {
  class TestElement extends PeyElement {
    render() { throw new Error('private render detail'); }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();

  assertRenderFallback(element);
  assert.equal(events.published[0].type, 'ui:component-error');
  assert.deepEqual(Object.keys(events.published[0].data), ['componentTag', 'code']);
});

test('should_not_escape_the_boundary_when_the_stylesheet_itself_throws', async () => {
  const events = createEvents();
  const href = `https://example.test/ui/assets/${nextTag()}.css`;
  await getStyleText(href, {
    preload: false,
    fetchFn: () => Promise.resolve({ ok: true, status: 200, text: async () => '#a{}' }),
  });
  class StyledElement extends PeyElement {
    stylesheetHref() { return href; }
    stylesheetNonce() { return '  bad  '; }
    render() { return '<p>content</p>'; }
  }
  const tag = defineComponent(StyledElement);
  const element = document.createElement(tag);
  connectElement(element, events);
  const logs = [];
  const originalError = console.error;
  console.error = (message) => logs.push(String(message));
  const uncaught = [];
  const onError = (event) => uncaught.push(event.error);
  window.addEventListener('error', onError);
  try {
    document.body.append(element);
    await flush();
  } finally {
    console.error = originalError;
    window.removeEventListener('error', onError);
  }

  assertRenderFallback(element);
  const errorEvent = events.published.find((event) => event.type === 'ui:component-error');
  assert.equal(errorEvent.data.code, 'PEY_ELEMENT_RENDER_FAILED');
  assert.equal(uncaught.length, 0, 'the invalid nonce must not escape the error boundary');
  assert.ok(
    logs.some((message) => message.includes('PEY_ELEMENT_STYLESHEET_APPLY_FAILED')),
    'the fallback apply failure is logged, not propagated',
  );
  element.remove();
});

test('should_keep_working_after_event_handler_throws', async () => {
  let attempts = 0;
  class TestElement extends PeyElement {
    eventTypes() { return ['click']; }
    handleEvent() {
      attempts += 1;
      if (attempts === 1) throw new Error('handler failure');
    }
    render() { return '<button>click</button>'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  const click = () => element.shadowRoot.querySelector('button').dispatchEvent(new Event('click', { bubbles: true }));

  click();
  click();

  assert.equal(attempts, 2);
});

test('should_publish_ui_event_and_log_failed_publish_result', () => {
  const events = createEvents();
  events.publish = () => ({ success: false, error: 'not-declared' });
  class TestElement extends PeyElement {}
  const tag = defineComponent(TestElement);
  const element = document.createElement(tag);
  connectElement(element, events);

  assert.doesNotThrow(() => element.publishUIEvent('ui:test', { id: '1' }));
});

test('should_log_and_forward_a_failed_publish_and_never_retry_component_error', async () => {
  const published = [];
  const loggerCalls = [];
  const events = {
    subscribe: () => () => {},
    publish(type, data) {
      published.push({ type, data });
      return { success: false, error: 'not-declared' };
    },
  };
  const logger = { error: (payload) => loggerCalls.push(payload) };
  const logs = [];
  const originalError = console.error;
  console.error = (message) => logs.push(message);
  class TestElement extends PeyElement {
    render() { throw new Error('private render detail'); }
  }
  const tag = defineComponent(TestElement);
  const element = document.createElement(tag);
  element.connect({ infrastructure: { events, logger }, refs: {} });
  try {
    document.body.append(element);
    await flush();
  } finally {
    console.error = originalError;
  }

  const errorPublishes = published.filter(({ type }) => type === 'ui:component-error');
  assert.equal(errorPublishes.length, 1, 'a failed ui:component-error publish must not be retried');
  assert.ok(
    logs.some((message) => String(message).includes('PEY_ELEMENT_EVENT_PUBLISH_FAILED')),
    'a failed publish result must be logged in the console',
  );
  assert.ok(
    loggerCalls.some((payload) => payload.code === 'PEY_ELEMENT_EVENT_PUBLISH_FAILED' && typeof payload.componentTag === 'string'),
    'a failed publish result must be forwarded to the optional logger',
  );
});

test('should_preserve_value_selection_focus_and_scroll', async () => {
  class TestElement extends PeyElement {
    render() {
      return '<input data-pey-preserve="query" data-pey-preserve-state="value selection focus"><div data-pey-preserve="list" data-pey-preserve-state="scroll"></div>';
    }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  const input = element.shadowRoot.querySelector('input');
  const list = element.shadowRoot.querySelector('div');
  input.value = 'query';
  input.setSelectionRange(1, 5);
  input.focus();
  list.scrollTop = 22;
  element.requestRender();
  await flush();

  const nextInput = element.shadowRoot.querySelector('input');
  const nextList = element.shadowRoot.querySelector('div');
  assert.equal(nextInput.value, 'query');
  assert.equal(nextInput.selectionStart, 1);
  assert.equal(nextInput.selectionEnd, 5);
  assert.equal(element.shadowRoot.activeElement, nextInput);
  assert.equal(nextList.scrollTop, 22);
});

test('should_reject_selection_marker_for_unsupported_input_type', async () => {
  class TestElement extends PeyElement {
    render() { return '<input type="number" data-pey-preserve="number" data-pey-preserve-state="value selection">'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();

  assertRenderFallback(element);
});

test('should_keep_one_checked_radio_after_preservation', async () => {
  class TestElement extends PeyElement {
    render() {
      return '<input type="radio" name="mode" value="a" data-pey-preserve="a" data-pey-preserve-state="checked"><input type="radio" name="mode" value="b" data-pey-preserve="b" data-pey-preserve-state="checked">';
    }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  const radios = element.shadowRoot.querySelectorAll('input');
  radios[0].checked = true;
  element.requestRender();
  await flush();

  assert.equal([...element.shadowRoot.querySelectorAll('input')].filter((radio) => radio.checked).length, 1);
});

test('should_reject_duplicate_event_types', () => {
  class TestElement extends PeyElement {
    eventTypes() { return ['click', 'click']; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);

  assert.throws(
    () => connectElement(element, events),
    (error) => error.code === 'PEY_ELEMENT_EVENT_TYPES_INVALID',
  );
});

test('should_reject_non_array_event_types', () => {
  class TestElement extends PeyElement {
    eventTypes() { return 'click'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);

  assert.throws(
    () => connectElement(element, events),
    (error) => error.code === 'PEY_ELEMENT_EVENT_TYPES_INVALID',
  );
});

test('should_log_radio_conflict_when_snapshot_has_multiple_checked_in_one_group', async () => {
  class TestElement extends PeyElement {
    constructor() {
      super();
      this.grouped = false;
    }
    render() {
      if (this.grouped) {
        return '<input type="radio" name="mode" value="a" data-pey-preserve="a" data-pey-preserve-state="checked"><input type="radio" name="mode" value="b" data-pey-preserve="b" data-pey-preserve-state="checked">';
      }
      return '<form id="f1"><input type="radio" name="mode" value="a" data-pey-preserve="a" data-pey-preserve-state="checked"></form><form id="f2"><input type="radio" name="mode" value="b" data-pey-preserve="b" data-pey-preserve-state="checked"></form>';
    }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  const radios = element.shadowRoot.querySelectorAll('input');
  radios[0].checked = true;
  radios[1].checked = true;
  const logs = [];
  const originalError = console.error;
  console.error = (message) => logs.push(message);
  try {
    element.grouped = true;
    element.requestRender();
    await flush();
  } finally {
    console.error = originalError;
  }

  assert.ok(logs.some((message) => String(message).includes('PEY_PRESERVE_RADIO_CONFLICT')));
  const checked = [...element.shadowRoot.querySelectorAll('input')].filter((radio) => radio.checked);
  assert.equal(checked.length, 1);
  assert.equal(checked[0].value, 'b');
});

test('should_coalesce_multiple_render_requests', async () => {
  let renderCount = 0;
  class TestElement extends PeyElement {
    render() {
      renderCount += 1;
      return '<p>x</p>';
    }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  const before = renderCount;

  element.requestRender();
  element.requestRender();
  element.requestRender();
  await flush();

  assert.equal(renderCount, before + 1);
});

test('should_let_preserve_false_dominate_coalesced_requests', async () => {
  class TestElement extends PeyElement {
    render() { return '<input data-pey-preserve="q" data-pey-preserve-state="value">'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  element.shadowRoot.querySelector('input').value = 'typed';

  element.requestRender();
  element.requestRender({ preserve: false });
  await flush();

  assert.equal(element.shadowRoot.querySelector('input').value, '');
});

test('should_not_preserve_when_preserve_is_false', async () => {
  class TestElement extends PeyElement {
    render() { return '<input data-pey-preserve="q" data-pey-preserve-state="value">'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  element.shadowRoot.querySelector('input').value = 'typed';

  element.requestRender({ preserve: false });
  await flush();

  assert.equal(element.shadowRoot.querySelector('input').value, '');
});

test('should_preserve_checked_state_on_checkbox', async () => {
  class TestElement extends PeyElement {
    render() { return '<input type="checkbox" data-pey-preserve="done" data-pey-preserve-state="checked">'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  const checkbox = element.shadowRoot.querySelector('input');
  checkbox.checked = true;

  element.requestRender();
  await flush();

  assert.equal(element.shadowRoot.querySelector('input').checked, true);
});

test('should_reject_duplicate_preserve_keys', async () => {
  class TestElement extends PeyElement {
    render() { return '<input data-pey-preserve="q" data-pey-preserve-state="value"><input data-pey-preserve="q" data-pey-preserve-state="value">'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();

  assertRenderFallback(element);
});

test('should_reject_unknown_preserve_state_token', async () => {
  class TestElement extends PeyElement {
    render() { return '<input data-pey-preserve="q" data-pey-preserve-state="mystery">'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();

  assertRenderFallback(element);
});

test('should_reject_preserve_marker_without_states', async () => {
  class TestElement extends PeyElement {
    render() { return '<input data-pey-preserve="q">'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();

  assertRenderFallback(element);
});

test('should_reject_value_preservation_on_non_form_element', async () => {
  class TestElement extends PeyElement {
    render() { return '<div data-pey-preserve="q" data-pey-preserve-state="value"></div>'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();

  assertRenderFallback(element);
});

test('should_restore_only_intersection_of_preserve_states', async () => {
  class TestElement extends PeyElement {
    constructor() {
      super();
      this.dropSelection = false;
    }
    render() {
      if (this.dropSelection) return '<input data-pey-preserve="q" data-pey-preserve-state="value" value="short">';
      return '<input data-pey-preserve="q" data-pey-preserve-state="value selection" value="longer-value">';
    }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  const input = element.shadowRoot.querySelector('input');
  input.setSelectionRange(5, 9);

  element.dropSelection = true;
  element.requestRender();
  await flush();

  const next = element.shadowRoot.querySelector('input');
  assert.equal(next.value, 'longer-value');
  assert.notEqual(next.selectionStart, 5);
});

test('should_keep_selection_within_value_bounds_after_restore', async () => {
  class TestElement extends PeyElement {
    render() { return '<input data-pey-preserve="q" data-pey-preserve-state="value selection">'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  const input = element.shadowRoot.querySelector('input');
  input.value = 'abcde';
  input.setSelectionRange(1, 9);

  element.requestRender();
  await flush();

  const next = element.shadowRoot.querySelector('input');
  assert.ok(next.selectionStart <= next.value.length);
  assert.ok(next.selectionEnd <= next.value.length);
});

test('should_not_leak_snapshot_between_render_cycles', async () => {
  class TestElement extends PeyElement {
    constructor() {
      super();
      this.dropA = false;
    }
    render() {
      if (this.dropA) return '<input data-pey-preserve="b" data-pey-preserve-state="value">';
      return '<input data-pey-preserve="a" data-pey-preserve-state="value"><input data-pey-preserve="b" data-pey-preserve-state="value">';
    }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  element.shadowRoot.querySelector('[data-pey-preserve="a"]').value = 'a-value';

  element.dropA = true;
  element.requestRender();
  await flush();
  element.shadowRoot.querySelector('[data-pey-preserve="b"]').value = 'b-value';

  element.dropA = false;
  element.requestRender();
  await flush();

  assert.equal(element.shadowRoot.querySelector('[data-pey-preserve="a"]').value, '');
  assert.equal(element.shadowRoot.querySelector('[data-pey-preserve="b"]').value, 'b-value');
});

test('should_use_the_template_value_on_initial_render_without_a_snapshot', async () => {
  class TestElement extends PeyElement {
    render() { return '<input data-pey-preserve="q" data-pey-preserve-state="value" value="initial">'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();

  assert.equal(element.shadowRoot.querySelector('input').value, 'initial');
});

test('should_not_restore_a_state_when_its_preserve_key_changes', async () => {
  class TestElement extends PeyElement {
    constructor() {
      super();
      this.rename = false;
    }
    render() {
      if (this.rename) return '<input data-pey-preserve="renamed" data-pey-preserve-state="value">';
      return '<input data-pey-preserve="original" data-pey-preserve-state="value">';
    }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  element.shadowRoot.querySelector('input').value = 'typed';

  element.rename = true;
  element.requestRender();
  await flush();

  assert.equal(element.shadowRoot.querySelector('input').value, '');
});

test('should_reject_non_function_subscription_listener', async () => {
  class TestElement extends PeyElement {
    subscriptions() { return { 'example:changed': 'not-a-function' }; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);

  await appendExpectError(element, 'PEY_ELEMENT_SUBSCRIPTIONS_INVALID');
});

test('should_reject_subscribe_without_unsubscribe_function', async () => {
  const events = createEvents();
  events.subscribe = () => null;
  class TestElement extends PeyElement {
    subscriptions() { return { 'example:changed': () => {} }; }
  }
  const tag = defineComponent(TestElement);
  const element = document.createElement(tag);
  connectElement(element, events);

  await appendExpectError(element, 'PEY_ELEMENT_SUBSCRIBE_INVALID');
});

test('should_roll_back_partial_subscriptions_when_subscriptions_shape_is_invalid', async () => {
  const subscribedTypes = [];
  const subscriptions = new Map();
  const events = {
    subscribe(type, listener) {
      subscribedTypes.push(type);
      subscriptions.set(type, listener);
      return () => subscriptions.delete(type);
    },
    publish() { return { success: true }; },
    subscriptionCount() { return subscriptions.size; },
  };
  class TestElement extends PeyElement {
    subscriptions() {
      return {
        'example:first': () => {},
        'example:second': null,
      };
    }
  }
  const tag = defineComponent(TestElement);
  const element = document.createElement(tag);
  connectElement(element, events);

  await appendExpectError(element, 'PEY_ELEMENT_SUBSCRIPTIONS_INVALID');

  assert.deepEqual(subscribedTypes, ['example:first']);
  assert.equal(events.subscriptionCount(), 0);
});

test('should_roll_back_when_events_subscribe_throws_partway', async () => {
  const subscriptions = new Map();
  const events = {
    subscribe(type, listener) {
      if (type === 'example:second') throw new Error('subscribe boom');
      subscriptions.set(type, listener);
      return () => subscriptions.delete(type);
    },
    publish() { return { success: true }; },
    subscriptionCount() { return subscriptions.size; },
  };
  class TestElement extends PeyElement {
    subscriptions() {
      return {
        'example:first': () => {},
        'example:second': () => {},
      };
    }
  }
  const tag = defineComponent(TestElement);
  const element = document.createElement(tag);
  connectElement(element, events);

  await appendExpectError(element);
  assert.equal(events.subscriptionCount(), 0);
});

test('should_roll_back_subscriptions_and_listeners_when_binding_fails_midway', async () => {
  const removed = [];
  class TestElement extends PeyElement {
    eventTypes() { return ['click', 'keydown']; }
    subscriptions() { return { 'example:changed': () => {} }; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  const originalAdd = element.shadowRoot.addEventListener;
  const originalRemove = element.shadowRoot.removeEventListener;
  element.shadowRoot.addEventListener = (type, listener) => {
    if (type === 'keydown') throw new Error('bind boom');
    return originalAdd.call(element.shadowRoot, type, listener);
  };
  element.shadowRoot.removeEventListener = (type, listener) => {
    removed.push(type);
    return originalRemove.call(element.shadowRoot, type, listener);
  };

  await appendExpectError(element);

  assert.equal(events.subscriptionCount(), 0);
  assert.deepEqual(removed, ['click']);
});

test('should_resubscribe_and_relisten_when_reconnected_without_second_connect', async () => {
  let clickCount = 0;
  const receivedEvents = [];
  class TestElement extends PeyElement {
    eventTypes() { return ['click']; }
    subscriptions() { return { 'example:changed': (event) => { receivedEvents.push(event); } }; }
    handleEvent() { clickCount += 1; }
    render() { return '<span data-role="btn">x</span>'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();

  events.emit('example:changed', { count: 1 });
  assert.equal(receivedEvents.length, 1);
  assert.equal(events.subscriptionCount(), 1);

  element.remove();
  assert.equal(events.subscriptionCount(), 0);

  document.body.append(element);
  await flush();
  assert.equal(events.subscriptionCount(), 1);
  events.emit('example:changed', { count: 2 });
  assert.equal(receivedEvents.length, 2);
  element.shadowRoot.querySelector('[data-role="btn"]').dispatchEvent(new Event('click', { bubbles: true }));
  assert.equal(clickCount, 1);
});

test('should_clean_all_subscriptions_when_one_unsubscribe_throws', async () => {
  const subscriptions = new Map();
  const events = {
    subscribe(type, listener) {
      const throwing = type === 'example:first';
      subscriptions.set(type, listener);
      return throwing
        ? () => {
          subscriptions.delete(type);
          throw new Error('unsubscribe boom');
        }
        : () => subscriptions.delete(type);
    },
    publish() { return { success: true }; },
    subscriptionCount() { return subscriptions.size; },
  };
  class TestElement extends PeyElement {
    subscriptions() { return { 'example:first': () => {}, 'example:second': () => {} }; }
  }
  const tag = defineComponent(TestElement);
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  const logs = [];
  const originalError = console.error;
  console.error = (message) => logs.push(message);
  try {
    element.remove();
  } finally {
    console.error = originalError;
  }

  assert.equal(events.subscriptionCount(), 0);
  assert.ok(logs.some((message) => String(message).includes('PEY_ELEMENT_UNSUBSCRIBE_FAILED')));
});

test('should_skip_scheduled_render_when_element_was_disconnected', async () => {
  let renderCount = 0;
  class TestElement extends PeyElement {
    render() { renderCount += 1; return '<p>x</p>'; }
  }
  const tag = defineComponent(TestElement);
  const events = createEvents();
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  const before = renderCount;

  element.requestRender();
  element.remove();
  await flush();

  assert.equal(renderCount, before);
});

test('should_gate_first_render_until_stylesheet_is_available', async () => {
  const events = createEvents();
  const href = `https://example.test/ui/assets/${nextTag()}.css`;
  let resolveFetch;
  const fetchFn = () => new Promise((resolve) => { resolveFetch = resolve; });
  const load = getStyleText(href, { preload: false, fetchFn });
  class StyledElement extends PeyElement {
    stylesheetHref() { return href; }
    render() { return '<p>content</p>'; }
  }
  const tag = defineComponent(StyledElement);
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  assert.equal(element.shadowRoot.querySelector('p'), null, 'content must wait for the stylesheet');
  assert.equal(element.shadowRoot.querySelector('style[data-pey-stylesheet]'), null);

  resolveFetch({ ok: true, status: 200, text: async () => ':host{display:block}' });
  await flush();
  await flush();

  const style = element.shadowRoot.querySelector('style[data-pey-stylesheet]');
  assert.ok(style, 'stylesheet attached once the sheet resolves');
  assert.ok(style.textContent.includes(':host'));
  assert.ok(element.shadowRoot.querySelector('p'), 'content renders only after the stylesheet');
  await load;
  element.remove();
});

test('should_keep_stylesheet_across_full_renders', async () => {
  const events = createEvents();
  const href = `https://example.test/ui/assets/${nextTag()}.css`;
  await getStyleText(href, {
    preload: false,
    fetchFn: () => Promise.resolve({ ok: true, status: 200, text: async () => '#box{color:red}' }),
  });
  let label = 'one';
  class StyledElement extends PeyElement {
    stylesheetHref() { return href; }
    render() { return `<p>${label}</p>`; }
  }
  const tag = defineComponent(StyledElement);
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  assert.ok(element.shadowRoot.querySelector('style[data-pey-stylesheet]'), 'stylesheet present on first render');

  label = 'two';
  element.requestRender();
  await flush();

  const styles = element.shadowRoot.querySelectorAll('style[data-pey-stylesheet]');
  assert.equal(styles.length, 1, 'a full render must not duplicate the stylesheet');
  assert.equal(element.shadowRoot.querySelector('p').textContent, 'two', 'content re-renders across full renders');
  element.remove();
});

test('should_render_unstyled_and_report_when_stylesheet_fails', async () => {
  const events = createEvents();
  const href = `https://example.test/ui/assets/${nextTag()}.css`;
  let rejectFetch;
  const fetchFn = () => new Promise((resolve, reject) => { rejectFetch = reject; });
  const load = getStyleText(href, { preload: false, fetchFn });
  class StyledElement extends PeyElement {
    stylesheetHref() { return href; }
    render() { return '<p>content</p>'; }
  }
  const tag = defineComponent(StyledElement);
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  rejectFetch(new Error('offline'));
  await flush();
  await flush();

  assert.equal(element.shadowRoot.querySelector('style[data-pey-stylesheet]'), null, 'no stylesheet after a failure');
  assert.ok(element.shadowRoot.querySelector('p'), 'content still renders without the stylesheet');
  const errorEvent = events.published.find((event) => event.type === 'ui:component-error');
  assert.ok(errorEvent, 'the stylesheet failure must be reported');
  assert.equal(errorEvent.data.code, 'PEY_ELEMENT_STYLESHEET_FAILED');
  await assert.rejects(load, (error) => error.code === 'PEY_STYLESHEET_FETCH_FAILED');
  element.remove();
});

test('should_reload_stylesheet_when_the_href_changes', async () => {
  const events = createEvents();
  const first = `https://example.test/ui/assets/${nextTag()}.css`;
  const second = `https://example.test/ui/assets/${nextTag()}.css`;
  await getStyleText(first, {
    preload: false,
    fetchFn: () => Promise.resolve({ ok: true, status: 200, text: async () => '#a{}' }),
  });
  await getStyleText(second, {
    preload: false,
    fetchFn: () => Promise.resolve({ ok: true, status: 200, text: async () => '#b{}' }),
  });
  let currentHref = first;
  class StyledElement extends PeyElement {
    stylesheetHref() { return currentHref; }
    render() { return '<p>content</p>'; }
  }
  const tag = defineComponent(StyledElement);
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  const firstStyle = element.shadowRoot.querySelector('style[data-pey-stylesheet]');
  assert.ok(firstStyle.textContent.includes('#a'), 'first href applies its own sheet');

  currentHref = second;
  element.requestRender();
  await flush();

  const styles = element.shadowRoot.querySelectorAll('style[data-pey-stylesheet]');
  assert.equal(styles.length, 1, 'the changed href must not duplicate the stylesheet');
  assert.ok(styles[0].textContent.includes('#b'), 'the changed href must not reuse the previous sheet text');
  element.remove();
});

test('should_apply_stylesheet_nonce_from_the_component_hook', async () => {
  const events = createEvents();
  const href = `https://example.test/ui/assets/${nextTag()}.css`;
  await getStyleText(href, {
    preload: false,
    fetchFn: () => Promise.resolve({ ok: true, status: 200, text: async () => '#box{color:red}' }),
  });
  class StyledElement extends PeyElement {
    stylesheetHref() { return href; }
    stylesheetNonce() { return 'componentNonce'; }
    render() { return '<p>content</p>'; }
  }
  const tag = defineComponent(StyledElement);
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();

  const style = element.shadowRoot.querySelector('style[data-pey-stylesheet]');
  assert.equal(style.getAttribute('nonce'), 'componentNonce');
  element.remove();
});

test('should_retry_stylesheet_after_failure_when_requested', async () => {
  const events = createEvents();
  const href = `https://example.test/ui/assets/${nextTag()}.css`;
  let rejectFetch;
  const fetchFn = () => new Promise((resolve, reject) => { rejectFetch = reject; });
  const load = getStyleText(href, { preload: false, fetchFn });
  class StyledElement extends PeyElement {
    stylesheetHref() { return href; }
    render() { return '<p>content</p>'; }
  }
  const tag = defineComponent(StyledElement);
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  rejectFetch(new Error('offline'));
  await flush();
  await flush();
  assert.equal(element.shadowRoot.querySelector('style[data-pey-stylesheet]'), null, 'failure leaves the sheet unstyled');
  await assert.rejects(load, (error) => error.code === 'PEY_STYLESHEET_FETCH_FAILED');

  await getStyleText(href, {
    preload: false,
    fetchFn: () => Promise.resolve({ ok: true, status: 200, text: async () => '#a{}' }),
  });
  element.retryStylesheet();
  await flush();
  await flush();

  const style = element.shadowRoot.querySelector('style[data-pey-stylesheet]');
  assert.ok(style, 'retryStylesheet must re-attach the stylesheet');
  assert.ok(style.textContent.includes('#a'));
  element.remove();
});

test('should_not_schedule_a_render_for_a_superseded_stylesheet', async () => {
  const events = createEvents();
  const first = `https://example.test/ui/assets/${nextTag()}.css`;
  const second = `https://example.test/ui/assets/${nextTag()}.css`;
  let resolveFirst;
  const firstFetch = () => new Promise((resolve) => { resolveFirst = resolve; });
  const firstLoad = getStyleText(first, { preload: false, fetchFn: firstFetch });
  await getStyleText(second, {
    preload: false,
    fetchFn: () => Promise.resolve({ ok: true, status: 200, text: async () => '#b{}' }),
  });
  let currentHref = first;
  let renderCount = 0;
  class StyledElement extends PeyElement {
    stylesheetHref() { return currentHref; }
    render() { renderCount += 1; return '<p>content</p>'; }
  }
  const tag = defineComponent(StyledElement);
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();

  currentHref = second;
  element.requestRender();
  await flush();
  await flush();
  assert.ok(element.shadowRoot.querySelector('style[data-pey-stylesheet]').textContent.includes('#b'));
  const before = renderCount;

  resolveFirst({ ok: true, status: 200, text: async () => '#a{}' });
  await firstLoad;
  await flush();
  await flush();

  assert.equal(renderCount, before, 'a settlement for a superseded href must not schedule a render');
  const style = element.shadowRoot.querySelector('style[data-pey-stylesheet]');
  assert.ok(style.textContent.includes('#b'), 'the superseded sheet must not replace the current one');
  element.remove();
});

test('should_remove_stylesheet_when_href_becomes_null', async () => {
  const events = createEvents();
  const href = `https://example.test/ui/assets/${nextTag()}.css`;
  await getStyleText(href, {
    preload: false,
    fetchFn: () => Promise.resolve({ ok: true, status: 200, text: async () => '#a{}' }),
  });
  let currentHref = href;
  class StyledElement extends PeyElement {
    stylesheetHref() { return currentHref; }
    render() { return '<p>content</p>'; }
  }
  const tag = defineComponent(StyledElement);
  const element = document.createElement(tag);
  connectElement(element, events);
  document.body.append(element);
  await flush();
  assert.ok(element.shadowRoot.querySelector('style[data-pey-stylesheet]'), 'sheet applied while the href is set');

  currentHref = null;
  element.requestRender();
  await flush();

  assert.equal(
    element.shadowRoot.querySelector('style[data-pey-stylesheet]'),
    null,
    'dropping the stylesheet must clear the applied sheet',
  );
  assert.ok(element.shadowRoot.querySelector('p'), 'content keeps rendering');

  currentHref = href;
  element.requestRender();
  await flush();
  assert.ok(element.shadowRoot.querySelector('style[data-pey-stylesheet]'), 're-adding the href re-applies its sheet');
  element.remove();
});
