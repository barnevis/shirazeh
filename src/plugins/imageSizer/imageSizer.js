/**
 * @file Image Sizer Plugin for Shirazeh.
 * Allows users to specify image dimensions directly in markdown.
 * Syntax: ![alt text](src.jpg){widthxheight}
 */

export default class ImageSizerPlugin {
    /**
     * Called once when the plugin is initialized.
     * @param {App} app - The main application instance.
     */
    onInit(app) {
        this.config = app.config.imageSizer || {};
    }

    /**
     * Called every time a new page is rendered.
     * This is where we'll scan for images and apply dimensions.
     * @param {HTMLElement} contentElement - The element containing the page's content.
     */
    onPageLoad(contentElement) {
        if (!this.config.enabled) {
            return;
        }

        contentElement.querySelectorAll('img').forEach(img => {
            // The markdown parser renders the `{...}` part as a text node sibling to the image.
            const sibling = img.nextSibling;

            if (sibling && sibling.nodeType === Node.TEXT_NODE) {
                const textContent = sibling.textContent.trim();
                // Regex to match a string that starts with { and ends with }
                const dimensionRegex = /^\{([^{}]+)\}$/;
                const match = textContent.match(dimensionRegex);

                if (match) {
                    const dimString = match[1];
                    const dimensions = this._parseDimensions(dimString);

                    if (dimensions.width) {
                        img.style.width = dimensions.width;
                    }
                    if (dimensions.height) {
                        img.style.height = dimensions.height;
                    }

                    // Remove the text node from the DOM so it's not displayed.
                    sibling.remove();
                }
            }
        });
    }

    /**
     * Parses the dimension string (e.g., "300x200", "300x", "x200", "300", "۳۰۰x۲۰۰")
     * into a usable object.
     * @param {string} dimString - The string from within the curly braces.
     * @returns {{width: string|null, height: string|null}}
     * @private
     */
    _parseDimensions(dimString) {
        const normalizedString = this._normalizeNumbers(dimString.trim());
        const dimensions = { width: null, height: null };
        
        // Case: {300} -> width=300px, height=300px
        if (!isNaN(normalizedString) && normalizedString) {
            dimensions.width = `${normalizedString}px`;
            dimensions.height = `${normalizedString}px`;
            return dimensions;
        }

        // Case: {300x200}, {300x}, {x200}
        if (normalizedString.includes('x')) {
            const [widthPart, heightPart] = normalizedString.split('x');
            
            if (widthPart && !isNaN(widthPart)) {
                dimensions.width = `${widthPart}px`;
            }
            if (heightPart && !isNaN(heightPart)) {
                dimensions.height = `${heightPart}px`;
            }
        }
        
        return dimensions;
    }
    
    /**
     * Converts Persian/Arabic numerals in a string to Latin numerals.
     * @param {string} str - The input string.
     * @returns {string} The string with normalized numbers.
     * @private
     */
    _normalizeNumbers(str) {
        const persianNumbers = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
        const latinNumbers = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        for (let i = 0; i < 10; i++) {
            str = str.replace(persianNumbers[i], latinNumbers[i]);
        }
        return str;
    }
}