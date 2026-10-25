// Provides a deterministic in-memory implementation of the Router adapter contract.

function assertPath(path) {
  if (typeof path !== 'string') {
    throw new TypeError('In-memory router paths must be strings');
  }
}

/**
 * Creates an in-memory Router adapter for service and integration tests.
 *
 * @param {string} [initialPath='/'] Initial raw history path.
 * @returns {object} Router adapter plus a test-only external-change helper.
 */
export function createInMemoryRouterAdapter(initialPath = '/') {
  assertPath(initialPath);

  let entries = [initialPath];
  let currentIndex = 0;
  let externalChangeListener = null;

  function notifyExternalChange() {
    externalChangeListener?.(entries[currentIndex]);
  }

  function pushEntry(rawPath) {
    assertPath(rawPath);
    entries = entries.slice(0, currentIndex + 1);
    entries.push(rawPath);
    currentIndex += 1;
  }

  function replaceEntry(rawPath) {
    assertPath(rawPath);
    entries[currentIndex] = rawPath;
  }

  function goBack() {
    if (currentIndex === 0) {
      return;
    }

    currentIndex -= 1;
    notifyExternalChange();
  }

  function goForward() {
    if (currentIndex === entries.length - 1) {
      return;
    }

    currentIndex += 1;
    notifyExternalChange();
  }

  return {
    getCurrentPath() {
      return entries[currentIndex];
    },

    pushEntry,
    replaceEntry,
    goBack,
    goForward,

    onExternalChange(callback) {
      if (typeof callback !== 'function') {
        throw new TypeError('External change callback must be a function');
      }

      externalChangeListener = callback;
      return () => {
        if (externalChangeListener === callback) {
          externalChangeListener = null;
        }
      };
    },

    simulateExternalChange(rawPath) {
      assertPath(rawPath);
      entries[currentIndex] = rawPath;
      notifyExternalChange();
    },
  };
}
