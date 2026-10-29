// Defines shared behavioral tests for every Router adapter implementation.

import assert from 'node:assert/strict';
import test from 'node:test';
import { ROUTER_ADAPTER_METHODS } from '../../lib/constants.js';

/**
 * Registers the shared Router adapter contract tests for an implementation.
 *
 * @param {string} adapterName Stable snake-case name used in test descriptions.
 * @param {(initialPath: string) => object} createAdapter Adapter fixture factory.
 * @returns {void}
 */
export function defineRouterAdapterContract(adapterName, createAdapter) {
  test(`should_expose_contract_methods_when_${adapterName}_is_created`, () => {
    const adapter = createAdapter('/one');

    for (const methodName of ROUTER_ADAPTER_METHODS) {
      assert.equal(typeof adapter[methodName], 'function');
    }
  });

  test(`should_replace_current_path_when_${adapterName}_replace_is_called`, () => {
    const adapter = createAdapter('/one');

    adapter.replaceEntry('/replaced');

    assert.equal(adapter.getCurrentPath(), '/replaced');
  });

  test(`should_not_notify_when_${adapterName}_push_or_replace_is_called`, () => {
    const adapter = createAdapter('/one');
    const paths = [];
    adapter.onExternalChange((path) => paths.push(path));

    adapter.pushEntry('/two');
    adapter.replaceEntry('/replaced');

    assert.deepEqual(paths, []);
  });

  test(`should_notify_once_when_${adapterName}_back_changes_path`, () => {
    const adapter = createAdapter('/one');
    const paths = [];
    adapter.pushEntry('/two');
    adapter.onExternalChange((path) => paths.push(path));

    adapter.goBack();

    assert.deepEqual(paths, ['/one']);
  });

  test(`should_notify_once_when_${adapterName}_forward_changes_path`, () => {
    const adapter = createAdapter('/one');
    const paths = [];
    adapter.pushEntry('/two');
    adapter.goBack();
    adapter.onExternalChange((path) => paths.push(path));

    adapter.goForward();

    assert.deepEqual(paths, ['/two']);
  });

  test(`should_not_notify_when_${adapterName}_back_is_noop`, () => {
    const adapter = createAdapter('/one');
    const paths = [];
    adapter.onExternalChange((path) => paths.push(path));

    adapter.goBack();

    assert.deepEqual(paths, []);
  });

  test(`should_not_notify_when_${adapterName}_forward_is_noop`, () => {
    const adapter = createAdapter('/one');
    const paths = [];
    adapter.onExternalChange((path) => paths.push(path));

    adapter.goForward();

    assert.deepEqual(paths, []);
  });
}
