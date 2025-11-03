/**
 * @file Manages the theme and fonts of the application.
 */

const STORAGE_KEY = 'shirazeh-theme';
const TYPOGRAPHY_STYLE_ID = 'shirazeh-typography';

export class ThemeManager {
    /**
     * @param {object} config - The application configuration object.
     */
    constructor(config) {
        this.themeConfig = config.theme || {};
        this.fontConfig = config.font || {};
        this.app = null; // Will be set in init()
        this.toggleButton = null;
    }

    /**
     * Initializes the theme and font manager.
     * @param {App} appInstance - The main application instance.
     */
    async init(appInstance) {
        this.app = appInstance;
        await this._initFonts(); // This now handles everything font-related
        this._setupToggleButton();
        const initialTheme = this._getInitialTheme();
        this.applyTheme(initialTheme);
        this._applyCustomColors();

        // Listen for system theme changes if the user hasn't made a choice yet
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            const savedPreference = localStorage.getItem(STORAGE_KEY);
            // Only update if no manual preference is saved and config is 'auto'
            if (!savedPreference && this._getConfigDefault() === 'auto') {
                const newTheme = e.matches ? 'dark' : 'light';
                this.applyTheme(newTheme, false); // Don't save, it's still auto
            }
        });
    }
    
    /**
     * Initializes font settings, loading custom or default fonts and applying all typography variables.
     * @private
     */
    async _initFonts() {
        const useCustomFont = this.fontConfig.custom && this.fontConfig.custom.enabled;
        let fontFaces = '';
        let fontVariables = {};
        
        const generateDefaultFont = () => {
            const fontPath = this.app.resolvePath('src/lib/vendor/fonts/vazirmatn');
            this._preloadDefaultFonts(fontPath); // Preload fonts for smoother rendering
            fontFaces = `
@font-face {
  font-family: 'Vazirmatn';
  src: url('${fontPath}/Vazirmatn-Regular.woff2') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Vazirmatn';
  src: url('${fontPath}/Vazirmatn-Medium.woff2') format('woff2');
  font-weight: 500; font-style: normal; font-display: swap;
}
@font-face {
  font-family: 'Vazirmatn';
  src: url('${fontPath}/Vazirmatn-Bold.woff2') format('woff2');
  font-weight: 700; font-style: normal; font-display: swap;
}`;
            fontVariables = this._getFontVariablesConfig(false);
        };

        if (useCustomFont) {
            try {
                await this._loadCustomFont();
                fontVariables = this._getFontVariablesConfig(true); // Apply custom fonts
            } catch (error) {
                console.error(error.message);
                console.warn('Falling back to default font.');
                generateDefaultFont(); // Fallback to default on error
            }
        } else {
            generateDefaultFont(); // Apply default fonts
        }
        
        this._injectTypographyStyles(fontFaces, fontVariables);
    }
    
    /**
     * Preloads the default Vazirmatn font files to improve rendering performance.
     * @param {string} fontPath - The resolved path to the font directory.
     * @private
     */
    _preloadDefaultFonts(fontPath) {
        const fontFiles = [
            'Vazirmatn-Regular.woff2',
            'Vazirmatn-Medium.woff2',
            'Vazirmatn-Bold.woff2'
        ];

        fontFiles.forEach(file => {
            const fullPath = `${fontPath}/${file}`;
            
            // Prevent duplicate preloads
            if (document.querySelector(`link[rel="preload"][href="${fullPath}"]`)) {
                return;
            }

            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = fullPath;
            link.as = 'font';
            link.type = 'font/woff2';
            link.crossOrigin = ''; // Use anonymous crossorigin for fonts
            document.head.appendChild(link);
        });
    }

    /**
     * Loads the custom font CSS file specified in the config.
     * @returns {Promise<void>} A promise that resolves on success or rejects on failure.
     * @private
     */
    _loadCustomFont() {
        return new Promise((resolve, reject) => {
            const customFont = this.fontConfig.custom;
            if (!customFont.path) {
                return reject(new Error('Custom font is enabled, but no path is provided in config.'));
            }
            if (!customFont.family) {
                return reject(new Error('Custom font is enabled, but no `family` is specified in config.'));
            }
            
            const cssPath = this.app.resolvePath(customFont.path);
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = cssPath;
            link.onload = () => resolve();
            link.onerror = () => reject(new Error(`Failed to load custom font CSS file from: ${cssPath}`));
            document.head.appendChild(link);
        });
    }
    
    /**
     * Gets an object with all typography CSS variables based on config.
     * @param {boolean} useCustom - Whether to use custom font families or the defaults.
     * @returns {object} An object of CSS variables and their values.
     * @private
     */
    _getFontVariablesConfig(useCustom) {
        const fontConfig = this.fontConfig;
        
        const mainFamily = useCustom
            ? `"${fontConfig.custom.family}", sans-serif`
            : "'Vazirmatn', sans-serif";
            
        const codeFamily = useCustom && fontConfig.custom.codeFamily
            ? `"${fontConfig.custom.codeFamily}", monospace`
            : 'monospace';

        return {
            '--font-family-main': mainFamily,
            '--font-family-code': codeFamily,
            '--font-size-base': fontConfig.baseSize || '16px',
            '--line-height-base': fontConfig.lineHeight || 1.7,
        };
    }

    /**
     * Injects a single style tag into the head to define all typography styles.
     * Updates the tag if it already exists.
     * @param {string} fontFaces - The string containing all @font-face rules.
     * @param {object} fontVariables - The object of CSS variables for typography.
     * @private
     */
    _injectTypographyStyles(fontFaces, fontVariables) {
        const variablesString = Object.entries(fontVariables)
            .map(([key, value]) => `    ${key}: ${value};`)
            .join('\n');

        const styleContent = `
${fontFaces.trim()}

:root {
${variablesString}
}
        `.trim();
        
        let styleEl = document.getElementById(TYPOGRAPHY_STYLE_ID);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = TYPOGRAPHY_STYLE_ID;
            document.head.appendChild(styleEl);
        }
        
        styleEl.textContent = styleContent;
    }


    /**
     * Determines the initial theme based on storage, config, and system preference.
     * @returns {string} 'light' or 'dark'
     * @private
     */
    _getInitialTheme() {
        const savedPreference = localStorage.getItem(STORAGE_KEY);
        if (savedPreference) {
            return savedPreference;
        }

        const configDefault = this._getConfigDefault();
        if (configDefault === 'light' || configDefault === 'dark') {
            return configDefault;
        }

        // 'auto' or undefined
        return this._getSystemPreference();
    }

    /**
     * Gets the default theme from the config.
     * @returns {string} 'light', 'dark', or 'auto'.
     * @private
     */
    _getConfigDefault() {
        return this.themeConfig.default || 'auto';
    }

    /**
     * Gets the user's system theme preference.
     * @returns {string} 'light' or 'dark'.
     * @private
     */
    _getSystemPreference() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    /**
     * Creates and appends the theme toggle button.
     * @private
     */
    _setupToggleButton() {
        this.toggleButton = document.createElement('button');
        this.toggleButton.className = 'theme-toggle';
        this.toggleButton.setAttribute('type', 'button');
        
        // Add SVG icons for better visuals
        this.toggleButton.innerHTML = `
            <span class="icon-sun">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
            </span>
            <span class="icon-moon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
            </span>
        `;
        
        document.body.appendChild(this.toggleButton);

        this.toggleButton.addEventListener('click', () => this.toggleTheme());
    }
    
    /**
     * Applies a specific theme.
     * @param {string} themeName - 'light' or 'dark'.
     * @param {boolean} [save=true] - Whether to save the preference to localStorage.
     */
    applyTheme(themeName, save = true) {
        document.documentElement.setAttribute('data-theme', themeName);
        if (save) {
            localStorage.setItem(STORAGE_KEY, themeName);
        }
        this._updateToggleButton(themeName);
    }
    
    /**
     * Toggles between light and dark themes.
     */
    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || this._getSystemPreference();
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.applyTheme(newTheme);
    }

    /**
     * Updates the toggle button's aria-label and visible icon.
     * @param {string} currentTheme - The currently active theme.
     * @private
     */
    _updateToggleButton(currentTheme) {
        if (!this.toggleButton) return;
        const isDark = currentTheme === 'dark';
        const label = isDark ? 'تغییر به تم روشن' : 'تغییر به تم تاریک';
        this.toggleButton.setAttribute('aria-label', label);
    }

    /**
     * Applies custom theme colors from config as CSS variables.
     * @private
     */
    _applyCustomColors() {
        const root = document.documentElement;
        // Exclude the 'default' key from being processed as a color
        const { default: _, ...colors } = this.themeConfig; 

        for (const [key, value] of Object.entries(colors)) {
            // Convert camelCase key (e.g., primaryColor) to kebab-case CSS variable (e.g., --primary-color)
            const cssVarName = `--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
            root.style.setProperty(cssVarName, value);
        }
    }
}