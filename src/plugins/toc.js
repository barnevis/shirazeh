
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
        this.usedIds = new Set(); // To track IDs on a per-page basis
        this.userInteracting = false; // Track if user is interacting with TOC

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
        document.body.classList.remove('toc-active');
        this.usedIds.clear(); // Reset for each new page

        const headings = this._getHeadings(contentElement);

        if (headings.length < 2) {
            return;
        }
        
        document.body.classList.add('toc-active');
        this._buildToc(headings);
        this._initializeToggles();
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
     * Extracts the clean text content of a heading, ignoring the anchor link.
     * @param {HTMLElement} heading - The heading element.
     * @returns {string} The clean text content.
     * @private
     */
    _getCleanHeadingText(heading) {
        let cleanText = '';
        for (const node of heading.childNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('heading-anchor-link')) {
                continue;
            }
            cleanText += node.textContent;
        }
        return cleanText.trim();
    }
    
    /**
     * Generates a unique ID for a heading.
     * @param {string} text - The heading text.
     * @returns {string} A unique, URL-friendly ID.
     * @private
     */
    _generateUniqueId(text) {
        const baseId = text
            .trim()
            .toLowerCase()
            .replace(/[^\u0600-\u06FF\w\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');

        let finalId = baseId || 'section';
        let counter = 2;
        while (this.usedIds.has(finalId)) {
            finalId = `${baseId}-${counter}`;
            counter++;
        }

        this.usedIds.add(finalId);
        return finalId;
    }

    /**
     * Builds the TOC HTML structure.
     * @param {HTMLElement[]} headings - The heading elements to process.
     * @private
     */
    _buildToc(headings) {
        const titleEl = document.createElement('h4');
        titleEl.className = 'toc-title';
        titleEl.textContent = this.config.title || 'فهرست مطالب';
        this.container.appendChild(titleEl);

        const tocFragment = document.createDocumentFragment();
        const stack = [{ level: 0, el: tocFragment }];

        headings.forEach(heading => {
            const level = parseInt(heading.tagName.substring(1), 10);
            const cleanText = this._getCleanHeadingText(heading);

            // Generate the ID using the exact same logic as the headingAnchor plugin.
            const id = this._generateUniqueId(cleanText);
            
            // Set the generated ID on the heading element itself.
            heading.id = id;

            while (stack[stack.length - 1].level >= level) {
                stack.pop();
            }

            let parent = stack[stack.length - 1].el;
            let list = parent.querySelector('ul');
            
            // If the parent is a 'toc-sub-wrapper', we need to find the UL inside it
            // or if it's the root fragment, we look directly.
            // But since we are building linearly, 'parent' here is either the fragment or an LI.
            // If it's an LI, we append the UL to it directly. The wrapping happens later in _initializeToggles.
            
            if (!list) {
                list = document.createElement('ul');
                parent.appendChild(list);
            }

            const listItem = document.createElement('li');
            const link = document.createElement('a');
            
            // Build complete URL like HeadingAnchor plugin
            const currentUrl = window.location.href;
            const baseUrl = currentUrl.split('#')[0];
            const hashPath = (window.location.hash || '#/').substring(1).split('#')[0];
            link.href = `${baseUrl}#${hashPath}#${id}`;
            
            link.textContent = cleanText;
            link.setAttribute('data-level', level);
            
            listItem.appendChild(link);
            list.appendChild(listItem);

            stack.push({ level: level, el: listItem });
            this.observer.observe(heading);
        });

        this.container.appendChild(tocFragment);
    }
    
    /**
     * Post-processes the TOC to add toggle buttons and wrap submenus for animation.
     * @private
     */
    _initializeToggles() {
        // Iterate over all LIs that have a submenu
        this.container.querySelectorAll('li').forEach(li => {
            const submenu = li.querySelector('ul');
            if (submenu) {
                li.classList.add('toc-item--parent', 'is-open');
    
                // 1. Create wrapper for the Toggle + Link
                const itemWrapper = document.createElement('div');
                itemWrapper.className = 'toc-item-wrapper';
    
                const toggleButton = document.createElement('button');
                toggleButton.className = 'toc-toggle';
                toggleButton.setAttribute('aria-label', 'باز و بسته کردن زیرمنو');
                toggleButton.setAttribute('aria-expanded', 'true');
                toggleButton.innerHTML = `<span class="toc-toggle-icon" aria-hidden="true">›</span>`;
    
                const link = li.querySelector('a');
                if (link) {
                    // Move the link inside the wrapper and add the button
                    li.insertBefore(itemWrapper, link);
                    itemWrapper.appendChild(toggleButton);
                    itemWrapper.appendChild(link);
                }
                
                // 2. Wrap the submenu UL in a grid wrapper for animation
                const subWrapper = document.createElement('div');
                subWrapper.className = 'toc-sub-wrapper';
                
                // Insert subWrapper before the submenu (which is currently a child of LI)
                li.insertBefore(subWrapper, submenu);
                // Move submenu inside the subWrapper
                subWrapper.appendChild(submenu);
            }
        });
    }

    /**
     * Sets up global event listeners for the plugin.
     * @private
     */
    _setupEventListeners() {
        // Track user interaction to pause auto-scroll
        this.container.addEventListener('mouseenter', () => {
            this.userInteracting = true;
        });

        this.container.addEventListener('mouseleave', () => {
            this.userInteracting = false;
        });

        this.container.addEventListener('click', (e) => {
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
            
            const link = e.target.closest('a');
            if (link) {
                e.preventDefault();
                const href = link.getAttribute('href');
                if (!href || href === '#') return;

                // Extract the anchor ID from the full URL
                const parts = href.split('#');
                const targetId = parts[parts.length - 1];
                const targetElement = document.getElementById(targetId);
                
                if (targetElement) {
                    targetElement.scrollIntoView({ behavior: 'smooth' });
                    window.history.replaceState(null, '', href);
                    
                    // Update active state manually
                    if (this.lastActiveLink) this.lastActiveLink.classList.remove('active');
                    link.classList.add('active');
                    this.lastActiveLink = link;
                    
                    // Force scroll to item even if hovering, because user explicitly clicked it
                    // We disable the 'interacting' lock momentarily for this action
                    const wasInteracting = this.userInteracting;
                    this.userInteracting = false;
                    this._scrollToActiveItem(link);
                    this.userInteracting = wasInteracting;
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
        let topEntry = null;
        for (const entry of entries) {
            if (entry.isIntersecting) {
                if (!topEntry || entry.boundingClientRect.top < topEntry.boundingClientRect.top) {
                    topEntry = entry;
                }
            }
        }

        if (topEntry) {
            const activeLink = this.container.querySelector(`a[href*="#${topEntry.target.id}"]`);
            
            if (activeLink && activeLink !== this.lastActiveLink) {
                if (this.lastActiveLink) {
                    this.lastActiveLink.classList.remove('active');
                }
                activeLink.classList.add('active');
                this.lastActiveLink = activeLink;
                
                // Only auto-scroll the TOC container if the user isn't interacting with it.
                if (!this.userInteracting) {
                    this._scrollToActiveItem(activeLink);
                }
            }
        }
    }
    
    /**
     * Scrolls the TOC container so that the active item is visible.
     * @param {HTMLElement} activeLink - The currently active link element in the TOC.
     * @private
     */
    _scrollToActiveItem(activeLink) {
        if (!this.container) return;
        
        // Use 'nearest' to minimize jumping. It scrolls just enough to bring the item into view.
        activeLink.scrollIntoView({
            block: 'nearest',
            inline: 'nearest',
            behavior: 'smooth'
        });
    }

    /**
     * Called when the application is shutting down.
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
