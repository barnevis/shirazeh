/**
 * @file Smart Table of Contents (TOC) plugin for Shirazeh.
 */
import { injectCSS } from '../core/pluginManager.js';

export default class TocPlugin {
    /**
     * Called once when the plugin is initialized.
     * @param {App} app - The main application instance.
     */
    onInit(app) {
        this.app = app;
        this.config = app.config.toc || {};
        
        if (!this.config.enabled) {
            return;
        }

        const cssPath = app.resolvePath('src/plugins/toc.css');
        injectCSS(cssPath);

        this.container = document.createElement('aside');
        this.container.className = 'toc-container';
        document.body.appendChild(this.container);

        // Keep track of the last active link for scrollspy
        this.lastActiveLink = null;

        // Observer for scrollspy functionality
        this.observer = new IntersectionObserver(this._onObserve.bind(this), {
            // Trigger when a heading is in the top 25% of the viewport
            rootMargin: '0px 0px -75% 0px',
            threshold: 1.0,
        });

        this._setupEventListeners();
    }

    /**
     * Called every time a new page is rendered.
     * @param {HTMLElement} contentElement - The element containing the page's content.
     */
    onPageLoad(contentElement) {
        if (!this.config.enabled) {
            return;
        }

        // Clean up from previous page
        this.container.innerHTML = '';
        this.observer.disconnect();
        this.lastActiveLink = null;
        document.body.classList.remove('toc-active'); // Always reset on page load

        const headings = this._getHeadings(contentElement);

        // Hide TOC and remove body class if there are not enough headings
        if (headings.length < 2) {
            return;
        }
        
        // Add class to body to enable layout adjustments via CSS
        document.body.classList.add('toc-active');
        this._buildToc(headings);
        this._initializeToggles(); // Add toggles after building
    }
    
    /**
     * Gathers headings from the content based on configured max depth.
     * @param {HTMLElement} contentElement - The content area to scan.
     * @returns {HTMLElement[]} - An array of heading elements.
     * @private
     */
    _getHeadings(contentElement) {
        const maxDepth = this.config.maxDepth || 3;
        const selector = Array.from({ length: maxDepth }, (_, i) => `h${i + 1}`).join(', ');
        return Array.from(contentElement.querySelectorAll(selector));
    }

    /**
     * Builds the TOC HTML structure and appends it to the container using a robust stack-based algorithm.
     * @param {HTMLElement[]} headings - The heading elements to process.
     * @private
     */
    _buildToc(headings) {
        const titleEl = document.createElement('h4');
        titleEl.className = 'toc-title';
        titleEl.textContent = this.config.title || 'فهرست مطالب';
        this.container.appendChild(titleEl);

        const tocFragment = document.createDocumentFragment();
        // The stack holds parent elements for nesting. Starts with the fragment at level 0.
        const stack = [{ level: 0, el: tocFragment }];

        headings.forEach((heading, index) => {
            const level = parseInt(heading.tagName.substring(1), 10);
            
            // Ensure headings have an ID for linking
            if (!heading.id) {
                heading.id = `toc-heading-${index}`;
            }

            // Find the correct parent in the stack by popping elements with higher or equal level
            while (stack[stack.length - 1].level >= level) {
                stack.pop();
            }

            // The correct parent is now at the top of the stack
            let parent = stack[stack.length - 1].el;

            // Find or create the list (ul) to append the new item to
            let list = parent.querySelector('ul');
            if (!list) {
                list = document.createElement('ul');
                parent.appendChild(list);
            }

            const listItem = document.createElement('li');
            const link = document.createElement('a');
            link.href = `#${heading.id}`;
            link.textContent = heading.textContent;
            link.setAttribute('data-level', level);
            
            listItem.appendChild(link);
            list.appendChild(listItem);

            // Push the current list item to the stack, making it a potential parent for the next, deeper heading
            stack.push({ level: level, el: listItem });

            // Add heading to the observer for scrollspy
            this.observer.observe(heading);
        });

        this.container.appendChild(tocFragment);
    }
    
    /**
     * Post-processes the TOC to add toggle buttons for collapsible sections.
     * @private
     */
    _initializeToggles() {
        this.container.querySelectorAll('li').forEach(li => {
            const submenu = li.querySelector('ul');
            if (submenu) {
                li.classList.add('toc-item--parent', 'is-open'); // Set to open by default
    
                const wrapper = document.createElement('div');
                wrapper.className = 'toc-item-wrapper';
    
                const toggleButton = document.createElement('button');
                toggleButton.className = 'toc-toggle';
                toggleButton.setAttribute('aria-label', 'باز و بسته کردن زیرمنو');
                toggleButton.setAttribute('aria-expanded', 'true'); // Set to open by default
                toggleButton.innerHTML = `<span class="toc-toggle-icon" aria-hidden="true">›</span>`;
    
                const link = li.querySelector('a');
                if (link) {
                    // Move link into wrapper and add toggle
                    li.insertBefore(wrapper, link);
                    wrapper.appendChild(toggleButton);
                    wrapper.appendChild(link);
                }
            }
        });
    }

    /**
     * Sets up global event listeners for the plugin.
     * @private
     */
    _setupEventListeners() {
        this.container.addEventListener('click', (e) => {
            // Handle Toggling
            const toggle = e.target.closest('.toc-toggle');
            if (toggle) {
                e.preventDefault();
                const parentLi = toggle.closest('.toc-item--parent');
                if (parentLi) {
                    const isOpen = parentLi.classList.toggle('is-open');
                    toggle.setAttribute('aria-expanded', isOpen.toString());
                }
                return;
            }
            
            // Handle Smooth scroll for TOC links
            const link = e.target.closest('a');
            if (link) {
                e.preventDefault();
                const targetId = link.getAttribute('href');
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                    // Manually update hash.
                    window.history.replaceState(null, '', targetId);
                }
            }
        });
    }

    /**
     * Callback for the IntersectionObserver to handle scrollspy.
     * @param {IntersectionObserverEntry[]} entries - The entries reported by the observer.
     * @private
     */
    _onObserve(entries) {
        // Find the topmost visible heading among all intersecting entries
        let topEntry = null;
        for (const entry of entries) {
            if (entry.isIntersecting) {
                if (!topEntry || entry.boundingClientRect.top < topEntry.boundingClientRect.top) {
                    topEntry = entry;
                }
            }
        }

        // If a heading is in the observation zone, update the active link
        if (topEntry) {
            const activeLink = this.container.querySelector(`a[href="#${topEntry.target.id}"]`);
            
            // Only update if the active link has changed to prevent unnecessary DOM manipulation
            if (activeLink && activeLink !== this.lastActiveLink) {
                if (this.lastActiveLink) {
                    this.lastActiveLink.classList.remove('active');
                }
                activeLink.classList.add('active');
                this.lastActiveLink = activeLink;
            }
        }
    }

    /**
     * Called when the application is shutting down (for future use).
     */
    onDestroy() {
        if (this.observer) {
            this.observer.disconnect();
        }
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        document.body.classList.remove('toc-active');
    }
}