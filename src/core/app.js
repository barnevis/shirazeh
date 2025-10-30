/**
 * @file The main application orchestrator for PWiki.
 */
import { getElement, renderLoading, renderError, renderContent } from './domRenderer.js';
import { fetchContent } from './fileReader.js';
import { parse } from './markdownParser.js';
import { Router } from './router.js';
import { Sidebar } from './sidebar.js';

/**
 * Represents the main PWiki application.
 */
export class App {
    /**
     * @param {object} config - The application configuration.
     */
    constructor(config) {
        this.config = config;
        this.contentElement = null;
        this.sidebar = null;
        this.router = null;
    }

    /**
     * Initializes and starts the application.
     */
    async start() {
        try {
            this.contentElement = getElement(this.config.contentElementId);
            
            this.sidebar = new Sidebar({
                navElementId: this.config.sidebarNavElementId,
                toggleId: this.config.sidebarToggleId,
                sidebarFile: this.config.sidebarFile,
            });
            await this.sidebar.init();

            this.router = new Router({
                defaultPage: this.config.defaultPage,
                onNavigate: (filePath, path) => this.loadPage(filePath, path),
            });
            this.router.init();

        } catch (error) {
            this.handleError(error);
        }
    }

    /**
     * Loads and renders a page based on a file path.
     * @param {string} filePath - The path to the markdown file to load.
     * @param {string} currentPath - The current navigation path (e.g., '/guide').
     */
    async loadPage(filePath, currentPath) {
        try {
            renderLoading(this.contentElement);

            const markdown = await fetchContent(filePath);
            const html = parse(markdown);
            renderContent(this.contentElement, html);

            this.sidebar.setActiveLink(currentPath);
            this.sidebar.closeMobileSidebar();
        } catch (error) {
            this.handleError(error);
        }
    }

    /**
     * Handles errors during application lifecycle.
     * @param {Error} error - The error object.
     */
    handleError(error) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred.';
        console.error("PWiki encountered an error:", message);
        if (this.contentElement) {
            renderError(this.contentElement, message);
        }
    }
}