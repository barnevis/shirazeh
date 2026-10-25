// Verifies the application-owned setup lifecycle helper.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createApplicationSetup } from '../../shell/create-application-setup.js';

function createContext(overrides = {}) {
  const listeners = new Map();
  const events = {
    publish: () => ({ success: true }),
    subscribe(type, listener) {
      listeners.set(type, listener);
      return () => listeners.delete(type);
    },
  };

  return {
    context: {
      services: { 'pey.router.service': {} },
      events,
      config: {},
      onShutdown: null,
      ...overrides,
    },
    listeners,
  };
}

test('should_mount_once_when_context_is_valid', async () => {
  let mountCount = 0;
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    mountShell: () => { mountCount += 1; },
  });
  const { context } = createContext();

  await setup(context);

  assert.equal(mountCount, 1);
  assert.equal(typeof context.onShutdown, 'function');
});

test('should_expose_null_when_optional_service_is_absent', async () => {
  let optionalServices = null;
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    optionalServices: ['example.optional.service'],
    mountShell: ({ optional }) => { optionalServices = optional; },
  });
  const { context } = createContext();

  await setup(context);

  assert.equal(optionalServices['example.optional.service'], null);
});

test('should_expose_required_services_and_event_bus_to_mount_policy', async () => {
  const accountsService = {};
  let resources = null;
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    requiredServices: ['example.accounts.service'],
    mountShell: (receivedResources) => { resources = receivedResources; },
  });
  const created = createContext();
  created.context.services['example.accounts.service'] = accountsService;

  await setup(created.context);

  assert.equal(resources.required['example.accounts.service'], accountsService);
  assert.equal(resources.events, created.context.events);
});

test('should_reject_with_stable_error_when_router_is_absent', async () => {
  const setup = createApplicationSetup({ assetBaseUrlBase: import.meta.url });
  const { context } = createContext({ services: {} });

  await assert.rejects(
    setup(context),
    (error) => error.code === 'PEY_WEBUI_REQUIRED_SERVICE_UNAVAILABLE',
  );
});

test('should_notify_without_cleanup_when_core_shutdown_is_published', async () => {
  let notificationCount = 0;
  let cleanupCount = 0;
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    onCoreShutdown: () => { notificationCount += 1; },
    cleanup: () => { cleanupCount += 1; },
  });
  const { context, listeners } = createContext();
  await setup(context);

  listeners.get('core:shutdown')({ type: 'core:shutdown', data: {} });

  assert.equal(notificationCount, 1);
  assert.equal(cleanupCount, 0);
});

test('should_cleanup_once_when_shutdown_is_called_repeatedly', async () => {
  let cleanupCount = 0;
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    cleanup: () => { cleanupCount += 1; },
  });
  const { context, listeners } = createContext();
  await setup(context);

  context.onShutdown();
  context.onShutdown();

  assert.equal(cleanupCount, 1);
  assert.equal(listeners.has('core:shutdown'), false);
});

test('should_allow_restart_after_shutdown', async () => {
  let mountCount = 0;
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    mountShell: () => { mountCount += 1; },
  });
  const first = createContext();
  const second = createContext();
  await setup(first.context);
  first.context.onShutdown();

  await setup(second.context);

  assert.equal(mountCount, 2);
});

test('should_reject_second_setup_when_ui_is_active', async () => {
  const setup = createApplicationSetup({ assetBaseUrlBase: import.meta.url });
  const first = createContext();
  const second = createContext();
  await setup(first.context);

  await assert.rejects(
    setup(second.context),
    (error) => error.code === 'PEY_WEBUI_ALREADY_STARTED',
  );
});

test('should_resolve_asset_base_against_application_entry_point', async () => {
  let assetBaseUrl = null;
  const setup = createApplicationSetup({
    assetBaseUrlBase: 'https://example.test/ui/index.js',
    mountShell: ({ config }) => { assetBaseUrl = config.assetBaseUrl; },
  });
  const { context } = createContext({ config: { assetBaseUrl: './assets' } });

  await setup(context);

  assert.equal(assetBaseUrl, 'https://example.test/ui/assets/');
});

test('should_cleanup_mounted_shell_when_subscription_fails', async () => {
  let cleanupCount = 0;
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    cleanup: () => { cleanupCount += 1; },
  });
  const { context } = createContext({
    events: {
      publish: () => ({ success: true }),
      subscribe: () => { throw new Error('Subscription failed'); },
    },
  });

  await assert.rejects(setup(context), /Subscription failed/);

  assert.equal(cleanupCount, 1);
});

test('should_preserve_startup_error_when_rollback_cleanup_throws', async (testContext) => {
  const consoleError = testContext.mock.method(console, 'error', () => undefined);
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    cleanup: () => { throw new Error('Cleanup failed'); },
  });
  const { context } = createContext({
    events: {
      publish: () => ({ success: true }),
      subscribe: () => { throw new Error('Subscription failed'); },
    },
  });

  await assert.rejects(setup(context), /Subscription failed/);

  assert.equal(consoleError.mock.callCount(), 1);
  assert.match(consoleError.mock.calls[0].arguments[0], /startup cleanup failed/);
});

test('should_reject_with_stable_error_when_event_bus_is_invalid', async () => {
  const setup = createApplicationSetup({ assetBaseUrlBase: import.meta.url });
  const { context } = createContext({ events: {} });

  await assert.rejects(
    setup(context),
    (error) => error.code === 'PEY_WEBUI_INVALID_EVENT_BUS',
  );
});

test('should_reject_with_stable_error_when_config_is_invalid', async () => {
  const setup = createApplicationSetup({ assetBaseUrlBase: import.meta.url });
  const { context } = createContext({ config: { direction: 'sideways' } });

  await assert.rejects(
    setup(context),
    (error) => error.code === 'PEY_WEBUI_INVALID_CONFIG',
  );
});

test('should_reject_when_event_bus_does_not_return_unsubscribe', async () => {
  const setup = createApplicationSetup({ assetBaseUrlBase: import.meta.url });
  const { context } = createContext({
    events: {
      publish: () => ({ success: true }),
      subscribe: () => undefined,
    },
  });

  await assert.rejects(
    setup(context),
    (error) => error.code === 'PEY_WEBUI_INVALID_EVENT_BUS',
  );
});

test('should_reject_when_mount_policy_is_async', async () => {
  let cleanupCount = 0;
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    mountShell: async () => undefined,
    cleanup: () => { cleanupCount += 1; },
  });
  const { context } = createContext();

  await assert.rejects(
    setup(context),
    (error) => error.code === 'PEY_WEBUI_ASYNC_LIFECYCLE_NOT_SUPPORTED',
  );
  assert.equal(cleanupCount, 1);
});

test('should_reject_reentrant_setup_when_mount_is_running', async () => {
  let reentrantResult = null;
  const second = createContext();
  let setup;
  setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    mountShell: () => { reentrantResult = setup(second.context); },
  });
  const first = createContext();

  await setup(first.context);

  await assert.rejects(
    reentrantResult,
    (error) => error.code === 'PEY_WEBUI_ALREADY_STARTED',
  );
});

test('should_consume_rejected_async_mount_policy', async () => {
  let rejectMount;
  const mountResult = new Promise((resolve, reject) => {
    void resolve;
    rejectMount = reject;
  });
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    mountShell: () => mountResult,
  });
  const { context } = createContext();

  await assert.rejects(
    setup(context),
    (error) => error.code === 'PEY_WEBUI_ASYNC_LIFECYCLE_NOT_SUPPORTED',
  );
  rejectMount(new Error('Late mount rejection'));
  await new Promise((resolve) => setImmediate(resolve));
});

test('should_contain_error_when_core_shutdown_notification_throws', async (testContext) => {
  const consoleError = testContext.mock.method(console, 'error', () => undefined);
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    onCoreShutdown: () => { throw new Error('Notification failed'); },
  });
  const { context, listeners } = createContext();
  await setup(context);

  assert.doesNotThrow(() => {
    listeners.get('core:shutdown')({ type: 'core:shutdown', data: {} });
  });
  assert.equal(consoleError.mock.callCount(), 1);
});

test('should_reject_and_consume_async_core_shutdown_notification', async (testContext) => {
  const consoleError = testContext.mock.method(console, 'error', () => undefined);
  let rejectNotification;
  const notification = new Promise((resolve, reject) => {
    void resolve;
    rejectNotification = reject;
  });
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    onCoreShutdown: () => notification,
  });
  const { context, listeners } = createContext();
  await setup(context);

  listeners.get('core:shutdown')({ type: 'core:shutdown', data: {} });
  rejectNotification(new Error('Late notification rejection'));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(consoleError.mock.callCount(), 1);
});

test('should_reject_when_service_name_is_invalid', () => {
  assert.throws(
    () => createApplicationSetup({
      assetBaseUrlBase: import.meta.url,
      optionalServices: [null],
    }),
    (error) => error.code === 'PEY_WEBUI_INVALID_SETUP_POLICY',
  );
});

test('should_reject_when_service_name_has_surrounding_whitespace', () => {
  assert.throws(
    () => createApplicationSetup({
      assetBaseUrlBase: import.meta.url,
      optionalServices: [' example.optional.service '],
    }),
    (error) => error.code === 'PEY_WEBUI_INVALID_SETUP_POLICY',
  );
});

test('should_reject_with_stable_error_when_required_services_is_not_array', () => {
  assert.throws(
    () => createApplicationSetup({
      assetBaseUrlBase: import.meta.url,
      requiredServices: {},
    }),
    (error) => error.code === 'PEY_WEBUI_INVALID_SETUP_POLICY',
  );
});

test('should_reject_when_service_is_required_and_optional', () => {
  assert.throws(
    () => createApplicationSetup({
      assetBaseUrlBase: import.meta.url,
      requiredServices: ['example.accounts.service'],
      optionalServices: ['example.accounts.service'],
    }),
    (error) => error.code === 'PEY_WEBUI_INVALID_SETUP_POLICY',
  );
});

test('should_reject_when_router_is_declared_optional', () => {
  assert.throws(
    () => createApplicationSetup({
      assetBaseUrlBase: import.meta.url,
      optionalServices: ['pey.router.service'],
    }),
    (error) => error.code === 'PEY_WEBUI_INVALID_SETUP_POLICY',
  );
});

test('should_reject_when_config_string_is_whitespace', async () => {
  const setup = createApplicationSetup({ assetBaseUrlBase: import.meta.url });
  const { context } = createContext({ config: { theme: '   ' } });

  await assert.rejects(
    setup(context),
    (error) => error.code === 'PEY_WEBUI_INVALID_CONFIG',
  );
});

test('should_trim_shared_config_strings_when_context_is_valid', async () => {
  let resolvedConfig = null;
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    mountShell: ({ config }) => { resolvedConfig = config; },
  });
  const { context } = createContext({
    config: {
      theme: ' dark ',
      language: ' fa ',
      fallbackPath: ' /home ',
    },
  });

  await setup(context);

  assert.equal(resolvedConfig.theme, 'dark');
  assert.equal(resolvedConfig.language, 'fa');
  assert.equal(resolvedConfig.fallbackPath, '/home');
});

test('should_reject_when_shutdown_hook_is_already_assigned', async () => {
  const setup = createApplicationSetup({ assetBaseUrlBase: import.meta.url });
  const { context } = createContext({ onShutdown: () => undefined });

  await assert.rejects(
    setup(context),
    (error) => error.code === 'PEY_WEBUI_INVALID_CONTEXT',
  );
});

test('should_allow_restart_after_cleanup_throws', async () => {
  let mountCount = 0;
  let shouldThrow = true;
  const setup = createApplicationSetup({
    assetBaseUrlBase: import.meta.url,
    mountShell: () => { mountCount += 1; },
    cleanup: () => {
      if (shouldThrow) throw new Error('Cleanup failed');
    },
  });
  const first = createContext();
  await setup(first.context);

  assert.throws(first.context.onShutdown, /Cleanup failed/);
  shouldThrow = false;
  const second = createContext();
  await setup(second.context);

  assert.equal(mountCount, 2);
});
