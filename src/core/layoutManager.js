/**
 * @file Manages the dynamic creation of the application's HTML layout.
 */
import { getElement } from './domRenderer.js';
import { getMimeTypeFromPath } from './utils.js';

export class LayoutManager {
    /**
     * @param {object} config - The application configuration object.
     * @param {App} app - The main App instance for resolving paths.
     */
    constructor(config, app) {
        this.config = config;
        this.app = app;
    }

    /**
     * Initializes the layout by creating the DOM structure and setting up the favicon.
     */
    init() {
        this._createLayout();
        this._setupFavicon();
    }

    /**
     * Creates the main application layout dynamically.
     * @private
     */
    _createLayout() {
        const rootElement = getElement(this.config.selectors.root);
        if (!rootElement) return;

        rootElement.innerHTML = ''; // Clear any existing content

        const appContainer = document.createElement('div');
        appContainer.className = 'app-container';

        // Always create the content area
        const content = document.createElement('main');
        content.className = 'content';

        if (this.config.sidebar && this.config.sidebar.enabled) {
            // Create Sidebar
            const sidebar = document.createElement('aside');
            sidebar.className = 'sidebar';

            const sidebarHeader = document.createElement('div');
            sidebarHeader.className = 'sidebar-header';
            
            const appTitleLink = document.createElement('a');
            appTitleLink.href = '#/';
            appTitleLink.className = 'app-title-link';

            const hasLogo = this.config.logo && this.config.logo.enabled && this.config.logo.src;
            if (hasLogo) {
                const logoImg = document.createElement('img');
                logoImg.src = this.app.resolvePath(this.config.logo.src);
                logoImg.alt = `${this.config.appName} Logo`;
                logoImg.className = 'app-logo';
                logoImg.style.width = this.config.logo.size || '32px';
                logoImg.style.height = this.config.logo.size || '32px';
                appTitleLink.appendChild(logoImg);
            }

            const appTitle = document.createElement('h2');
            appTitle.textContent = this.config.appName;
            if (hasLogo) {
                appTitle.style.fontSize = this.config.logo.appNameFontSize || '1.5rem';
            }

            appTitleLink.appendChild(appTitle);
            sidebarHeader.appendChild(appTitleLink);


            const sidebarNav = document.createElement('nav');
            sidebarNav.className = 'sidebar-nav';

            sidebar.appendChild(sidebarHeader);
            sidebar.appendChild(sidebarNav);
            appContainer.appendChild(sidebar);

            // Create Toggle Button, append to root so it's a sibling of app-container
            const toggleButton = document.createElement('button');
            toggleButton.className = 'sidebar-toggle';
            toggleButton.setAttribute('aria-label', 'باز و بسته کردن منو');
            toggleButton.innerHTML = '☰';
            rootElement.appendChild(toggleButton);
        }
        
        appContainer.appendChild(content);
        rootElement.appendChild(appContainer);
    }

    /**
     * Dynamically creates and sets the favicon based on the configuration.
     * @private
     */
    _setupFavicon() {
        const faviconConfig = this.config.favicon;
        if (!faviconConfig || !faviconConfig.enabled) {
            return;
        }

        // Determine the source path: favicon.src has priority, fallback to logo.src
        let faviconSrc = faviconConfig.src;
        if (!faviconSrc) {
            const logoConfig = this.config.logo;
            if (logoConfig && logoConfig.enabled && logoConfig.src) {
                faviconSrc = logoConfig.src;
            }
        }

        // If no source is found, do nothing.
        if (!faviconSrc) {
            return;
        }
        
        const faviconPath = this.app.resolvePath(faviconSrc);
        
        let faviconType;
        if (faviconConfig.type === 'auto') {
            faviconType = getMimeTypeFromPath(faviconPath);
        } else {
            faviconType = faviconConfig.type || 'image/png';
        }

        // Remove any existing favicon links to avoid duplicates
        document.querySelectorAll("link[rel*='icon']").forEach(el => el.remove());

        // Create and append the new favicon link
        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = faviconType;
        link.href = faviconPath;
        document.head.appendChild(link);

        // Add a shortcut icon link for older browsers
        const shortcutLink = document.createElement('link');
        shortcutLink.rel = 'shortcut icon';
        shortcutLink.type = faviconType;
        shortcutLink.href = faviconPath;
        document.head.appendChild(shortcutLink);
    }

    /**
     * Adds a class to the body to disable the sidebar via CSS.
     */
    disableSidebar() {
        document.body.classList.add('sidebar-disabled');
    }
}