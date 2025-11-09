/**
 * @file PDF Exporter for the Page Exporter plugin.
 */

// A module-level promise to ensure the library is loaded only once.
let loadPromise = null;

/**
 * Dynamically loads the html2pdf.js library script and waits for it to be ready.
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
        
        // --- Start Polling for the library ---
        const checkInterval = 100; // ms
        const timeout = 7000; // 7 seconds
        let elapsedTime = 0;
        
        const intervalId = setInterval(() => {
            if (typeof window.html2pdf === 'function') {
                clearInterval(intervalId);
                resolve();
            } else {
                elapsedTime += checkInterval;
                if (elapsedTime >= timeout) {
                    clearInterval(intervalId);
                    loadPromise = null; // Allow retry on failure
                    reject(new Error('html2pdf.js library failed to initialize within the timeout period.'));
                }
            }
        }, checkInterval);

        // --- Inject the script if it doesn't exist ---
        const scriptId = 'shirazeh-html2pdf-script';
        if (!document.getElementById(scriptId)) {
            const script = document.createElement('script');
            script.id = scriptId;
            script.src = app.resolvePath('src/lib/vendor/html2pdf.bundle.min.js');
            script.onerror = () => {
                clearInterval(intervalId);
                loadPromise = null; // Allow retry on failure
                reject(new Error('Failed to load the html2pdf.js script file.'));
            };
            document.head.appendChild(script);
        }
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