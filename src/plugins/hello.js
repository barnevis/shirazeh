/**
 * @file Sample "Hello World" plugin for Shirazeh, demonstrating the class-based structure.
 */
import { injectCSS } from '../core/pluginManager.js';

export default class HelloPlugin {
    /**
     * Called once when the plugin is initialized.
     * @param {App} app - The main application instance.
     */
    onInit(app) {
        console.log('HelloPlugin: onInit hook called!', { appName: app.config.appName });

        // Inject our custom CSS.
        // We use app.resolvePath to ensure the path is correct relative to basePath.
        const cssPath = app.resolvePath('src/plugins/hello.css');
        injectCSS(cssPath);
    }

    /**
     * Called every time a new page is rendered.
     * @param {HTMLElement} contentElement - The element containing the page's content.
     */
    onPageLoad(contentElement) {
        console.log('HelloPlugin: onPageLoad hook called!', { pageContent: contentElement.innerText.substring(0, 50) + '...' });
    }

    /**
     * Called when the application is shutting down (for future use).
     */
    onDestroy() {
        console.log('HelloPlugin: onDestroy hook called!');
    }
}