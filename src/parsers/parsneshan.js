/**
 * @file Built-in parser using the 'ParsNeshan' (markdown-it based) library.
 */
import { createParsNeshan } from '../lib/parsneshan.js';

export default class ParsNeshanParser {
    /**
     * The constructor checks if the 'markdownit' library is available and initializes the parser.
     * @param {object} [options] - Options to pass to the ParsNeshan factory.
     */
    constructor(options = {}) {
        if (!window.markdownit) {
            throw new Error("'markdown-it' library is not loaded. Please check the script tag in index.html.");
        }
        // Create a single, configured instance of the parser
        this.md = createParsNeshan(options);
    }

    /**
     * Parses markdown using the initialized ParsNeshan instance.
     * @param {string} markdown - The markdown string to parse.
     * @returns {string} The resulting HTML string.
     */
    parse(markdown) {
        return this.md.render(markdown);
    }
}