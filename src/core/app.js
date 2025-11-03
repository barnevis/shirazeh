/**
 * @file The main application orchestrator for Shirazeh.
 */
import { getElement, renderLoading, renderError, renderContent } from './domRenderer.js';
import { fetchContent } from './fileReader.js';
import { Router } from './router.js';
import { Sidebar } from './sidebar.js';
import { ThemeManager } from './themeManager.js';
import { PluginManager } from './pluginManager.js';
import { ParserManager } from './parserManager.js';

/**
 * Represents the main Shirazeh application.
 */
export class App {
    /**
     * @param {object} config - The application configuration from configManager.
     */
    constructor(config) {
        this.config = config;
        this.titleConfig = config.title || {};
        this.contentElement = null;
        this.sidebar = null;
        this.router = null;
        this.themeManager = new ThemeManager(this.config);
        this.pluginManager = new PluginManager(this); // Pass the app instance
        this.parserManager = new ParserManager(this.config.markdown, this);
    }

    /**
     * Initializes and starts the application.
     */
    async start() {
        try {
            this._createLayout(); // Create the DOM structure first
            await this.themeManager.init(this); // Initialize the theme & font manager
            
            // Initialize the parser before any content is loaded
            await this.parserManager.init();
            
            // Load plugins using the new manager
            await this.pluginManager.loadPlugins(this.config.plugins);

            this.contentElement = getElement(this.config.selectors.content);
            
            if (this.config.sidebar && this.config.sidebar.enabled) {
                const resolvedSidebarFile = this.resolvePath(this.config.files.sidebar);

                this.sidebar = new Sidebar({
                    navElementId: this.config.selectors.sidebarNav,
                    toggleId: this.config.selectors.sidebarToggle,
                    sidebarFile: resolvedSidebarFile,
                    parser: this.parserManager, // Pass parser manager
                    config: this.config, // Pass the full config
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
     * Rewrites relative links and image paths within remotely fetched markdown content.
     * @param {string} markdown - The raw markdown content.
     * @param {string} baseUrl - The base URL of the remote file.
     * @returns {string} The rewritten markdown.
     * @private
     */
    _rewriteRemoteContent(markdown, baseUrl) {
        // This regex finds markdown links and images with relative paths.
        // It avoids absolute paths (http, https, data:, #) and protocol-relative paths (//).
        const relativeLinkRegex = /(!?\[.*?\])\(\s*(?!#|data:|https?:|\/\/)(.*?)\s*\)/g;

        return markdown.replace(relativeLinkRegex, (match, prefix, relativeUrl) => {
            try {
                // Resolve the relative URL against the base URL of the markdown file.
                const absoluteUrl = new URL(relativeUrl, baseUrl).href;

                // For images, use the absolute URL directly.
                if (prefix.startsWith('!')) {
                    return `${prefix}(${absoluteUrl})`;
                }

                // For links, convert the absolute URL into our internal remote routing format.
                const remoteRoute = `#/remote/${btoa(absoluteUrl)}`;
                return `${prefix}(${remoteRoute})`;

            } catch (e) {
                console.warn(`Could not resolve relative URL "${relativeUrl}" against base "${baseUrl}".`);
                return match; // Return the original match if URL resolution fails
            }
        });
    }

    /**
     * Loads and renders a page based on a file path.
     * @param {string} filePath - The path to the markdown file to load (can be local or a full URL).
     * @param {string} currentPath - The current navigation path (e.g., '/guide' or '/remote/...').
     */
    async loadPage(filePath, currentPath) {
        try {
            renderLoading(this.contentElement);

            const isRemote = filePath.startsWith('http');

            // Security Gate: Check if remote loading is enabled before proceeding.
            if (isRemote && (!this.config.remote || !this.config.remote.enabled)) {
                // If remote loading is disabled, treat it as a "not found" error.
                throw new Error('Remote file loading is disabled, content not found.');
            }
            
            const resolvedPath = isRemote ? filePath : this.resolvePath(filePath);
            
            // Pass the config to fetchContent for proxy handling
            let markdown = await fetchContent(resolvedPath, this.config);

            // If the content is from a remote source, rewrite its internal links
            if (isRemote) {
                markdown = this._rewriteRemoteContent(markdown, resolvedPath);
            }
            
            const html = this.parserManager.parse(markdown);
            renderContent(this.contentElement, html);
            
            this._updateTitle();

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
            const markdown = await fetchContent(notFoundPagePath, this.config); // Pass config here too
            const html = this.parserManager.parse(markdown);
            renderContent(this.contentElement, html);
            
            this._updateTitle();

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
     * Updates the document title based on the current page and configuration.
     * @private
     */
    _updateTitle() {
        if (!this.titleConfig.enabled) {
            return;
        }

        const { contentElement, router, sidebar, config } = this;
        const currentPath = router.getCurrentPath();
        const filePath = router.getFilePath(currentPath);

        let pageTitle = '';
        const priority = this.titleConfig.sourcePriority || ['sidebarTitle', 'sidebarLabel', 'h1', 'filename', 'fallback'];

        // 1. Determine the source key for the sidebar map
        let sidebarMapKey = currentPath;
        if (currentPath.startsWith('/remote/')) {
            try {
                sidebarMapKey = atob(currentPath.substring('/remote/'.length));
            } catch (e) {
                sidebarMapKey = ''; // Invalid encoding, can't look up
            }
        }

        const linkMeta = sidebar?.linkMap.get(sidebarMapKey);

        for (const source of priority) {
            let foundTitle = '';
            switch (source) {
                case 'sidebarTitle':
                    if (linkMeta?.title) foundTitle = linkMeta.title;
                    break;
                case 'sidebarLabel':
                    if (linkMeta?.label) foundTitle = linkMeta.label;
                    break;
                case 'h1':
                    const h1 = contentElement?.querySelector('h1');
                    if (h1?.textContent) foundTitle = h1.textContent;
                    break;
                case 'filename':
                    if (currentPath === '/') {
                        foundTitle = config.files.defaultPage.replace(/\.md$/, '');
                    } else if (!filePath.startsWith('http')) {
                        foundTitle = filePath.split('/').pop().replace(/\.md$/, '');
                    } else {
                        try {
                            const url = new URL(filePath);
                            foundTitle = url.pathname.split('/').pop().replace(/\.md$/, '');
                        } catch (e) { /* ignore invalid URL */ }
                    }
                    break;
                case 'fallback':
                    foundTitle = this.titleConfig.fallback || 'بدون عنوان';
                    break;
            }

            if (foundTitle) {
                pageTitle = foundTitle.trim();
                break; // Stop at the first successful source
            }
        }

        // 2. Format the final title
        let finalTitle = pageTitle;
        const { includeWiki, order, separator } = this.titleConfig;
        const appName = config.appName;

        if (includeWiki && order !== 'page-only') {
            if (order === 'wiki-first') {
                finalTitle = `${appName}${separator}${pageTitle}`;
            } else { // 'page-first' is the default
                finalTitle = `${pageTitle}${separator}${appName}`;
            }
        }

        // 3. Trim and set the title
        if (finalTitle.length > 80) {
            finalTitle = finalTitle.substring(0, 77) + '...';
        }

        document.title = finalTitle;
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