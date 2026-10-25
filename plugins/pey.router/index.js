// Wires the router adapter and service into Bonyan's two-phase plugin lifecycle.

import { SERVICE_NAME } from './lib/constants.js';
import { loadRouterAdapter } from './lib/adapter-loader.js';
import { createRouterService } from './lib/router-service.js';

let lifecycleControls = null;

/**
 * Prepares the configured router adapter and declared service.
 *
 * @param {object} prepareContext Bonyan preparation context.
 * @returns {Promise<Array<{name: string, object: object}>>} Declared service registrations.
 * @throws {object} Structured startup or configuration error when preparation fails.
 */
export async function prepare(prepareContext) {
  lifecycleControls = null;
  prepareContext.onDeactivated = () => lifecycleControls?.deactivate();
  prepareContext.onShutdown = async () => lifecycleControls?.shutdown();

  const adapter = await loadRouterAdapter(
    prepareContext.config.adapter,
    prepareContext.config.adapterConfig,
  );
  const router = createRouterService({
    adapter,
    basePath: prepareContext.config.basePath,
    notFoundPath: prepareContext.config.notFoundPath,
    publish: (type, data) => prepareContext.events.publish(type, data),
    reportCriticalError: prepareContext.reportCriticalError,
  });

  lifecycleControls = router;
  return [{ name: SERVICE_NAME, object: router.service }];
}

/**
 * Activates the dependency-free router plugin after service settlement.
 *
 * @param {Record<string, object>} services Bound declared dependencies; always empty here.
 * @returns {Promise<void>}
 */
export async function activate(services) {
  void services;
}
