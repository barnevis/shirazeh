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
    logo: {
        enabled: false,
        src: '',
        size: '32px',
        appNameFontSize: '1.5rem',
    },
    favicon: {
        enabled: true,
        src: '', // If empty, it will try to use the logo.src
        type: 'auto'
    },
    basePath: '.',
    files: {
        sidebar: 'config/sidebar.md',
        defaultPage: 'README.md',
        notFoundPage: 'config/404.md'
    },
    plugins: [],
    markdown: {
        parser: 'parsneshan', // The default built-in parser
        parserOptions: {
            plugins: []
        }
    },
    font: {
      baseSize: '16px',
      lineHeight: 1.7,
      custom: {
          enabled: false,
          path: 'config/fonts/fonts.css',
          family: '',
          codeFamily: ''
      }
    },
    toc: {
        enabled: false,
        maxDepth: 3,
        title: 'فهرست مطالب',
    },
    githubCorner: {
        enabled: false,
        url: '',
        position: 'top-right',
        size: '80px',
        backgroundColor: '',
        iconColor: ''
    },
    title: {
        enabled: true,
        includeWiki: true,
        order: 'page-first', // 'wiki-first', 'page-first', 'page-only'
        separator: ' | ',
        sourcePriority: ['sidebarTitle', 'sidebarLabel', 'h1', 'filename', 'fallback'],
        fallback: 'بدون عنوان'
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
    },
    remote: {
        enabled: false,
        corsProxyUrl: '' // e.g., 'https://api.allorigins.win/raw?url='
    },
    codeCopy: {
        buttonText: 'رونوشت',
        successText: 'رونوشت شد',
        errorText: 'خطا',
        successDuration: 2000,
    },
    headingAnchor: {
        enabled: true,
        levels: [2, 3, 4, 5, 6],
        icon: '#',
        successMessage: 'پیوند رونوشت شد',
        messageDuration: 2000,
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

            // اگر هر دو مقدار شیء باشن (و آرایه نباشن)، به صورت بازشتی ادغام کن
            if (isObject(sourceValue) && isObject(targetValue) && !Array.isArray(sourceValue)) {
                output[key] = deepMerge(targetValue, sourceValue);
            } else {
                // در غیر این صورت (اگر نوع‌ها متفاوت باشن یا یکی از اونها شیء نباشه)،
                // مقدار جدید (source) رو جایگزین قبلی کن.
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
