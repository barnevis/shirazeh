/**
 * @file PDF Exporter for the Page Exporter plugin.
 */

let html2pdfLib = null;

/**
 * Dynamically loads the html2pdf.js library.
 * @param {App} app - The main application instance.
 * @returns {Promise<object>} The html2pdf library object.
 */
async function loadLibrary(app) {
    if (html2pdfLib) {
        return html2pdfLib;
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = app.resolvePath('src/lib/vendor/html2pdf.bundle.min.js');
        script.onload = () => {
            html2pdfLib = window.html2pdf;
            resolve(html2pdfLib);
        };
        script.onerror = () => {
            reject(new Error('Failed to load html2pdf.js library.'));
        };
        document.head.appendChild(script);
    });
}

/**
 * Creates a PDF file from the current page's content.
 * @param {object} data - The data required for the export.
 * @param {HTMLElement} data.contentElement - The main content DOM element.
 * @param {string} data.filename - The desired filename without extension.
 * @param {App} data.app - The main application instance.
 */
export async function export_(data) {
    const { contentElement, filename, app } = data;

    const html2pdf = await loadLibrary(app);

    const clonedContent = contentElement.cloneNode(true);
    
    // Set a specific width to ensure consistent rendering
    clonedContent.style.width = '800px';
    
    const options = {
        margin: [20, 15, 20, 15], // [top, left, bottom, right] in mm
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true, // For external images
            logging: false
        },
        jsPDF: {
            unit: 'mm',
            format: 'a4',
            orientation: 'portrait'
        },
        // This helps with page breaks
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    // The library handles the download process itself.
    await html2pdf().from(clonedContent).set(options).save();
}
