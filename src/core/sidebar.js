/**
 * @file Manages the sidebar, including loading content and handling interactions.
 */
import { getElement } from './domRenderer.js';
import { fetchContent } from './fileReader.js';

export class Sidebar {
    /**
     * @param {object} config - The sidebar configuration.
     * @param {string} config.navElementId - The ID of the navigation container element.
     * @param {string} config.toggleId - The ID of the toggle button.
     * @param {string} config.sidebarFile - The path to the sidebar markdown file.
     * @param {object} config.parser - The application's parser manager instance.
     * @param {object} config.config - The main application configuration.
     */
    constructor({ navElementId, toggleId, sidebarFile, parser, config }) {
        this.navElement = getElement(navElementId);
        this.toggle = getElement(toggleId);
        this.sidebarFile = sidebarFile;
        this.parser = parser;
        this.config = config || {};
        if (!this.parser) {
            throw new Error('Sidebar requires a parser instance.');
        }
    }

    /**
     * Initializes the sidebar functionality.
     */
    async init() {
        await this.load();
        this.setupEventListeners();
        // Collapse sidebar on mobile by default, keep it open on desktop.
        if (window.matchMedia("(max-width: 767px)").matches) {
            document.body.classList.add('sidebar-collapsed');
        }
    }

    /**
     * Fetches, parses, and renders the sidebar content.
     */
    async load() {
        try {
            const markdown = await fetchContent(this.sidebarFile);
            const html = this.parser.parse(markdown);
            this.navElement.innerHTML = html;
            this._initializeNestedMenu();
            
            // Process links to work with the router
            this.navElement.querySelectorAll('a').forEach(a => {
                const href = a.getAttribute('href');
                if (!href) return;

                const isRemoteEnabled = this.config.remote && this.config.remote.enabled;

                if (href.startsWith('http')) {
                    if (isRemoteEnabled) {
                        // If enabled, convert external URLs to the special remote route
                        const encodedUrl = btoa(href);
                        a.setAttribute('href', `#/remote/${encodedUrl}`);
                    } else {
                        // If disabled, treat as a standard external link opening in a new tab
                        a.setAttribute('target', '_blank');
                        a.setAttribute('rel', 'noopener noreferrer');
                    }
                } else if (!href.startsWith('#')) {
                    // For internal links, use the standard hash route
                    const hash = href === '/' ? '#/' : `#${href}`;
                    a.setAttribute('href', hash);
                }
            });
        } catch (error) {
            this.navElement.innerHTML = `<p class="error-message">منو بارگذاری نشد.</p>`;
            console.error("Failed to load sidebar:", error);
        }
    }

    /**
     * Processes the list items to add classes and toggles for nested menus.
     * @private
     */
    _initializeNestedMenu() {
        this.navElement.querySelectorAll('li').forEach(li => {
            const submenu = li.querySelector('ul');
            if (!submenu) return;

            li.classList.add('has-submenu');
            submenu.classList.add('submenu');

            const firstChildNode = Array.from(li.childNodes).find(node =>
                (node.nodeType === Node.ELEMENT_NODE) ||
                (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0)
            );

            let toggle;
            if (firstChildNode && firstChildNode.tagName === 'A') {
                toggle = firstChildNode;
            } else if (firstChildNode && firstChildNode.nodeType === Node.TEXT_NODE) {
                const button = document.createElement('button');
                button.setAttribute('type', 'button');
                button.setAttribute('aria-expanded', 'false');
                button.textContent = firstChildNode.textContent.trim();
                li.replaceChild(button, firstChildNode);
                toggle = button;
            }

            if (toggle) {
                toggle.classList.add('submenu-toggle');
                const arrow = document.createElement('span');
                arrow.className = 'submenu-arrow';
                arrow.setAttribute('aria-hidden', 'true');
                // Insert arrow before text to appear on the right in RTL
                toggle.insertBefore(arrow, toggle.firstChild);
            }
        });
    }

    /**
     * Sets up event listeners for sidebar toggles.
     */
    setupEventListeners() {
        this.toggle.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-collapsed');
        });

        this.navElement.addEventListener('click', (e) => {
            const toggle = e.target.closest('.submenu-toggle');
            if (!toggle) return;

            if (toggle.tagName === 'BUTTON') {
                e.preventDefault();
            }

            const parentLi = toggle.closest('.has-submenu');
            if (parentLi) {
                const isOpening = !parentLi.classList.contains('open');
                parentLi.classList.toggle('open');
                if (toggle.tagName === 'BUTTON') {
                    toggle.setAttribute('aria-expanded', isOpening);
                }
            }
        });

        // Add a listener to close the mobile sidebar when clicking outside of it.
        document.body.addEventListener('click', (e) => {
            const isMobile = window.matchMedia("(max-width: 767px)").matches;
            const isSidebarOpen = !document.body.classList.contains('sidebar-collapsed');

            if (isMobile && isSidebarOpen) {
                // Close if the click is outside the sidebar and not on the toggle button itself
                if (!e.target.closest('.sidebar') && !e.target.closest('.sidebar-toggle')) {
                    document.body.classList.add('sidebar-collapsed');
                }
            }
        });
    }

    /**
     * Highlights the active link in the sidebar and expands its parents.
     * @param {string} currentPath - The current navigation path.
     */
    setActiveLink(currentPath) {
        const links = this.navElement.querySelectorAll('a');
        let activeLink = null;
        
        // Deactivate all links and submenu parents first
        links.forEach(link => link.classList.remove('active'));
        this.navElement.querySelectorAll('.has-submenu').forEach(li => li.classList.remove('open'));

        links.forEach(link => {
            const linkPath = new URL(link.href).hash.substring(1) || '/';
            if (linkPath === currentPath) {
                link.classList.add('active');
                activeLink = link;
            }
        });

        // Open parents of the active link
        if (activeLink) {
            let parent = activeLink.parentElement;
            while (parent && parent !== this.navElement) {
                if (parent.classList.contains('has-submenu')) {
                    parent.classList.add('open');
                    const toggle = parent.querySelector('.submenu-toggle[aria-expanded]');
                    if (toggle) {
                       toggle.setAttribute('aria-expanded', 'true');
                    }
                }
                parent = parent.parentElement;
            }
        }
    }

    /**
     * Closes the sidebar on mobile if it's open.
     */
    closeMobileSidebar() {
        const isMobile = window.matchMedia("(max-width: 767px)").matches;
        const isSidebarOpen = !document.body.classList.contains('sidebar-collapsed');
        if (isMobile && isSidebarOpen) {
            document.body.classList.add('sidebar-collapsed');
        }
    }
}