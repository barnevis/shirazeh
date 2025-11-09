/**
 * @file HTML Exporter for the Page Exporter plugin.
 */

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

    // 1. Get only the relevant CSS for the content.
    const styles = await _getStyles(app);

    // 2. Get the current theme to apply to the exported HTML tag.
    const theme = document.documentElement.getAttribute('data-theme') || 'light';

    // 3. Get dynamically set typography variables from the live document.
    const rootStyles = getComputedStyle(document.documentElement);
    const fontVars = `
        :root {
            --font-family-main: ${rootStyles.getPropertyValue('--font-family-main')};
            --font-family-code: ${rootStyles.getPropertyValue('--font-family-code')};
            --font-size-base: ${rootStyles.getPropertyValue('--font-size-base')};
            --line-height-base: ${rootStyles.getPropertyValue('--line-height-base')};
        }
    `;

    // 4. Create the final HTML structure.
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
                ${contentElement.innerHTML}
            </main>
        </body>
        </html>
    `;

    // 5. Create a blob and trigger download.
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
