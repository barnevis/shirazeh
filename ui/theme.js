// Theme controller for the Shirazeh UI.
// Owns the light/dark/auto policy so the navbar button and the entry point
// share one source of truth: 'auto' follows the system color scheme (with a
// live listener) until the user makes an explicit choice; explicit choices
// win and stop the auto-following.

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Resolves the effective theme from a configured value.
 *
 * @param {string} configuredTheme Configured value: 'light' | 'dark' | 'auto'.
 * @param {{matches: boolean}} media System color-scheme media handle.
 * @returns {'light'|'dark'} Effective theme.
 */
export function resolveTheme(configuredTheme, media) {
  if (configuredTheme === 'dark') {
    return 'dark';
  }
  if (configuredTheme === 'auto' && media !== null && typeof media === 'object' && media.matches === true) {
    return 'dark';
  }
  return 'light';
}

/**
 * Creates the theme controller for one running UI.
 *
 * @param {object} options Controller options.
 * @param {string} options.initialTheme Configured theme ('light'|'dark'|'auto').
 * @param {object|null} options.sharedState Shared state facade (theme key).
 * @param {object} options.documentElement Element receiving the data-theme attribute.
 * @param {Function|null} [options.matchMedia] Media query factory, injectable for tests.
 * @returns {object} Frozen controller: { applyInitial, setTheme, toggle, currentTheme }.
 */
export function createThemeController({
  initialTheme,
  sharedState = null,
  documentElement,
  matchMedia = null,
}) {
  if (typeof documentElement?.setAttribute !== 'function') {
    throw new TypeError('documentElement must expose setAttribute');
  }

  let appliedTheme = null;
  let userChoice = null;
  let unsubscribeMedia = null;

  function apply(theme) {
    appliedTheme = theme;
    documentElement.setAttribute('data-theme', theme);
    if (sharedState !== null && typeof sharedState.set === 'function') {
      sharedState.set('theme', theme);
    }
  }

  /** Applies the configured (or system) theme and starts auto-following. */
  function applyInitial() {
    const configured = userChoice ?? initialTheme ?? 'light';

    if (configured !== 'auto') {
      apply(resolveTheme(configured, null));
      return;
    }

    const media = typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : null;
    apply(resolveTheme('auto', media));

    if (media !== null && typeof media.addEventListener === 'function') {
      const onChange = () => {
        if (userChoice === null) {
          apply(resolveTheme('auto', media));
        }
      };
      media.addEventListener('change', onChange);
      unsubscribeMedia = () => media.removeEventListener('change', onChange);
    }
  }

  /** Records an explicit user choice; auto-following stops. */
  function setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') {
      return;
    }
    userChoice = theme;
    apply(theme);
  }

  /** Flips between light and dark from the user. */
  function toggle() {
    setTheme(appliedTheme === 'dark' ? 'light' : 'dark');
  }

  return Object.freeze({
    applyInitial,
    setTheme,
    toggle,
    /** @returns {'light'|'dark'|null} Current effective theme. */
    currentTheme: () => appliedTheme,
    /** @returns {Function} Detaches the system listener (used on shutdown). */
    dispose: () => {
      unsubscribeMedia?.();
      unsubscribeMedia = null;
    },
  });
}
