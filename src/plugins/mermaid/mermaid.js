
/**
 * @file Mermaid.js plugin for Shirazeh.
 * Supports rendering diagrams from code blocks with real-time theme switching.
 */
import { injectCSS } from '../../core/pluginManager.js';

export default class MermaidPlugin {
    /**
     * Called once when the plugin is initialized.
     * @param {App} app - The main application instance.
     */
    onInit(app) {
        this.app = app;
        this.config = app.config.mermaid || { enabled: true };
        this.mermaidLoaded = false;
        this.initPromise = null;

        if (!this.config.enabled) return;

        // Inject helper styles for mermaid containers from the correct nested path
        injectCSS(app.resolvePath('src/plugins/mermaid/mermaid.css'));

        // Listen for theme changes to re-render diagrams with correct theme
        this._setupThemeObserver();
    }

    /**
     * Called every time a new page is rendered.
     */
    async onPageLoad(contentElement) {
        if (!this.config.enabled) return;

        const codeBlocks = contentElement.querySelectorAll('pre code.language-mermaid');
        if (codeBlocks.length === 0) return;

        try {
            // Transform code blocks to mermaid containers
            codeBlocks.forEach(block => {
                const pre = block.parentElement;
                const container = document.createElement('div');
                container.className = 'mermaid';
                const content = block.textContent;
                container.textContent = content;
                
                // CRITICAL: Store the original source code so we can re-render on theme change
                container.setAttribute('data-mermaid-src', content);
                
                pre.parentNode.replaceChild(container, pre);
            });

            // Ensure mermaid library is loaded
            await this._ensureLibraryLoaded();

            // Initialize and run mermaid
            this._renderDiagrams();
        } catch (error) {
            console.error('Mermaid plugin failed:', error);
        }
    }

    /**
     * Dynamically loads the Mermaid.js library from CDN.
     * @private
     */
    _ensureLibraryLoaded() {
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            if (window.mermaid) {
                this.mermaidLoaded = true;
                return resolve();
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js';
            script.async = true;
            script.onload = () => {
                this.mermaidLoaded = true;
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load Mermaid.js library.'));
            document.head.appendChild(script);
        });

        return this.initPromise;
    }

    /**
     * Configures and runs mermaid rendering.
     * @private
     */
    _renderDiagrams() {
        if (!window.mermaid) return;

        const nodes = document.querySelectorAll('.mermaid');
        if (nodes.length === 0) return;

        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        
        // Reset all nodes to their original text source and clear the "processed" state
        nodes.forEach(node => {
            const src = node.getAttribute('data-mermaid-src');
            if (src) {
                node.textContent = src;
                node.removeAttribute('data-processed');
                // Optional: clear any generated ID if mermaid added one
                node.removeAttribute('id');
            }
        });

        window.mermaid.initialize({
            startOnLoad: false,
            theme: currentTheme === 'dark' ? 'dark' : 'default',
            fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-family-main') || 'Vazirmatn',
            securityLevel: 'loose',
            // Ensure proper layout for RTL environment
            flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
        });

        window.mermaid.run({
            nodes: nodes,
        });
    }

    /**
     * Re-renders diagrams when the app theme changes.
     * @private
     */
    _setupThemeObserver() {
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.attributeName === 'data-theme' && this.mermaidLoaded) {
                    // Small delay to ensure theme attributes are fully propagated
                    setTimeout(() => this._renderDiagrams(), 50);
                }
            });
        });

        observer.observe(document.documentElement, { attributes: true });
    }
}
