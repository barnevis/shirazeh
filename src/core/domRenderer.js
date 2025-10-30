/**
 * @file Manages all direct interactions with the DOM for rendering content.
 */

/**
 * Finds and returns an element by its CSS selector.
 * @param {string} selector - The CSS selector of the element to find.
 * @returns {HTMLElement} The found element.
 * @throws {Error} If the element is not found.
 */
export function getElement(selector) {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`Element with selector '${selector}' not found.`);
    }
    return element;
}

/**
 * Renders a loading state message in the content element.
 * @param {HTMLElement} element - The element where the loading content will be placed.
 */
export function renderLoading(element) {
    element.className = ''; // Reset classes
    element.innerHTML = `<div class="loading-message"><p>در حال بارگذاری محتوا...</p></div>`;
}

/**
 * Renders an error message in the content element.
 * @param {HTMLElement} element - The element where the error message will be placed.
 * @param {string} errorMessage - The error message to display.
 */
export function renderError(element, errorMessage) {
    element.className = ''; // Reset classes
    element.innerHTML = `
        <div class="error-message" role="alert">
            <strong>خطا! </strong>
            <span>${errorMessage}</span>
        </div>
    `;
}

/**
 * Renders the final HTML content into the element.
 * @param {HTMLElement} element - The element where the final content will be placed.
 * @param {string} htmlContent - The HTML content to render.
 */
export function renderContent(element, htmlContent) {
    element.innerHTML = htmlContent;
    element.className = 'prose content';
}