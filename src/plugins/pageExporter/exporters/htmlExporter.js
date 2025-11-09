/**
 * @file HTML Exporter for the Page Exporter plugin.
 */

/**
 * Converts a Blob to a Base64 encoded Data URL.
 * @param {Blob} blob - The blob to convert.
 * @returns {Promise<string>} A promise that resolves with the Data URL.
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Fetches and concatenates the CSS content needed for the exported HTML file.
 * @param {App} app - The main application instance.
 * @returns {Promise<string>} A string containing all necessary CSS rules.
 */
async function _getStyles(app) {
    // A curated list of CSS files required for rendering the content area.
    const coreCssPaths = [
        'src/styles/variables.css',
        'src/styles/themes/light.css',
        'src/styles/themes/dark.css',
        'src/styles/base.css',
        'src/styles/components/content.css',
        'src/styles/components/prose.css',
        'src/styles/components/messages.css',
        'src/styles/components/parsneshan.css',
    ];

    // Add plugin CSS if the respective plugin is enabled.
    if (app.config.codeCopy?.enabled) {
        coreCssPaths.push('src/plugins/codeCopy/codeCopy.css');
    }
    if (app.config.highlight?.enabled) {
        coreCssPaths.push('src/plugins/highlight/highlight.css');
    }

    // Fetch all core CSS files.
    const cssPromises = coreCssPaths.map(path =>
        fetch(app.resolvePath(path)).then(res => res.text()).catch(() => '')
    );

    const cssContents = await Promise.all(cssPromises);
    let allCss = cssContents.join('\n');

    // Find the active highlight.js theme stylesheet and fetch its content.
    if (app.config.highlight?.enabled) {
        const activeThemeSheet = document.querySelector('link[id^="hljs-theme-"]:not([disabled])');
        if (activeThemeSheet) {
            try {
                const themeCss = await fetch(activeThemeSheet.href).then(res => res.text());
                allCss += `\n\n/* Highlight.js Theme */\n${themeCss}`;
            } catch (e) {
                console.warn('Could not fetch highlight.js theme for HTML export.', e);
            }
        }
    }

    return allCss;
}

/**
 * Creates a self-contained HTML file from the current page's content.
 * @param {object} data - The data required for the export.
 * @param {HTMLElement} data.contentElement - The main content DOM element.
 * @param {string} data.filename - The desired filename without extension.
 * @param {string} data.title - The title of the page.
 * @param {App} data.app - The main application instance.
 */
export async function export_(data) {
    const { contentElement, filename, title, app } = data;

    // 1. Create a clone to work on, to avoid modifying the live page.
    const contentClone = contentElement.cloneNode(true);
    
    // 2. Find all images and embed them as Data URLs to make the HTML self-contained.
    const images = Array.from(contentClone.querySelectorAll('img'));
    const imagePromises = images.map(async (img) => {
        // The `src` attribute is a fully resolved URL by the browser.
        const src = img.src;
        if (!src || src.startsWith('data:')) {
            return; // Skip if it's already a data URL or has no src.
        }

        try {
            // Only embed images from the same origin. External images are left as is.
            if (new URL(src).origin === window.location.origin) {
                const response = await fetch(src);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const blob = await response.blob();
                const dataUrl = await blobToBase64(blob);
                img.src = dataUrl;
            }
        } catch (error) {
            console.warn(`Could not embed image "${src}" for HTML export:`, error);
        }
    });
    
    // Wait for all images to be processed before proceeding.
    await Promise.all(imagePromises);

    // 3. Get the modified HTML content with embedded images.
    const finalHtmlContent = contentClone.innerHTML;

    // 4. Get all necessary styles.
    const styles = await _getStyles(app);

    // 5. Get the current theme to apply to the exported HTML tag.
    const theme = document.documentElement.getAttribute('data-theme') || 'light';

    // 6. Get dynamically set typography variables from the live document.
    const rootStyles = getComputedStyle(document.documentElement);
    const fontVars = `
        :root {
            --font-family-main: ${rootStyles.getPropertyValue('--font-family-main')};
            --font-family-code: ${rootStyles.getPropertyValue('--font-family-code')};
            --font-size-base: ${rootStyles.getPropertyValue('--font-size-base')};
            --line-height-base: ${rootStyles.getPropertyValue('--line-height-base')};
        }
    `;

    // 7. Create the final HTML structure.
    const htmlString = `
        <!DOCTYPE html>
        <html lang="fa" dir="rtl" data-theme="${theme}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css">
            <style>
                /* Injected Typography Variables */
                ${fontVars}

                /* Injected Core and Plugin Styles */
                ${styles}

                /* Scoped styles for export layout */
                body {
                    margin: 0;
                    background-color: var(--bg-color); /* Use theme background */
                }
                .prose {
                    margin: 2rem auto; /* Center the content */
                }
            </style>
        </head>
        <body>
            <main class="prose content">
                ${finalHtmlContent}
            </main>
        </body>
        </html>
    `;

    // 8. Create a blob and trigger download.
    const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' });
    triggerDownload(blob, `${filename}.html`);
}

/**
 * Creates a downloadable link and clicks it.
 * @param {Blob} blob - The data blob to download.
 * @param {string} filename - The name of the file.
 */
function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
