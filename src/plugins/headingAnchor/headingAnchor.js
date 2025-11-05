/**
 * @file Heading Anchor Links Plugin for Shirazeh.
 * Adds a clickable anchor link to headings for easy sharing.
 */
import { injectCSS } from '../../core/pluginManager.js';

export default class HeadingAnchorPlugin {
    onInit(app) {
        this.app = app;
        this.config = {
            ...app.config.headingAnchor
        }; // Merge with defaults in configManager
        this.usedIds = new Set();
        this.tooltipTimeout = null;

        if (!this.config.enabled) {
            return;
        }

        const cssPath = app.resolvePath('src/plugins/headingAnchor/headingAnchor.css');
        injectCSS(cssPath);
    }

    onPageLoad(contentElement) {
        if (!this.config.enabled || !this.config.levels || this.config.levels.length === 0) {
            return;
        }

        this.usedIds.clear(); // Reset for each page load

        const selector = this.config.levels.map(level => `h${level}`).join(', ');
        const headings = contentElement.querySelectorAll(selector);

        headings.forEach(heading => {
            this._processHeading(heading);
        });
    }

    _processHeading(heading) {
        // 1. Generate a unique ID
        const id = this._generateUniqueId(heading.textContent);
        heading.id = id;

        // 2. Create the anchor link
        const anchor = document.createElement('a');
        anchor.className = 'heading-anchor-link';
        anchor.href = `#${id}`;
        anchor.innerHTML = this.config.icon || '#';
        anchor.setAttribute('aria-label', 'کپی کردن پیوند این بخش');

        // 3. Add click listener for copy functionality
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            this._copyLinkToClipboard(id);
        });

        // 4. Append the anchor to the heading
        heading.appendChild(anchor);
        heading.classList.add('heading-with-anchor');
    }

    _generateUniqueId(text) {
        // Slugify the text
        const baseId = text
            .trim()
            .toLowerCase()
            .replace(/[\u0600-\u06FF\s\w-]+/g, ' ') // Keep Persian, English, numbers, spaces, hyphens
            .replace(/[^\u0600-\u06FF\s\w-]/g, '') // Remove remaining special characters
            .trim()
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-'); // Replace multiple hyphens with a single one

        // Handle duplicates
        let finalId = baseId;
        let counter = 2;
        while (this.usedIds.has(finalId)) {
            finalId = `${baseId}-${counter}`;
            counter++;
        }

        this.usedIds.add(finalId);
        return finalId;
    }

    _copyLinkToClipboard(id) {
        const currentUrl = window.location.href;
        // The part of the URL before the hash fragment needs to be preserved.
        const baseUrl = currentUrl.split('#')[0];
        // The path part of our app route is inside the hash. We remove any existing anchor from it.
        const hashPath = (window.location.hash || '#/').split('#')[1];

        // Reconstruct the full URL with the correct path and new anchor.
        const textToCopy = `${baseUrl}#${hashPath}#${id}`;

        navigator.clipboard.writeText(textToCopy).then(() => {
            this._showTooltip(this.config.successMessage);
        }).catch(err => {
            console.error('Failed to copy heading link:', err);
        });
    }

    _showTooltip(message) {
        // Clear any existing tooltip timeout
        if (this.tooltipTimeout) {
            clearTimeout(this.tooltipTimeout);
            const existingTooltip = document.querySelector('.heading-anchor-tooltip');
            if (existingTooltip) existingTooltip.remove();
        }

        const tooltip = document.createElement('div');
        tooltip.className = 'heading-anchor-tooltip';
        tooltip.textContent = message;
        document.body.appendChild(tooltip);

        // Position tooltip (this is a simple implementation, can be improved)
        tooltip.style.opacity = '1';
        
        this.tooltipTimeout = setTimeout(() => {
            tooltip.style.opacity = '0';
            tooltip.addEventListener('transitionend', () => tooltip.remove());
        }, this.config.messageDuration);
    }
}