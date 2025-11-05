/**
 * @file Manages the lifecycle of loading and rendering a page.
 */
import { renderLoading, renderError, renderContent } from './domRenderer.js';
import { fetchContent } from './fileReader.js';
import { utf8ToBase64 } from './utils.js';

export class PageManager {
    /**
     * @param {object} dependencies - An object containing all necessary dependencies.
     */
    constructor({ config, contentElement, parserManager, titleManager, pluginManager, sidebar, app }) {
        this.config = config;
        this.contentElement = contentElement;
        this.parserManager = parserManager;
        this.titleManager = titleManager;
        this.pluginManager = pluginManager;
        this.sidebar = sidebar;
        this.app = app;
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
                throw new Error('Remote file loading is disabled, content not found.');
            }
            
            const resolvedPath = isRemote ? filePath : this.app.resolvePath(filePath);
            
            let markdown = await fetchContent(resolvedPath, this.config);

            if (isRemote) {
                markdown = this._rewriteRemoteContent(markdown, resolvedPath);
            }
            
            const html = this.parserManager.parse(markdown);
            renderContent(this.contentElement, html);
            
            this.titleManager.updateTitle({
                contentElement: this.contentElement,
                router: this.app.router,
                sidebar: this.sidebar
            });

            this.pluginManager.notify('onPageLoad', this.contentElement);

            if (this.sidebar) {
                this.sidebar.setActiveLink(currentPath.split('#')[0]);
                this.sidebar.closeMobileSidebar();
            }

            this._scrollToAnchor(currentPath);

        } catch (error) {
            if (error.message.includes('not found')) {
                await this._loadNotFoundPage(error);
            } else {
                this.handleError(error);
            }
        }
    }

    /**
     * Rewrites relative links and image paths within remotely fetched markdown content.
     * @param {string} markdown - The raw markdown content.
     * @param {string} baseUrl - The base URL of the remote file.
     * @returns {string} The rewritten markdown.
     * @private
     */
    _rewriteRemoteContent(markdown, baseUrl) {
        const relativeLinkRegex = /(!?\[.*?\])\(\s*(?!#|data:|https?:|\/\/)(.*?)\s*\)/g;

        return markdown.replace(relativeLinkRegex, (match, prefix, relativeUrl) => {
            try {
                const absoluteUrl = new URL(relativeUrl, baseUrl).href;
                if (prefix.startsWith('!')) {
                    return `${prefix}(${absoluteUrl})`;
                }
                const remoteRoute = `#/remote/${utf8ToBase64(absoluteUrl)}`;
                return `${prefix}(${remoteRoute})`;
            } catch (e) {
                console.warn(`Could not resolve relative URL "${relativeUrl}" against base "${baseUrl}".`);
                return match;
            }
        });
    }

    /**
     * Loads the configured 404 "Not Found" page.
     * @param {Error} originalError - The error that triggered the 404.
     * @private
     */
    async _loadNotFoundPage(originalError) {
        console.warn(`Content not found, attempting to load custom 404 page. Original error: ${originalError.message}`);
        try {
            const notFoundPagePath = this.app.resolvePath(this.config.files.notFoundPage);
            const markdown = await fetchContent(notFoundPagePath, this.config);
            const html = this.parserManager.parse(markdown);
            renderContent(this.contentElement, html);
            
            this.titleManager.updateTitle({
                contentElement: this.contentElement,
                router: this.app.router,
                sidebar: this.sidebar
            });

            this.pluginManager.notify('onPageLoad', this.contentElement);

            if (this.sidebar) {
                this.sidebar.setActiveLink(null);
                this.sidebar.closeMobileSidebar();
            }
        } catch (notFoundError) {
            console.error(`Failed to load custom 404 page: ${notFoundError.message}. Falling back to default error display.`);
            this.handleError(originalError);
        }
    }

    /**
     * Handles scrolling to an anchor if one is present in the path.
     * @param {string} path - The full navigation path including any hash.
     * @private
     */
    _scrollToAnchor(path) {
        // Find the anchor, which is everything after the first hash that is NOT at the start of the string.
        // This correctly handles paths like `/#anchor` and `/page/path#anchor`.
        const anchorIndex = path.indexOf('#', 1);

        if (anchorIndex > -1) {
            const anchorId = decodeURIComponent(path.substring(anchorIndex + 1));

            // We use a short timeout to ensure the browser has rendered the new content
            // and plugins have had a chance to add IDs to the headings.
            setTimeout(() => {
                const element = document.getElementById(anchorId);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth' });
                }
            }, 100);
        }
    }

    /**
     * Handles and displays errors.
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