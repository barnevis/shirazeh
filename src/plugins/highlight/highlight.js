/**
 * @file Syntax Highlighting Plugin for Shirazeh using Highlight.js.
 */
import { injectCSS } from '../../core/pluginManager.js';

export default class HighlightPlugin {
    onInit(app) {
        this.app = app;
        this.config = app.config.highlight || {};
        this.isLoaded = false;
        this.initPromise = null;

        if (!this.config.enabled) {
            return;
        }

        // Inject the plugin's own CSS for UI elements like labels and line numbers
        injectCSS(app.resolvePath('src/plugins/highlight/highlight.css'));

        // Start loading Highlight.js and its dependencies
        this.initPromise = this._loadHighlightJs();

        // Set up theme switching
        this._setupThemeObserver();
    }

    async onPageLoad(contentElement) {
        if (!this.config.enabled || !this.initPromise) {
            return;
        }

        try {
            await this.initPromise; // Ensure hljs is loaded before processing
            contentElement.querySelectorAll('pre code').forEach(block => {
                this._processCodeBlock(block);
            });
        } catch (error) {
            console.error('Highlight.js plugin failed to process page:', error);
        }
    }

    /**
     * Loads Highlight.js core, languages, and theme files from CDN or local source.
     * @private
     */
    _loadHighlightJs() {
        return new Promise(async (resolve, reject) => {
            if (window.hljs) {
                this.isLoaded = true;
                return resolve();
            }

            const { source, cdn, local } = this.config;
            const baseUrl = source === 'cdn'
                ? `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${cdn.version}`
                : this.app.resolvePath(local.path);

            try {
                // Load themes first
                this._injectTheme(baseUrl, 'light');
                this._injectTheme(baseUrl, 'dark');

                // Load core library
                await this._loadScript(`${baseUrl}/highlight.min.js`);

                // Load specified languages
                if (this.config.languages && this.config.languages.length > 0) {
                    const langPromises = this.config.languages.map(lang =>
                        this._loadScript(`${baseUrl}/languages/${lang}.min.js`)
                    );
                    await Promise.all(langPromises);
                }

                this.isLoaded = true;
                console.info('Highlight.js and languages loaded successfully.');
                resolve();
            } catch (error) {
                console.error(`Failed to load Highlight.js from ${source}.`, error);
                reject(error);
            }
        });
    }
    
    /**
     * Processes a single code block to apply highlighting and features.
     * @param {HTMLElement} block - The <code> element.
     * @private
     */
    _processCodeBlock(block) {
        const pre = block.parentElement;
        const metadata = this._parseMetadata(block.className);

        // Clean the class name before passing to highlight.js
        if (metadata.language) {
            block.className = `language-${metadata.language}`;
        } else {
            block.className = '';
        }

        window.hljs.highlightElement(block);

        if (this.config.showLanguage) {
            const detectedLang = block.result?.language || '';
            const language = metadata.language || detectedLang;

            if (language || metadata.filename) {
                const label = document.createElement('div');
                label.className = 'hljs-language-label';

                if (language) {
                    const langSpan = document.createElement('span');
                    langSpan.className = 'hljs-lang-name';
                    langSpan.textContent = language;
                    label.appendChild(langSpan);
                }

                if (metadata.filename) {
                    if (language) {
                        label.appendChild(document.createTextNode(': '));
                    }
                    const fileSpan = document.createElement('span');
                    fileSpan.className = 'hljs-file-name';
                    fileSpan.textContent = metadata.filename;
                    label.appendChild(fileSpan);
                }

                pre.appendChild(label);
            }
        }

        if (this.config.lineNumbers || metadata.highlights.size > 0) {
            this._applyLineFeatures(block, metadata.highlights);
        }
    }
    
    _applyLineFeatures(block, highlights) {
        block.innerHTML = block.innerHTML
            .split('\n')
            .map((line, index) => {
                const lineNumber = index + 1;
                const isHighlighted = highlights.has(lineNumber);
                const highlightClass = isHighlighted ? ' hljs-line-highlight' : '';
                
                // Wrap each line for styling and highlighting
                // Add an empty line content placeholder for blank lines to preserve height
                return `<span class="hljs-line${highlightClass}">${line || '&#8203;'}</span>`;
            })
            .join('\n');
            
        if (this.config.lineNumbers) {
            block.classList.add('hljs-line-numbers');
        }
    }

    _parseMetadata(className) {
        const result = { language: '', filename: '', highlights: new Set() };
        const match = className.match(/language-([^:{}\s]+)(?::([^:{}\s]+))?(?:{([0-9,-]+)})?/);

        if (match) {
            result.language = match[1];
            result.filename = match[2] || '';
            
            if (match[3]) {
                match[3].split(',').forEach(part => {
                    if (part.includes('-')) {
                        const [start, end] = part.split('-').map(Number);
                        for (let i = start; i <= end; i++) {
                            result.highlights.add(i);
                        }
                    } else {
                        result.highlights.add(Number(part));
                    }
                });
            }
        }
        return result;
    }

    _injectTheme(baseUrl, themeType) {
        const themeConfig = this.config[this.config.source];
        const themeFile = themeType === 'light' ? themeConfig.themeLight : themeConfig.themeDark;
        if (!themeFile) return;

        const themeUrl = `${baseUrl}/styles/${themeFile}`;
        const link = document.createElement('link');
        link.id = `hljs-theme-${themeType}`;
        link.rel = 'stylesheet';
        link.href = themeUrl;
        link.disabled = true; // Disabled by default
        document.head.appendChild(link);
    }
    
    _setupThemeObserver() {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.attributeName === 'data-theme') {
                    this._updateTheme();
                }
            });
        });
        
        observer.observe(document.documentElement, { attributes: true });
        
        // Set initial theme
        this._updateTheme();
    }

    _updateTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const lightTheme = document.getElementById('hljs-theme-light');
        const darkTheme = document.getElementById('hljs-theme-dark');
        
        if (lightTheme) lightTheme.disabled = currentTheme !== 'light';
        if (darkTheme) darkTheme.disabled = currentTheme !== 'dark';
    }

    _loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            document.head.appendChild(script);
        });
    }
}