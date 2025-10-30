/**
 * @file Main entry point for PWiki. Initializes and starts the application.
 */
import { App } from './core/app.js';
import { getConfig } from './core/configManager.js';

/**
 * Initializes the application.
 */
async function main() {
    // Get the final configuration by merging user settings with defaults.
    const config = await getConfig();
    const pwikiApp = new App(config);
    pwikiApp.start();
}

// Run the main function after the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', main);