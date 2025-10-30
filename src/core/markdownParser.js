/**
 * @file A wrapper for the 'marked' library to parse markdown.
 */

// 'marked' is loaded via CDN and available on the window object.
const marked = window.marked;

if (!marked) {
    throw new Error("'marked' library is not loaded. Please check the script tag in index.html.");
}

/**
 * Parses a markdown string into an HTML string.
 * @param {string} markdown - The markdown string to parse.
 * @returns {string} The resulting HTML string.
 */
export function parse(markdown) {
    return marked.parse(markdown);
}
