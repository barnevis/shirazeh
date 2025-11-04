/**
 * @file Shared utility functions.
 */

/**
 * Encodes a string to a UTF-8 safe Base64 string.
 * This function is safe for strings containing non-ASCII characters.
 * @param {string} str The string to encode.
 * @returns {string} The Base64 encoded string.
 */
export function utf8ToBase64(str) {
    try {
        // TextEncoder creates a stream of UTF-8 bytes.
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        
        // btoa expects a binary string, so we convert the byte array to one.
        const binaryString = String.fromCodePoint(...data);
        return btoa(binaryString);
    } catch (error) {
        console.error('Failed to encode string to Base64:', str, error);
        // Fallback for safety, though it may not be UTF-8 safe in all environments.
        return btoa(str); 
    }
}

/**
 * Decodes a Base64 string, assuming it was created from a UTF-8 string.
 * This function is safe for strings containing non-ASCII characters.
 * @param {string} b64 The Base64 string to decode.
 * @returns {string} The decoded string.
 */
export function base64ToUtf8(b64) {
    try {
        // atob decodes the Base64 string into a binary string.
        const binaryString = atob(b64);
        
        // We convert the binary string to a Uint8Array of bytes.
        const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
        
        // TextDecoder interprets the stream of UTF-8 bytes back into a string.
        const decoder = new TextDecoder();
        return decoder.decode(bytes);
    } catch (error) {
        console.error('Failed to decode Base64 string:', b64, error);
        // Fallback for safety.
        return atob(b64); 
    }
}

/**
 * Normalizes a local navigation path for consistent lookups.
 * - Strips query strings and hashes.
 * - Ensures a leading slash.
 * - Removes a trailing slash (unless it's the root path '/').
 * @param {string} path The path string to normalize.
 * @returns {string} The normalized path.
 */
export function normalizePath(path) {
    if (!path) return '/';

    // 1. Strip query string and hash
    let cleanPath = path.split(/[?#]/)[0];

    // 2. Remove trailing slash unless it's the root path
    if (cleanPath.length > 1 && cleanPath.endsWith('/')) {
        cleanPath = cleanPath.slice(0, -1);
    }
    
    // 3. Ensure leading slash
    if (!cleanPath.startsWith('/')) {
        cleanPath = '/' + cleanPath;
    }

    return cleanPath;
}

/**
 * Determines the MIME type of a file based on its extension.
 * @param {string} path The file path or URL.
 * @returns {string} The corresponding MIME type, or a default if not found.
 */
export function getMimeTypeFromPath(path) {
    const extension = path.split('.').pop().toLowerCase();
    switch (extension) {
        case 'png':
            return 'image/png';
        case 'ico':
            return 'image/x-icon';
        case 'svg':
            return 'image/svg+xml';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'gif':
            return 'image/gif';
        default:
            // A reasonable fallback for unknown image types.
            // Browsers are often smart enough to handle it.
            return 'image/png';
    }
}

/**
 * Resolves a relative path against a configured base path.
 * @param {string} relativePath - The path relative to the base path.
 * @param {string} basePath - The base path from the configuration.
 * @returns {string} The fully resolved path.
 */
export function resolvePath(relativePath, basePath) {
    // Simple path join, removes leading slash from relativePath if basePath is not empty.
    if (basePath && relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
    }
    return [basePath, relativePath]
        .filter(Boolean) // Remove empty parts
        .join('/')
        .replace(/\/\//g, '/'); // Avoid double slashes
}