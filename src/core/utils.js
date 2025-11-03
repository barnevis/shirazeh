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
