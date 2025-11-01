/**
 * @file Manages application configuration by merging user settings with defaults.
 */

/**
 * Default configuration values for the application.
 * This serves as a fallback if the user's config file is missing or incomplete.
 * @type {object}
 */
const DEFAULT_CONFIG = {
    appName: 'شیرازه',
    basePath: '.',
    files: {
        sidebar: 'config/sidebar.md',
        defaultPage: 'README.md',
        notFoundPage: 'config/404.md'
    },
    plugins: [],
    markdown: {
        parser: 'marked', // The default built-in parser
    },
    toc: {
        enabled: false,
        maxDepth: 3,
        title: 'فهرست مطالب',
    },
    selectors: {
        root: '#app',
        content: '.content',
        sidebarNav: '.sidebar-nav',
        sidebarToggle: '.sidebar-toggle',
    },
    sidebar: {
      enabled: true,
    },
    theme: {
        default: 'auto', // 'light', 'dark', or 'auto'
    }
};

/**
 * Deeply merges two objects. The `source` object's properties overwrite the `target`'s.
 * @param {object} target - The base object.
 * @param {object} source - The object with properties to merge in.
 * @returns {object} The merged object.
 */
function deepMerge(target, source) {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            const sourceValue = source[key];
            const targetValue = target[key];

            if (isObject(sourceValue) && isObject(targetValue)) {
                // If both values are objects, merge them recursively.
                output[key] = deepMerge(targetValue, sourceValue);
            } else {
                // Otherwise, the source value (primitive or object) overwrites the target value.
                output[key] = sourceValue;
            }
        });
    }
    return output;
}

/**
 * Helper function to check if a variable is a non-null object.
 * @param {*} item - The variable to check.
 * @returns {boolean}
 */
function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}


/**
 * Retrieves the final configuration by dynamically loading user-defined settings (if any)
 * from `config/config.js` and merging them with the default configuration.
 * @returns {Promise<object>} A promise that resolves with the final, complete configuration object.
 */
export async function getConfig() {
    try {
        // Dynamically import the user config file. This executes the script
        // and populates window.shirazeh if the file exists.
        // The path is relative to this module's location.
        await import('../../config/config.js');
    } catch (e) {
        // If the file doesn't exist or has an error, we ignore it and proceed
        // with the default settings. This makes the config file optional.
        console.info('Optional user config file (config/config.js) not found or failed to load. Using default configuration.');
    }

    const userConfig = window.shirazeh || {};
    return deepMerge(DEFAULT_CONFIG, userConfig);
}