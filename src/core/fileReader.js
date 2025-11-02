/**
 * @file Handles fetching file content over the network.
 */

/**
 * Checks if a given path is an absolute URL.
 * @param {string} path - The path to check.
 * @returns {boolean}
 */
function isAbsoluteUrl(path) {
    try {
        // A simple check using the URL constructor.
        // It will throw if the path is not a valid, absolute URL.
        new URL(path);
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Fetches the content of a file, either local or remote.
 * @param {string} filePath - The path to the file to fetch.
 * @param {object} [config={}] - The application's configuration object.
 * @returns {Promise<string>} A promise that resolves with the text content of the file.
 * @throws {Error} If the network request fails or the file is not found.
 */
export async function fetchContent(filePath, config = {}) {
    let fetchUrl = filePath;

    if (isAbsoluteUrl(filePath)) {
        const remoteConfig = config.remote || {};
        if (remoteConfig.enabled && remoteConfig.corsProxyUrl) {
            // Prepend the proxy URL to the target URL
            fetchUrl = `${remoteConfig.corsProxyUrl}${filePath}`;
        }
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) {
        throw new Error(`File ${filePath} not found. (Status: ${response.status})`);
    }
    return await response.text();
}