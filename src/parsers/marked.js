/**
 * @file Built-in parser using the 'marked' library.
 */

export default class MarkedParser {
    /**
     * The constructor checks if the 'marked' library is available on the window object.
     */
    constructor() {
        if (!window.marked) {
            throw new Error("'marked' library is not loaded. Please check the script tag in index.html.");
        }
    }

    /**
     * Parses markdown using the 'marked' library.
     * @param {string} markdown - The markdown string to parse.
     * @param {object} [options] - Options to pass to marked.
     * @returns {string} The resulting HTML string.
     */
    parse(markdown, options = {}) {
        // Here you could merge global options from config with per-call options if needed
        return window.marked.parse(markdown, options);
    }
}