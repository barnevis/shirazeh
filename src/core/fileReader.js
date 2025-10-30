/**
 * @file Handles fetching file content over the network.
 */

/**
 * Fetches the content of a file.
 * @param {string} filePath - The path to the file to fetch.
 * @returns {Promise<string>} A promise that resolves with the text content of the file.
 * @throws {Error} If the network request fails or the file is not found.
 */
export async function fetchContent(filePath) {
    // Note: This fetch requires a simple local server (like `npx serve`) to run.
    // Opening index.html directly via the file:// protocol will not work
    // for fetching local files due to browser security restrictions (CORS).
    const response = await fetch(filePath);
    if (!response.ok) {
        throw new Error(`File ${filePath} not found. (Status: ${response.status})`);
    }
    return await response.text();
}
