/**
 * @file Page Exporter Plugin for Shirazeh.
 * Allows exporting the current page to different formats like PDF, HTML, and Markdown.
 */
import { injectCSS } from '../../core/pluginManager.js';
import * as markdownExporter from './exporters/markdownExporter.js';
import * as htmlExporter from './exporters/htmlExporter.js';
import * as pdfExporter from './exporters/pdfExporter.js';

export default class PageExporterPlugin {
    onInit(app) {
        this.app = app;
        this.config = app.config.pageExporter || {};

        if (!this.config.enabled) return;

        injectCSS(app.resolvePath('src/plugins/pageExporter/pageExporter.css'));

        // Current page data, updated on each page load
        this.currentPage = {
            contentElement: null,
            rawMarkdown: '',
            filePath: '',
            title: '',
        };

        this.exporterModules = {
            md: markdownExporter,
            html: htmlExporter,
            pdf: pdfExporter,
        };

        this._createUi();
    }

    onPageLoad(contentElement) {
        if (!this.config.enabled) return;

        this.currentPage.contentElement = contentElement;
        this.currentPage.filePath = this.app.router.getFilePath(this.app.router.getCurrentPath());

        // Fetch raw markdown for the current page
        const resolvedPath = this.app.resolvePath(this.currentPage.filePath);
        fetch(resolvedPath)
            .then(res => res.text())
            .then(md => this.currentPage.rawMarkdown = md)
            .catch(err => {
                console.error('PageExporter: Could not fetch raw markdown.', err);
                this.currentPage.rawMarkdown = 'محتوای مارک‌داون یافت نشد.';
            });

        this.titleManager = this.app.titleManager;
        
        // Replace in-content download links
        this._replaceContentPlaceholders(contentElement);
    }

    _createUi() {
        const widgetContainer = document.createElement('div');
        widgetContainer.className = 'page-exporter-widget';

        this.mainButton = document.createElement('button');
        this.mainButton.setAttribute('type', 'button');
        this.mainButton.setAttribute('aria-haspopup', 'true');
        this.mainButton.setAttribute('aria-expanded', 'false');
        
        // Apply display mode style
        if (this.config.displayMode === 'button') {
            this.mainButton.className = 'exporter-button style-button';
            this.mainButton.innerHTML = `
                ${this._getIcon()}
                <span>${this.config.labels.button}</span>
            `;
        } else {
            this.mainButton.className = 'exporter-button style-icon';
            this.mainButton.setAttribute('aria-label', this.config.labels.button);
            this.mainButton.innerHTML = this._getIcon();
        }

        this.dropdown = this._createDropdown();
        widgetContainer.appendChild(this.mainButton);
        widgetContainer.appendChild(this.dropdown);

        this.mainButton.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.config.formats.length === 1) {
                this._triggerExport(this.config.formats[0]);
            } else {
                this._toggleDropdown();
            }
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!widgetContainer.contains(e.target) && this.dropdown.classList.contains('is-active')) {
                this._toggleDropdown(false);
            }
        });

        // Register with the widget system
        if (this.app.config.widgets.enabled) {
            this.app.widgetManager.register({
                id: this.config.widgetId,
                element: widgetContainer,
            });
        }
    }

    _createDropdown() {
        const dropdown = document.createElement('div');
        dropdown.className = 'exporter-dropdown';
        
        const title = document.createElement('p');
        title.className = 'dropdown-title';
        title.textContent = this.config.labels.downloadAs;
        dropdown.appendChild(title);
        
        const list = document.createElement('ul');
        list.className = 'dropdown-list';
        list.setAttribute('role', 'menu');

        this.config.formats.forEach(format => {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.setAttribute('type', 'button');
            button.setAttribute('role', 'menuitem');
            button.className = 'dropdown-item';
            button.dataset.format = format;
            button.textContent = this.config.labels[format] || format.toUpperCase();
            
            button.addEventListener('click', () => {
                this._toggleDropdown(false);
                this._triggerExport(format);
            });

            item.appendChild(button);
            list.appendChild(item);
        });

        dropdown.appendChild(list);
        return dropdown;
    }

    _toggleDropdown(forceState) {
        const isActive = this.dropdown.classList.toggle('is-active', forceState);
        this.mainButton.setAttribute('aria-expanded', isActive);
    }
    
    _getFilename() {
        // Update title right before generating filename
        this.currentPage.title = this.titleManager._getPageTitle({
            contentElement: this.currentPage.contentElement,
            router: this.app.router,
            sidebar: this.app.sidebar
        });
        
        const date = new Date().toISOString().split('T')[0];
        return this.config.filename
            .replace(/{{page-title}}/g, this.currentPage.title)
            .replace(/{{wiki-name}}/g, this.app.config.appName)
            .replace(/{{date}}/g, date)
            .replace(/[\\/:"*?<>|]/g, '-') // Sanitize filename
            .trim() || 'export';
    }

    async _triggerExport(format) {
        const exporter = this.exporterModules[format];
        if (!exporter) {
            console.error(`Exporter for format "${format}" not found.`);
            return;
        }

        const originalText = this.mainButton.innerHTML;
        this.mainButton.disabled = true;
        this.mainButton.innerHTML = `
            <div class="spinner"></div>
            <span>${this.config.labels.preparing}</span>
        `;
        
        try {
            const filename = this._getFilename();
            await exporter.export_({
                contentElement: this.currentPage.contentElement,
                rawMarkdown: this.currentPage.rawMarkdown,
                filename: filename,
                title: this.currentPage.title,
                app: this.app
            });
        } catch (error) {
            console.error(`Failed to export as ${format}:`, error);
        } finally {
            this.mainButton.disabled = false;
            this.mainButton.innerHTML = originalText;
        }
    }
    
    _replaceContentPlaceholders(contentElement) {
        contentElement.querySelectorAll('a[href="#download"]').forEach(link => {
            // Create a full button to replace the link
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'page-exporter-widget in-content';
            
            const button = document.createElement('button');
            button.setAttribute('type', 'button');
            button.className = 'exporter-button style-button';
            button.innerHTML = `
                ${this._getIcon()}
                <span>${link.textContent || this.config.labels.button}</span>
            `;
            
            const dropdown = this._createDropdown();
            buttonContainer.append(button, dropdown);
            
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.config.formats.length === 1) {
                    this._triggerExport(this.config.formats[0]);
                } else {
                    const isActive = dropdown.classList.toggle('is-active');
                    button.setAttribute('aria-expanded', isActive);
                }
            });

            link.replaceWith(buttonContainer);
        });
    }

    _getIcon() {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
    }
}