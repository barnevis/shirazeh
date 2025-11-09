/**
 * @file Manages the dynamic creation of the application's HTML layout.
 */
import { getElement } from './domRenderer.js';
import { getMimeTypeFromPath } from './utils.js';

export class LayoutManager {
    /**
     * @param {object} config - The application configuration object.
     * @param {App} app - The main App instance for resolving paths.
     */
    constructor(config, app) {
        this.config = config;
        this.app = app;
    }

    /**
     * Initializes the layout by creating the DOM structure and setting up the favicon.
     */
    init() {
        this._createLayout();
        this._setupFavicon();
    }

    /**
     * Creates the main application layout dynamically.
     * @private
     */
    _createLayout() {
        const rootElement = getElement(this.config.selectors.root);
        if (!rootElement) return;

        rootElement.innerHTML = ''; // Clear any existing content

        this._createWidgetSlots(rootElement); // Create global slots first.

        const appContainer = document.createElement('div');
        appContainer.className = 'app-container';

        // Always create the content area
        const content = document.createElement('main');
        content.className = 'content';

        if (this.config.sidebar && this.config.sidebar.enabled) {
            // Create Sidebar
            const sidebar = document.createElement('aside');
            sidebar.className = 'sidebar';

            const sidebarHeader = document.createElement('div');
            sidebarHeader.className = 'sidebar-header';
            
            const appTitleLink = document.createElement('a');
            appTitleLink.href = '#/';
            appTitleLink.className = 'app-title-link';

            // خواندن تنظیمات لوگو و نام برنامه
            const logoConfig = this.config.logo || {};
            const showLogo = logoConfig.enabled && logoConfig.src;
            // اگر showAppName تعریف نشده باشد (undefined)، به طور پیش‌فرض آن را true در نظر می‌گیریم
            const showAppName = logoConfig.showAppName !== false;

            // اگر نه لوگو و نه نام برنامه فعال باشند، یک کلاس برای مخفی‌سازی هدر اضافه می‌کنیم
            if (!showLogo && !showAppName) {
                sidebarHeader.classList.add('is-empty');
            } else {
                // اگر لوگو فعال است، آن را بساز
                if (showLogo) {
                    const logoImg = document.createElement('img');
                    logoImg.src = this.app.resolvePath(logoConfig.src);
                    logoImg.alt = `${this.config.appName} Logo`;
                    logoImg.className = 'app-logo';
                    logoImg.style.width = logoConfig.size || '32px';
                    logoImg.style.height = logoConfig.size || '32px';
                    appTitleLink.appendChild(logoImg);
                }

                // اگر نام برنامه فعال است، آن را بساز
                if (showAppName) {
                    const appTitle = document.createElement('h2');
                    appTitle.textContent = this.config.appName;
                    // تنظیم اندازه فونت فقط در صورتی که لوگو هم وجود داشته باشد منطقی است
                    if (showLogo) {
                        appTitle.style.fontSize = this.config.logo.appNameFontSize || '1.5rem';
                    }
                    appTitleLink.appendChild(appTitle);
                }
                sidebarHeader.appendChild(appTitleLink);
            }

            const sidebarHeaderActions = document.createElement('div');
            sidebarHeaderActions.id = 'widget-slot-sidebar-header-actions';
            sidebarHeaderActions.className = 'widget-slot';
            sidebarHeader.appendChild(sidebarHeaderActions);

            const sidebarNav = document.createElement('nav');
            sidebarNav.className = 'sidebar-nav';

            sidebar.appendChild(sidebarHeader);
            sidebar.appendChild(sidebarNav);

            const sidebarFooterActions = document.createElement('div');
            sidebarFooterActions.id = 'widget-slot-sidebar-footer-actions';
            sidebarFooterActions.className = 'widget-slot sidebar-footer';
            sidebar.appendChild(sidebarFooterActions);

            appContainer.appendChild(sidebar);

            // Create Toggle Button, append to root so it's a sibling of app-container
            const toggleButton = document.createElement('button');
            toggleButton.className = 'sidebar-toggle';
            toggleButton.setAttribute('aria-label', 'باز و بسته کردن منو');
            toggleButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
            rootElement.appendChild(toggleButton);
        }
        
        appContainer.appendChild(content);
        rootElement.appendChild(appContainer);
    }

    /**
     * Creates the global widget slot containers.
     * @param {HTMLElement} rootElement - The main app root element.
     * @private
     */
    _createWidgetSlots(rootElement) {
        if (!this.config.widgets || !this.config.widgets.enabled) return;

        const slotIds = [
            'dock-top-left', 'dock-top-right',
            'dock-bottom-left', 'dock-bottom-right',
            'fallback-right-stack'
        ];

        const container = document.createElement('div');
        container.className = 'widget-slots-container';

        slotIds.forEach(id => {
            const slot = document.createElement('div');
            slot.id = `widget-slot-${id}`;
            slot.className = `widget-slot slot-${id}`;
            container.appendChild(slot);
        });

        rootElement.appendChild(container);
    }

    /**
     * Dynamically creates and sets the favicon based on the configuration.
     * @private
     */
    _setupFavicon() {
        const faviconConfig = this.config.favicon;
        if (!faviconConfig || !faviconConfig.enabled) {
            return;
        }

        // Determine the source path: favicon.src has priority, fallback to logo.src
        let faviconSrc = faviconConfig.src;
        if (!faviconSrc) {
            const logoConfig = this.config.logo;
            if (logoConfig && logoConfig.enabled && logoConfig.src) {
                faviconSrc = logoConfig.src;
            }
        }

        // If no source is found, do nothing.
        if (!faviconSrc) {
            return;
        }
        
        const faviconPath = this.app.resolvePath(faviconSrc);
        
        let faviconType;
        if (faviconConfig.type === 'auto') {
            faviconType = getMimeTypeFromPath(faviconPath);
        } else {
            faviconType = faviconConfig.type || 'image/png';
        }

        // Remove any existing favicon links to avoid duplicates
        document.querySelectorAll("link[rel*='icon']").forEach(el => el.remove());

        // Create and append the new favicon link
        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = faviconType;
        link.href = faviconPath;
        document.head.appendChild(link);

        // Add a shortcut icon link for older browsers
        const shortcutLink = document.createElement('link');
        shortcutLink.rel = 'shortcut icon';
        shortcutLink.type = faviconType;
        shortcutLink.href = faviconPath;
        document.head.appendChild(shortcutLink);
    }

    /**
     * Adds a class to the body to disable the sidebar via CSS.
     */
    disableSidebar() {
        document.body.classList.add('sidebar-disabled');
    }
}