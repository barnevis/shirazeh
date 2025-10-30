/**
 * @file Main entry point for PWiki. Initializes and starts the application.
 */
import { App } from './core/app.js';

const PWIKI_CONFIG = {
    contentElementId: '.content',
    sidebarNavElementId: '.sidebar-nav',
    sidebarToggleId: '.sidebar-toggle',
    sidebarFile: 'config/sidebar.md',
    defaultPage: 'README.md'
};

/**
 * Initializes the application.
 */
function main() {
    const pwikiApp = new App(PWIKI_CONFIG);
    pwikiApp.start();
}

// Run the main function after the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', main);