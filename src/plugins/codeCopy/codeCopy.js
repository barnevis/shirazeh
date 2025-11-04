/**
 * @file Code Copy Plugin for Shirazeh.
 * Adds a "Copy" button to all code blocks for easy code copying.
 */
import { injectCSS } from '../../core/pluginManager.js';

export default class CodeCopyPlugin {
    /**
     * Called once when the plugin is initialized.
     * @param {App} app - The main application instance.
     */
    onInit(app) {
        this.app = app;
        
        // Inject the plugin's CSS file.
        const cssPath = app.resolvePath('src/plugins/codeCopy/codeCopy.css');
        injectCSS(cssPath);

        // Configuration defaults
        this.config = {
            buttonText: 'رونوشت',
            successText: 'رونوشت شد',
            errorText: 'خطا',
            successDuration: 2000,
            fadeDelay: 300,
            ...app.config.codeCopy // Override with user config if exists
        };
    }

    /**
     * Called every time a new page is rendered.
     * @param {HTMLElement} contentElement - The element containing the page's content.
     */
    onPageLoad(contentElement) {
        const codeBlocks = contentElement.querySelectorAll('pre');

        codeBlocks.forEach(block => {
            this._addCopyButton(block);
        });
    }

    /**
     * Adds a copy button to a code block.
     * @param {HTMLElement} block - The pre element containing code.
     * @private
     */
    _addCopyButton(block) {
        // Prevent adding multiple buttons if content is re-rendered
        if (block.querySelector('.copy-code-button')) {
            return;
        }

        const button = this._createButton();
        button.addEventListener('click', () => this._handleCopy(button, block));

        block.appendChild(button);
    }

    /**
     * Creates the copy button element.
     * @returns {HTMLButtonElement}
     * @private
     */
    _createButton() {
        const button = document.createElement('button');
        button.className = 'copy-code-button';
        button.setAttribute('type', 'button');
        button.setAttribute('aria-label', 'رونوشت کردن کد');
        button.textContent = this.config.buttonText;
        return button;
    }

    /**
     * Handles the copy action when button is clicked.
     * @param {HTMLButtonElement} button - The copy button.
     * @param {HTMLElement} block - The pre element containing code.
     * @private
     */
    _handleCopy(button, block) {
        const code = block.querySelector('code');
        if (!code) {
            console.warn('Code element not found in pre block');
            return;
        }

        const text = this._getCodeText(code);

        this._copyToClipboard(text)
            .then(() => this._showSuccess(button))
            .catch(err => this._showError(button, err));
    }

    /**
     * Extracts clean text from code element.
     * @param {HTMLElement} code - The code element.
     * @returns {string}
     * @private
     */
    _getCodeText(code) {
        // Use textContent to preserve formatting and avoid HTML entities
        return code.textContent || code.innerText || '';
    }

    /**
     * Copies text to clipboard using modern API with fallback.
     * @param {string} text - The text to copy.
     * @returns {Promise}
     * @private
     */
    async _copyToClipboard(text) {
        // Modern clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }

        // Fallback for older browsers
        return this._fallbackCopy(text);
    }

    /**
     * Fallback copy method for browsers that don't support clipboard API.
     * @param {string} text - The text to copy.
     * @returns {Promise}
     * @private
     */
    _fallbackCopy(text) {
        return new Promise((resolve, reject) => {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            textArea.setAttribute('aria-hidden', 'true');
            
            document.body.appendChild(textArea);
            textArea.select();

            try {
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                
                if (successful) {
                    resolve();
                } else {
                    reject(new Error('execCommand copy failed'));
                }
            } catch (err) {
                document.body.removeChild(textArea);
                reject(err);
            }
        });
    }

    /**
     * Shows success state on button.
     * @param {HTMLButtonElement} button - The copy button.
     * @private
     */
    _showSuccess(button) {
        button.textContent = this.config.successText;
        button.classList.add('success');
        button.disabled = true;

        setTimeout(() => {
            button.textContent = this.config.buttonText;
            button.classList.remove('success');
            button.disabled = false;
        }, this.config.successDuration);
    }

    /**
     * Shows error state on button.
     * @param {HTMLButtonElement} button - The copy button.
     * @param {Error} error - The error object.
     * @private
     */
    _showError(button, error) {
        console.error('Failed to copy code:', error);
        button.textContent = this.config.errorText;
        button.classList.add('error');

        setTimeout(() => {
            button.textContent = this.config.buttonText;
            button.classList.remove('error');
        }, this.config.successDuration);
    }

    /**
     * Cleanup when plugin is destroyed.
     */
    onDestroy() {
        // Remove all copy buttons
        document.querySelectorAll('.copy-code-button').forEach(button => {
            button.remove();
        });
    }
}
