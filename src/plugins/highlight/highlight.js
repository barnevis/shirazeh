/**
 * @file Syntax Highlighting Plugin for Shirazeh using Highlight.js.
 */
import { injectCSS } from '../../core/pluginManager.js';

export default class HighlightPlugin {
    onInit(app) {
        this.app = app;
        this.config = app.config.highlight || {};
        this.initPromise = null; // Will be used to track the loading promise

        if (!this.config.enabled) {
            return;
        }

        // Inject the plugin's own CSS for UI elements like labels and line numbers
        injectCSS(app.resolvePath('src/plugins/highlight/highlight.css'));

        // Set up theme switching, but don't load the actual themes yet
        this._setupThemeObserver();
    }

    async onPageLoad(contentElement) {
        if (!this.config.enabled) {
            return;
        }

        const codeBlocks = contentElement.querySelectorAll('pre code');
        // Optimization: Don't load hljs if there's no code on the page.
        if (codeBlocks.length === 0) {
            return;
        }

        try {
            // Start loading Highlight.js only when it's first needed.
            // This promise will be created only once.
            if (!this.initPromise) {
                this.initPromise = this._loadHighlightJs();
            }
            
            await this.initPromise; // Ensure hljs is loaded before processing
            
            codeBlocks.forEach(block => {
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

                console.info('Highlight.js and languages loaded successfully.');
                
                // Now that themes are in the DOM, we can ensure the correct one is active.
                this._updateTheme();
                
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
            // Avoid adding a duplicate label
            if (pre.querySelector('.hljs-language-label')) return;

            const detectedLang = block.result?.language || '';
            const language = metadata.language || detectedLang;
            const shouldShowFilename = this.config.showFileName && metadata.filename;

            if (language || shouldShowFilename) {
                const label = document.createElement('div');
                label.className = 'hljs-language-label';

                if (language) {
                    const langSpan = document.createElement('span');
                    langSpan.className = 'hljs-lang-name';
                    langSpan.textContent = language;
                    label.appendChild(langSpan);
                }

                if (shouldShowFilename) {
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
        let lines = block.innerHTML.split('\n');
    
        // Don't process if it's already been processed (e.g., by another plugin or error)
        if (block.querySelector('.hljs-line')) return;

        if (lines.length > 1 && lines[lines.length - 1].trim() === '') {
            lines.pop();
        }
    
        block.innerHTML = lines
            .map((line, index) => {
                const lineNumber = index + 1;
                const isHighlighted = highlights.has(lineNumber);
                const highlightClass = isHighlighted ? ' hljs-line-highlight' : '';
                
                return `<span class="hljs-line${highlightClass}">${line || '&#8203;'}</span>`;
            })
            .join(''); // FIX: Do not join with '\n'. The CSS `display:block` will handle line breaks.
            
        if (this.config.lineNumbers) {
            block.classList.add('hljs-line-numbers');
        }
    }

    _parseMetadata(className) {
        // Updated regex to handle spaces within the curly braces for line highlighting.
        const match = className.match(/language-([^:{}\s]+)(?::([^:{}\s]+))?(?:{([\d,\s-]+)})?/);

        const result = { language: '', filename: '', highlights: new Set() };
        if (match) {
            result.language = match[1];
            result.filename = match[2] || '';
            
            if (match[3]) {
                // Remove all whitespace from the highlight string before parsing
                const highlightString = match[3].replace(/\s/g, '');
                highlightString.split(',').forEach(part => {
                    if (part.includes('-')) {
                        const [start, end] = part.split('-').map(Number);
                        for (let i = start; i <= end; i++) {
                            result.highlights.add(i);
                        }
                    } else if (part) {
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

        // Prevent duplicate injection
        if (document.getElementById(`hljs-theme-${themeType}`)) return;

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
        
        // Set initial theme state for when themes are loaded
        this._updateTheme();
    }

    _updateTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const lightTheme = document.getElementById('hljs-theme-light');
        const darkTheme = document.getElementById('hljs-theme-dark');
        
        // Themes might not be in the DOM yet, so check for their existence.
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