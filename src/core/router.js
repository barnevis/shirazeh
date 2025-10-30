/**
 * @file Handles client-side routing based on URL hash.
 */
export class Router {
    /**
     * @param {object} config - The router configuration.
     * @param {string} config.defaultPage - The file to load for the root path.
     * @param {function} config.onNavigate - Callback function to execute on navigation.
     */
    constructor({ defaultPage, onNavigate }) {
        this.defaultPage = defaultPage;
        this.onNavigate = onNavigate;
    }

    /**
     * Initializes the router and sets up event listeners.
     */
    init() {
        window.addEventListener('hashchange', () => this.handleRouteChange());

        // On initial load, if there's no hash, set it to the root path.
        // This makes the URL consistent with the displayed content.
        if (window.location.hash === '') {
            // Using replaceState to avoid adding a new entry to the browser history.
            window.history.replaceState(null, '', '#/');
        }

        // Immediately process the initial route instead of waiting for the 'load' event.
        // This makes the initial content appear faster.
        this.handleRouteChange();
    }

    /**
     * Handles the route change event.
     */
    handleRouteChange() {
        const path = this.getCurrentPath();
        const filePath = this.getFilePath(path);
        this.onNavigate(filePath, path);
    }

    /**
     * Gets the current path from the URL hash.
     * @returns {string} The current path (e.g., '/', '/guide').
     */
    getCurrentPath() {
        return window.location.hash.substring(1) || '/';
    }

    /**
     * Converts a navigation path to a markdown file path.
     * @param {string} path - The navigation path.
     * @returns {string} The corresponding file path.
     */
    getFilePath(path) {
        if (path === '/') {
            return this.defaultPage;
        }
        // Remove leading slash and add .md extension
        return `${path.substring(1)}.md`;
    }
}