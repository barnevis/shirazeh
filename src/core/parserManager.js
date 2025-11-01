/**
 * @file Manages the loading and execution of markdown parsers.
 */

export class ParserManager {
    /**
     * @param {object} config - The markdown configuration section from configManager.
     * @param {App} appInstance - The main application instance to resolve paths.
     */
    constructor(config, appInstance) {
        this.config = config || {};
        this.app = appInstance;
        this.parserInstance = null;
    }

    /**
     * Initializes the parser manager by loading the configured parser.
     */
    async init() {
        const parserConfig = this.config.parser || 'marked';
        let ParserClass;

        try {
            if (typeof parserConfig === 'string' && parserConfig === 'marked') {
                // Load built-in 'marked' parser
                const module = await import('../parsers/marked.js');
                ParserClass = module.default;
            } else if (typeof parserConfig === 'object' && parserConfig.path) {
                // Load custom parser from a given path
                const resolvedPath = this.app.resolvePath(parserConfig.path);
                const moduleUrl = new URL(resolvedPath, window.location.href).href;
                const module = await import(moduleUrl);
                ParserClass = module.default;
            } else {
                throw new Error(`Invalid parser configuration: ${JSON.stringify(parserConfig)}`);
            }

            if (typeof ParserClass !== 'function') {
                throw new Error('The specified parser module does not export a default class.');
            }
            
            this.parserInstance = new ParserClass();
            console.info(`Markdown parser loaded successfully.`);

        } catch (error) {
            console.error('Failed to initialize markdown parser:', error);
            // Fallback to a very basic, safe parser to prevent total app failure.
            this.parserInstance = {
                parse: (text) => `<pre>${text.replace(/</g, '&lt;')}</pre>`
            };
            throw new Error(`Markdown parser could not be loaded. Please check your 'markdown.parser' configuration. ${error.message}`);
        }
    }

    /**
     * Parses a markdown string into an HTML string using the loaded parser.
     * @param {string} markdown - The markdown string to parse.
     * @returns {string} The resulting HTML string.
     */
    parse(markdown) {
        if (!this.parserInstance) {
            throw new Error('Parser has not been initialized.');
        }

        const options = (typeof this.config.parser === 'object') ? this.config.parser.options : {};
        return this.parserInstance.parse(markdown, options);
    }
}