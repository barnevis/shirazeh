/**
 * @file Markdown Exporter for the Page Exporter plugin.
 */

/**
 * Creates a downloadable .md file from the current page's raw markdown.
 * @param {object} data - The data required for the export.
 * @param {string} data.rawMarkdown - The raw markdown content of the page.
 * @param {string} data.filename - The desired filename without extension.
 */
export async function export_(data) {
    const { rawMarkdown, filename } = data;

    const blob = new Blob([rawMarkdown], { type: 'text/markdown;charset=utf-8' });
    triggerDownload(blob, `${filename}.md`);
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
