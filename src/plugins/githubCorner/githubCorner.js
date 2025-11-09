/**
 * @file GitHub Corner plugin for Shirazeh.
 * Adds a configurable link to a GitHub repository in the corner of the page.
 */
import { injectCSS } from '../../core/pluginManager.js';

export default class GithubCornerPlugin {
    /**
     * Called once when the plugin is initialized.
     * @param {App} app - The main application instance.
     */
    onInit(app) {
        this.app = app;
        this.config = app.config.githubCorner || {};

        if (!this.config.enabled || !this.config.url) {
            return;
        }

        const cssPath = app.resolvePath('src/plugins/githubCorner/githubCorner.css');
        injectCSS(cssPath);

        const cornerElement = this._createCornerElement();

        if (this.app.config.widgets && this.app.config.widgets.enabled) {
            this.app.widgetManager.register({
                id: 'github-corner',
                element: cornerElement,
            });
        } else {
            // Fallback to old behavior
            const position = this.config.position === 'top-right' ? 'top-right' : 'top-left';
            cornerElement.classList.add(position);
            document.body.appendChild(cornerElement);
        }
    }

    /**
     * Creates and configures the GitHub corner DOM element.
     * @private
     * @returns {HTMLAnchorElement} The created anchor element.
     */
    _createCornerElement() {
        const cornerLink = document.createElement('a');
        cornerLink.href = this.config.url;
        cornerLink.className = 'github-corner';
        cornerLink.setAttribute('target', '_blank');
        cornerLink.setAttribute('rel', 'noopener');
        cornerLink.setAttribute('aria-label', 'View source on GitHub');
        
        cornerLink.style.setProperty('--github-corner-size', this.config.size || '80px');
        
        if (this.config.backgroundColor) {
            cornerLink.style.setProperty('--github-corner-bg', this.config.backgroundColor);
        }
        if (this.config.iconColor) {
            cornerLink.style.setProperty('--github-corner-icon', this.config.iconColor);
        }
        
        cornerLink.innerHTML = `
            <svg viewBox="0 0 250 250" aria-hidden="true">
                <path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z" class="bg-path"></path>
                <path d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2" fill="currentColor" style="transform-origin: 130px 106px;" class="octo-arm"></path>
                <path d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z" fill="currentColor" class="octo-body"></path>
            </svg>
        `;

        return cornerLink;
    }
}