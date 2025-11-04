/**
 * @file The main application orchestrator for Shirazeh.
 */
import { getElement } from './domRenderer.js';
import { Router } from './router.js';
import { Sidebar } from './sidebar.js';
import { ThemeManager } from './themeManager.js';
import { PluginManager } from './pluginManager.js';
import { ParserManager } from './parserManager.js';
import { TitleManager } from './titleManager.js';
import { LayoutManager } from './layoutManager.js';
import { PageManager } from './pageManager.js';
import { resolvePath as resolvePathUtil } from './utils.js';

/**
 * Represents the main Shirazeh application. Its primary role is to initialize
 * and coordinate all the different managers.
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

        // Initialize core managers
        this.themeManager = new ThemeManager(this.config);
        this.pluginManager = new PluginManager(this);
        this.parserManager = new ParserManager(this.config.markdown, this);
        this.titleManager = new TitleManager(this.config);
        this.layoutManager = new LayoutManager(this.config, this);
    }

    /**
     * Initializes and starts the application in the correct order.
     */
    async start() {
        try {
            // 1. Create the DOM structure first.
            this.layoutManager.init();

            // 2. Initialize theme and fonts.
            await this.themeManager.init(this);

            // 3. Initialize the parser.
            await this.parserManager.init();

            // 4. Load all configured plugins.
            await this.pluginManager.loadPlugins(this.config.plugins);

            // 5. Get a reference to the main content element after it's created.
            this.contentElement = getElement(this.config.selectors.content);

            // 6. Initialize the sidebar if enabled.
            if (this.config.sidebar && this.config.sidebar.enabled) {
                const resolvedSidebarFile = this.resolvePath(this.config.files.sidebar);
                this.sidebar = new Sidebar({
                    navElementId: this.config.selectors.sidebarNav,
                    toggleId: this.config.selectors.sidebarToggle,
                    sidebarFile: resolvedSidebarFile,
                    parser: this.parserManager,
                    config: this.config,
                });
                await this.sidebar.init();
            } else {
                this.layoutManager.disableSidebar();
                this.sidebar = null;
            }

            // 7. Initialize the page manager which handles loading content.
            this.pageManager = new PageManager({
                config: this.config,
                contentElement: this.contentElement,
                parserManager: this.parserManager,
                titleManager: this.titleManager,
                pluginManager: this.pluginManager,
                sidebar: this.sidebar,
                app: this, // Pass app instance for path resolving
            });

            // 8. Initialize the router and connect it to the page manager.
            this.router = new Router({
                defaultPage: this.config.files.defaultPage,
                onNavigate: (filePath, path) => {
                    // Decouple router from page loading logic
                    this.pageManager.loadPage(filePath, path);
                },
            });
            this.router.init();

        } catch (error) {
            console.error("Shirazeh failed to start:", error);
            // Fallback error display if startup fails catastrophically
            const rootElement = getElement(this.config.selectors.root);
            if (rootElement) {
                rootElement.innerHTML = `<div class="error-message" style="margin: 2rem;"><strong>خطای بحرانی!</strong> <span>برنامه شیرازه نتوانست اجرا شود. لطفاً کنسول را برای جزئیات بیشتر بررسی کنید.</span></div>`;
            }
        }
    }
    
    /**
     * Resolves a relative path against the configured base path.
     * This is a convenience method for other managers.
     * @param {string} relativePath - The path relative to the base path.
     * @returns {string} The fully resolved path.
     */
    resolvePath(relativePath) {
        return resolvePathUtil(relativePath, this.config.basePath);
    }
}