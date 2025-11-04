/**
 * @file Plugin to add a "Copy" button to code blocks.
 */
import { injectCSS } from '../../core/pluginManager.js';

export default class CodeCopyPlugin {
    /**
     * Called once when the plugin is initialized.
     * @param {App} app - The main application instance.
     */
    onInit(app) {
        // Inject the plugin's CSS file.
        const cssPath = app.resolvePath('src/plugins/codeCopy/codeCopy.css');
        injectCSS(cssPath);
    }

    /**
     * Called every time a new page is rendered.
     * @param {HTMLElement} contentElement - The element containing the page's content.
     */
    onPageLoad(contentElement) {
        const codeBlocks = contentElement.querySelectorAll('pre');

        codeBlocks.forEach(block => {
            // Prevent adding multiple buttons if the page content is re-rendered without a full reload.
            if (block.querySelector('.copy-code-button')) {
                return;
            }

            const button = document.createElement('button');
            button.className = 'copy-code-button';
            button.setAttribute('type', 'button');
            button.setAttribute('aria-label', 'رونوشت کردن کد');
            button.textContent = 'رونوشت';

            button.addEventListener('click', () => {
                const code = block.querySelector('code');
                if (code) {
                    navigator.clipboard.writeText(code.innerText).then(() => {
                        button.textContent = 'رونوشت شد';
                        button.disabled = true;
                        setTimeout(() => {
                            button.textContent = 'رونوشت';
                            button.disabled = false;
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy code: ', err);
                        button.textContent = 'خطا';
                    });
                }
            });

            block.appendChild(button);
        });
    }
}
