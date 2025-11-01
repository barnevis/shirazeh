/**
 * @file The main application orchestrator for Shirazeh.
 */
import { getElement, renderLoading, renderError, renderContent } from './domRenderer.js';
import { fetchContent } from './fileReader.js';
import { parse } from './markdownParser.js';
import { Router } from './router.js';
import { Sidebar } from './sidebar.js';
import { ThemeManager } from './themeManager.js';
import { PluginManager } from './pluginManager.js';

/**
 * Represents the main Shirazeh application.
 */
export class App {
    /**
     * @param {object} config - The application configuration from configManager.
     */
    constructor(config) {
        this.config = config;
        this.contentElement = null;
        this.sidebar = null;
        this.router = null;
        this.themeManager = new ThemeManager(this.config);
        this.pluginManager = new PluginManager(this); // Pass the app instance
    }

    /**
     * Initializes and starts the application.
     */
    async start() {
        try {
            this._createLayout(); // Create the DOM structure first
            this.themeManager.init(); // Initialize the theme manager
            
            // Load plugins using the new manager
            await this.pluginManager.loadPlugins(this.config.plugins);

            this.contentElement = getElement(this.config.selectors.content);
            
            if (this.config.sidebar && this.config.sidebar.enabled) {
                const resolvedSidebarFile = this.resolvePath(this.config.files.sidebar);

                this.sidebar = new Sidebar({
                    navElementId: this.config.selectors.sidebarNav,
                    toggleId: this.config.selectors.sidebarToggle,
                    sidebarFile: resolvedSidebarFile,
                });
                await this.sidebar.init();
            } else {
                this._disableSidebar();
                this.sidebar = null; // Ensure sidebar object is null
            }

            this.router = new Router({
                defaultPage: this.config.files.defaultPage,
                onNavigate: (filePath, path) => this.loadPage(filePath, path),
            });
            this.router.init();

        } catch (error) {
            this.handleError(error);
        }
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
            const appTitle = document.createElement('h2');
            appTitle.textContent = this.config.appName;
            sidebarHeader.appendChild(appTitle);

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
     * Adds a class to the body to disable the sidebar via CSS.
     * @private
     */
    _disableSidebar() {
        document.body.classList.add('sidebar-disabled');
    }

    /**
     * Loads and renders a page based on a file path.
     * @param {string} filePath - The path to the markdown file to load.
     * @param {string} currentPath - The current navigation path (e.g., '/guide').
     */
    async loadPage(filePath, currentPath) {
        try {
            renderLoading(this.contentElement);

            const resolvedPath = this.resolvePath(filePath);
            const markdown = await fetchContent(resolvedPath);
            const html = parse(markdown);
            renderContent(this.contentElement, html);

            // Notify plugins that a new page has been loaded
            this.pluginManager.notify('onPageLoad', this.contentElement);

            if (this.sidebar) {
                this.sidebar.setActiveLink(currentPath);
                this.sidebar.closeMobileSidebar();
            }
        } catch (error) {
            if (error.message.includes('not found')) {
                this._loadNotFoundPage(error);
            } else {
                this.handleError(error);
            }
        }
    }

    /**
     * Loads the configured 404 "Not Found" page.
     * If the 404 page itself is not found, it falls back to the default error handler.
     * @param {Error} originalError - The original error that triggered the 404.
     * @private
     */
    async _loadNotFoundPage(originalError) {
        console.warn(`Content not found, attempting to load custom 404 page. Original error: ${originalError.message}`);
        try {
            const notFoundPagePath = this.resolvePath(this.config.files.notFoundPage);
            const markdown = await fetchContent(notFoundPagePath);
            const html = parse(markdown);
            renderContent(this.contentElement, html);

            // Also notify plugins on 404 page load
            this.pluginManager.notify('onPageLoad', this.contentElement);

            if (this.sidebar) {
                this.sidebar.setActiveLink(null); // Clear active link
                this.sidebar.closeMobileSidebar();
            }
        } catch (notFoundError) {
            console.error(`Failed to load custom 404 page: ${notFoundError.message}. Falling back to default error display.`);
            this.handleError(originalError);
        }
    }

    /**
     * Resolves a relative path against the configured base path.
     * @param {string} relativePath - The path relative to the base path.
     * @returns {string} The fully resolved path.
     */
    resolvePath(relativePath) {
        // Simple path join, removes leading slash from relativePath if basePath is not empty.
        if (this.config.basePath && relativePath.startsWith('/')) {
            relativePath = relativePath.substring(1);
        }
        return [this.config.basePath, relativePath]
            .filter(Boolean) // Remove empty parts
            .join('/')
            .replace(/\/\//g, '/'); // Avoid double slashes
    }

    /**
     * Handles errors during application lifecycle.
     * @param {Error} error - The error object.
     */
    handleError(error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        console.error("Shirazeh encountered an error:", message);

        let userMessage = 'در بارگذاری محتوا خطایی رخ داد. لطفاً اتصال اینترنت خود را بررسی کنید.';
        if (message.includes('not found')) {
            userMessage = 'فایل درخواست شده پیدا نشد. ممکن است لینک شکسته باشد یا فایل حذف شده باشد.';
        }

        if (this.contentElement) {
            renderError(this.contentElement, userMessage);
        }
    }
}