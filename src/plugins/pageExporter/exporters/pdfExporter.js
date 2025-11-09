/**
 * @file PDF Exporter for the Page Exporter plugin.
 */

// A module-level promise to ensure the library is loaded only once.
let loadPromise = null;

/**
 * Dynamically loads the html2pdf.js library script and waits for it to be ready.
 * This version uses an event-driven approach (onload/onerror) instead of polling.
 * @param {App} app - The main application instance.
 * @returns {Promise<void>} A promise that resolves when the library is ready.
 */
function ensureLibraryLoaded(app) {
    // If the loading process has already been initiated, return the existing promise.
    if (loadPromise) {
        return loadPromise;
    }

    loadPromise = new Promise((resolve, reject) => {
        // If the library is already available, resolve immediately.
        if (typeof window.html2pdf === 'function') {
            return resolve();
        }
        
        const scriptId = 'shirazeh-html2pdf-script';
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = app.resolvePath('src/lib/vendor/html2pdf.bundle.min.js');
        script.async = true;

        script.onload = () => {
            // The script has loaded, but we must verify the global object exists.
            if (typeof window.html2pdf === 'function') {
                resolve();
            } else {
                loadPromise = null; // Allow retry on failure
                reject(new Error('html2pdf.js script loaded but failed to initialize.'));
            }
        };

        script.onerror = () => {
            loadPromise = null; // Allow retry on failure
            reject(new Error('Failed to load the html2pdf.js script file. Check the path and network connection.'));
        };

        document.head.appendChild(script);
    });
    
    return loadPromise;
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

    // First, ensure the script has been loaded and initialized.
    await ensureLibraryLoaded(app);
    
    // The ensureLibraryLoaded promise guarantees that html2pdf is now a function.
    const html2pdf = window.html2pdf;

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