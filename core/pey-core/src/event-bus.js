// EventBus — Pey's one-way announcement system.
// Provides publish (with events declaration check and event enrichment) and subscribe.
// Makes no guarantee about the order in which listeners run.

/**
 * Creates a new EventBus instance.
 *
 * The Event Bus is a fire-and-forget announcement system. A publisher does not
 * wait for a response and does not know who is listening. The Core enriches
 * every event with a unique ID, the source plugin name (from the manifest,
 * not runtime — cannot be forged), and a timestamp.
 *
 * @param {object} logger - The Core's internal logger for security and error events.
 * @returns {object} An object with publish and subscribe methods.
 */
export function createEventBus(logger, options = {}) {
  const { onEvent } = options;

  /** @type {Map<string, Array<{listener: Function, subscriberPlugin: string}>>} */
  const subscribers = new Map();

  /** @type {number} Counter for generating unique event IDs. */
  let eventCounter = 0;

  /**
   * Generates a unique event ID.
   *
   * @returns {string} A unique event identifier (e.g. "evt-1").
   * @private
   */
  function generateEventId() {
    eventCounter += 1;
    return `evt-${eventCounter}`;
  }

  /**
   * Returns the list of subscriptions for a given event type.
   * Creates an empty list if none exist.
   *
   * @param {string} eventType - The event type.
   * @returns {Array} The subscription list.
   * @private
   */
  function getSubscriptions(eventType) {
    if (!subscribers.has(eventType)) {
      subscribers.set(eventType, []);
    }
    return subscribers.get(eventType);
  }

  /**
   * Delivers an event to all subscribers of the given type.
   * Listener errors are caught and logged — they do not affect the publisher
   * or other listeners.
   *
   * @param {object} coreEvent - The enriched event to deliver.
   * @param {string} eventType - The event type to match subscribers against.
   * @returns {void}
   * @private
   */
  function deliverToSubscribers(coreEvent, eventType) {
    const subs = subscribers.get(eventType);
    if (!subs) {
      return;
    }

    for (const subscription of subs) {
      try {
        subscription.listener(coreEvent);
      } catch (error) {
        logger.error('LISTENER_ERROR', {
          subscriber: subscription.subscriberPlugin,
          eventType: coreEvent.type,
          error: error.message,
        });
      }
    }
  }

  return {
    /**
     * Publishes an event to all subscribers.
     *
     * The event must be declared in the publishing plugin's manifest `events`
     * section. The Core enriches the event with a unique ID, the source plugin
     * name (taken from the manifest, not runtime), and a timestamp. The source
     * cannot be forged.
     *
     * @param {{type: string, data: object}} pluginEvent - The event to publish.
     * @param {string} sourcePluginName - The name of the publishing plugin (from manifest).
     * @param {object} manifest - The publishing plugin's manifest.
     * @returns {{success: boolean, error?: string}} Success or failure with an error code.
     */
    publish(pluginEvent, sourcePluginName, manifest) {
      if (pluginEvent === null || typeof pluginEvent !== 'object' || Array.isArray(pluginEvent)) {
        return { success: false, error: 'INVALID_EVENT' };
      }

      if (typeof pluginEvent.type !== 'string' || pluginEvent.type.length === 0) {
        return { success: false, error: 'INVALID_EVENT_TYPE' };
      }

      // The Core publishes lifecycle events (e.g. pluginname:ready, core:plugin-crashed)
      // that are dynamic and cannot all be pre-declared in the Core's manifest.
      // Skip the events declaration check when the source is the Core itself.
      const isCoreSource = sourcePluginName === 'core';
      const declared = isCoreSource || manifest.events?.some((e) => e.name === pluginEvent.type);
      if (!declared) {
        logger.security('UNAUTHORIZED_EVENT', {
          sourcePlugin: sourcePluginName,
          eventType: pluginEvent.type,
        });
        return { success: false, error: 'EVENT_NOT_DECLARED_IN_MANIFEST' };
      }

      const coreEvent = {
        id: generateEventId(),
        type: pluginEvent.type,
        source: manifest.name,
        data: pluginEvent.data,
        timestamp: new Date().toISOString(),
      };

      deliverToSubscribers(coreEvent, coreEvent.type);
      deliverToSubscribers(coreEvent, '*');

      // Notify the optional onEvent hook (used by tests to capture events)
      if (typeof onEvent === 'function') {
        try {
          onEvent(coreEvent);
        } catch { /* hook error must not break startup */ }
      }

      return { success: true };
    },

    /**
     * Subscribes to an event type.
     *
     * Any plugin may listen to any event. Listening requires no special access
     * and does not need to be declared in the manifest. The wildcard `"*"`
     * subscribes to all events.
     *
     * @param {string} eventType - The event type to listen for, or `"*"` for all.
     * @param {Function} listener - The callback function `(event) => void`.
     * @param {string} subscriberPlugin - The name of the subscribing plugin (for logging).
     * @returns {Function} An unsubscribe function; call it to remove the subscription.
     */
    subscribe(eventType, listener, subscriberPlugin) {
      const subs = getSubscriptions(eventType);
      const subscription = { listener, subscriberPlugin };
      subs.push(subscription);

      return function unsubscribe() {
        const index = subs.indexOf(subscription);
        if (index !== -1) {
          subs.splice(index, 1);
        }
      };
    },
  };
}
