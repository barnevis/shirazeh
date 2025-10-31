/**
 * @file Manages the theme of the application (light/dark mode).
 */
import { getElement } from './domRenderer.js';

const STORAGE_KEY = 'shirazeh-theme';

export class ThemeManager {
    /**
     * @param {object} config - The application configuration object.
     */
    constructor(config) {
        this.config = config.theme || {};
        this.toggleButton = null;
    }

    /**
     * Initializes the theme manager.
     */
    init() {
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
        return this.config.default || 'auto';
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
        
        // ===================================
        //     ↓↓↓ فقط این خط تغییر کرده ↓↓↓
        // ===================================
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
        const { default: _, ...colors } = this.config; 

        for (const [key, value] of Object.entries(colors)) {
            // Convert camelCase key (e.g., primaryColor) to kebab-case CSS variable (e.g., --primary-color)
            const cssVarName = `--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
            root.style.setProperty(cssVarName, value);
        }
    }
}
