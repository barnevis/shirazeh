/**
 * @file Manages the dynamic browser tab title.
 */
import { base64ToUtf8, normalizePath } from './utils.js';

/**
 * Manages the generation and updating of the document's title.
 */
export class TitleManager {
    /**
     * @param {object} config - The full application configuration.
     */
    constructor(config) {
        this.config = config.title || {};
        this.appName = config.appName || '';
        this.defaultPage = config.files?.defaultPage || 'README.md';
    }

    /**
     * Updates the document title based on the current page context.
     * @param {object} context - The context needed to determine the title.
     * @param {HTMLElement} context.contentElement - The main content DOM element.
     * @param {Router} context.router - The application router instance.
     * @param {Sidebar} context.sidebar - The application sidebar instance.
     */
    updateTitle({ contentElement, router, sidebar }) {
        if (!this.config.enabled) {
            return;
        }

        const pageTitle = this._getPageTitle({ contentElement, router, sidebar });
        const finalTitle = this._formatTitle(pageTitle);

        document.title = finalTitle;
    }

    /**
     * Determines the page title by checking various sources based on a defined priority.
     * @param {object} context - The context for title determination.
     * @returns {string} The determined page title.
     * @private
     */
    _getPageTitle({ contentElement, router, sidebar }) {
        const currentPath = router.getCurrentPath();
        const filePath = router.getFilePath(currentPath);

        const priority = this.config.sourcePriority || ['sidebarTitle', 'sidebarLabel', 'h1', 'filename', 'fallback'];

        // Determine the key for looking up sidebar metadata
        let sidebarMapKey;
        if (currentPath.startsWith('/remote/')) {
            try {
                // For remote links, the key is the full, decoded URL
                sidebarMapKey = base64ToUtf8(currentPath.substring('/remote/'.length));
            } catch (e) {
                sidebarMapKey = ''; // Invalid encoding, can't look up
            }
        } else {
            // For local links, the key is the normalized path
            sidebarMapKey = normalizePath(currentPath);
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
                    const mdExtRegex = /\.(md|markdown|mkd|mdown)$/i;
                    if (currentPath === '/') {
                        foundTitle = this.defaultPage.replace(mdExtRegex, '');
                    } else if (!filePath.startsWith('http')) {
                        foundTitle = filePath.split('/').pop().replace(mdExtRegex, '');
                    } else {
                        try {
                            const url = new URL(filePath);
                            foundTitle = url.pathname.split('/').pop().replace(mdExtRegex, '');
                        } catch (e) { /* ignore invalid URL */ }
                    }
                    break;
                case 'fallback':
                    foundTitle = this.config.fallback || 'بدون عنوان';
                    break;
            }

            if (foundTitle) {
                return foundTitle.trim(); // Return the first valid title found
            }
        }
        return this.config.fallback || 'بدون عنوان'; // Should be unreachable but safe
    }

    /**
     * Formats the final title string based on configuration.
     * @param {string} pageTitle - The title of the current page.
     * @returns {string} The final, formatted title string.
     * @private
     */
    _formatTitle(pageTitle) {
        let finalTitle = pageTitle;
        const { includeWiki, order, separator } = this.config;
        
        if (includeWiki && order !== 'page-only' && this.appName) {
            if (order === 'wiki-first') {
                finalTitle = `${this.appName}${separator}${pageTitle}`;
            } else { // 'page-first' is the default
                finalTitle = `${pageTitle}${separator}${this.appName}`;
            }
        }

        // Trim and truncate the title if it's too long
        if (finalTitle.length > 80) {
            finalTitle = finalTitle.substring(0, 77) + '...';
        }

        return finalTitle;
    }
}