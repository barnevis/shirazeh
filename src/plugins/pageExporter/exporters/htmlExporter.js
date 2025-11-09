/**
 * @file HTML Exporter for the Page Exporter plugin.
 */

/**
 * Creates a self-contained HTML file from the current page's content.
 * @param {object} data - The data required for the export.
 * @param {HTMLElement} data.contentElement - The main content DOM element.
 * @param {string} data.filename - The desired filename without extension.
 * @param {string} data.title - The title of the page.
 */
export async function exportToHtml(data) {
    const { contentElement, filename, title } = data;

    // 1. Gather all CSS rules from the document
    const styles = Array.from(document.styleSheets)
        .map(sheet => {
            try {
                return Array.from(sheet.cssRules)
                    .map(rule => rule.cssText)
                    .join('\n');
            } catch (e) {
                // Ignore stylesheets that can't be accessed (e.g., cross-origin)
                return '';
            }
        })
        .join('\n');

    // 2. Get the current theme
    const theme = document.documentElement.getAttribute('data-theme') || 'light';

    // 3. Create the HTML structure
    const htmlString = `
        <!DOCTYPE html>
        <html lang="fa" dir="rtl" data-theme="${theme}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <style>
                ${styles}
                /* Add specific print/export styles */
                body {
                    margin: 0;
                    background-color: var(--bg-color);
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

    // 4. Create a blob and trigger download
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

// Alias the main function for the plugin orchestrator
export const export_ = exportToHtml;