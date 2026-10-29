// Verifies the UI-local shared state store contract.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSharedState } from '../shared-state.js';

const MAX_JSON_DEPTH = 100;

function assertRejectsValue(store, value) {
  assert.throws(
    () => store.set('key', value),
    (error) => error.code === 'PEY_SHARED_STATE_INVALID_VALUE',
  );
}

function createNestedContainers(count) {
  let value = 'leaf';
  for (let i = 0; i < count; i += 1) value = [value];
  return value;
}

test('should_return_undefined_when_key_is_unset', () => {
  const store = createSharedState();
  assert.equal(store.get('missing'), undefined);
});

test('should_accept_strict_json_compatible_values', () => {
  const store = createSharedState();
  const values = [
    null,
    true,
    false,
    0,
    -1,
    3.14,
    'text',
    '',
    [],
    [1, 'a', null, { b: [2] }],
    {},
    { a: 1, b: { c: [null, true] } },
  ];
  for (const value of values) {
    assert.doesNotThrow(() => store.set('key', value));
  }
});

test('should_reject_non_json_compatible_values', () => {
  const store = createSharedState();
  const values = [
    undefined,
    () => {},
    Symbol('symbol'),
    10n,
    NaN,
    Infinity,
    -Infinity,
    new Date(),
    new Map(),
    new Set(),
    /regex/,
    new (class Example {})(),
    { nested: [undefined] },
  ];
  for (const value of values) {
    assertRejectsValue(store, value);
  }
});

test('should_reject_cyclic_structures', () => {
  const store = createSharedState();

  const cyclicObject = {};
  cyclicObject.self = cyclicObject;
  assertRejectsValue(store, cyclicObject);

  const cyclicArray = [];
  cyclicArray.push(cyclicArray);
  assertRejectsValue(store, cyclicArray);
});

test('should_accept_values_at_the_maximum_container_depth', () => {
  const store = createSharedState();
  for (const count of [MAX_JSON_DEPTH - 1, MAX_JSON_DEPTH]) {
    assert.doesNotThrow(() => store.set('key', createNestedContainers(count)));
  }
});

test('should_reject_values_deeper_than_the_maximum_container_depth', () => {
  const store = createSharedState();
  for (const count of [MAX_JSON_DEPTH + 1, MAX_JSON_DEPTH + 2]) {
    assertRejectsValue(store, createNestedContainers(count));
  }
});

test('should_reject_empty_untrimmed_and_non_string_keys', () => {
  const store = createSharedState();
  const invalidKeys = ['', '   ', ' key ', '\tkey', 42, null, undefined, {}, []];
  for (const key of invalidKeys) {
    assert.throws(() => store.set(key, 1), (error) => error.code === 'PEY_SHARED_STATE_INVALID_KEY');
    assert.throws(() => store.get(key), (error) => error.code === 'PEY_SHARED_STATE_INVALID_KEY');
    assert.throws(() => store.subscribe(key, () => {}), (error) => error.code === 'PEY_SHARED_STATE_INVALID_KEY');
  }
});

test('should_allow_internal_whitespace_in_keys', () => {
  const store = createSharedState();
  assert.doesNotThrow(() => store.set('my key', 1));
  assert.equal(store.get('my key'), 1);
});

test('should_reject_non_function_listeners', () => {
  const store = createSharedState();
  for (const listener of [null, undefined, 'callback', 42, {}]) {
    assert.throws(
      () => store.subscribe('key', listener),
      (error) => error.code === 'PEY_SHARED_STATE_INVALID_LISTENER',
    );
  }
});

test('should_notify_subscribers_with_the_new_value', () => {
  const store = createSharedState();
  let received = null;
  store.subscribe('key', (value) => { received = value; });

  const value = { a: 1 };
  store.set('key', value);

  assert.equal(received, value);
});

test('should_not_notify_when_the_value_is_equal', () => {
  const store = createSharedState();
  let notifications = 0;
  store.subscribe('key', () => { notifications += 1; });

  store.set('key', 'same');
  store.set('key', 'same');
  store.set('key', 42);
  store.set('key', 42);

  assert.equal(notifications, 2);
});

test('should_notify_when_an_object_or_array_is_replaced', () => {
  const store = createSharedState();
  let notifications = 0;
  store.subscribe('key', () => { notifications += 1; });

  store.set('key', { a: 1 });
  store.set('key', { a: 1 });
  store.set('key', [1]);
  store.set('key', [1]);

  assert.equal(notifications, 4);
});

test('should_notify_only_subscribers_of_the_same_key', () => {
  const store = createSharedState();
  let forA = 0;
  let forB = 0;
  store.subscribe('a', () => { forA += 1; });
  store.subscribe('b', () => { forB += 1; });

  store.set('a', 1);
  store.set('b', 2);
  store.set('a', 3);

  assert.equal(forA, 2);
  assert.equal(forB, 1);
});

test('should_stop_notifications_and_be_idempotent_when_unsubscribed', () => {
  const store = createSharedState();
  let notifications = 0;
  const unsubscribe = store.subscribe('key', () => { notifications += 1; });

  unsubscribe();
  unsubscribe();

  store.set('key', 1);
  assert.equal(notifications, 0);
});

test('should_keep_the_passed_reference_without_cloning_or_freezing', () => {
  const store = createSharedState();
  const value = { items: [1, 2] };

  store.set('payload', value);

  assert.equal(store.get('payload'), value);
  assert.equal(Object.isFrozen(store.get('payload')), false);
});

test('should_register_the_same_listener_once_per_key', () => {
  const store = createSharedState();
  let notifications = 0;
  const listener = () => { notifications += 1; };
  const unsubscribe = store.subscribe('key', listener);
  store.subscribe('key', listener);

  store.set('key', 1);
  unsubscribe();
  store.set('key', 2);

  assert.equal(notifications, 1);
});

test('should_isolate_a_throwing_listener', () => {
  const store = createSharedState();
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => { logged.push(args.join(' ')); };

  try {
    let notified = 0;
    store.subscribe('key', () => { throw new Error('listener boom'); });
    store.subscribe('key', () => { notified += 1; });

    assert.doesNotThrow(() => store.set('key', 1));
    assert.equal(notified, 1);
    assert.equal(logged.length, 1);
    assert.equal(logged[0], '[pey.webui] PEY_SHARED_STATE_LISTENER_FAILED');
  } finally {
    console.error = originalError;
  }
});

test('should_release_state_and_subscribers_when_cleared', () => {
  const store = createSharedState();
  let notifications = 0;
  store.subscribe('a', () => { notifications += 1; });
  store.subscribe('b', () => { notifications += 1; });

  store.set('a', 1);
  store.set('b', 2);
  store.clear();
  assert.equal(store.get('a'), undefined);

  store.set('a', 3);
  assert.equal(notifications, 2);
});

test('should_remain_safe_after_clear_when_unsubscribed', () => {
  const store = createSharedState();
  let notifications = 0;
  const unsubscribe = store.subscribe('key', () => { notifications += 1; });

  store.clear();

  assert.doesNotThrow(() => unsubscribe());
  store.set('key', 1);
  assert.equal(notifications, 0);
});