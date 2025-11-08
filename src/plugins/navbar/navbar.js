/**
 * @file Navbar Plugin for Shirazeh.
 * Creates a configurable, responsive top navigation bar.
 */
import { injectCSS } from '../../core/pluginManager.js';
import { fetchContent } from '../../core/fileReader.js';

export default class NavbarPlugin {
    /**
     * یک بار هنگام مقداردهی اولیه افزونه فراخوانی می‌شود.
     * @param {App} app - نمونه اصلی برنامه.
     */
    async onInit(app) {
        this.app = app;
        this.config = app.config.navbar || {};
        this.lastScrollY = 0;

        // اگر افزونه غیرفعال باشد، هیچ کاری انجام نده.
        if (!this.config.enabled) return;

        // تزریق فایل CSS افزونه.
        injectCSS(app.resolvePath('src/plugins/navbar/navbar.css'));

        try {
            // ساختار اصلی نوار ناوبری را در DOM ایجاد کن.
            this._createNavbarContainer();
            
            // محتوای فایل مارک‌داون را واکشی و پردازش کن.
            const markdown = await fetchContent(this.app.resolvePath(this.config.source));
            const structure = this._parseMarkdown(markdown);
            
            // ساختار پردازش شده را به HTML تبدیل و رندر کن.
            this._renderStructure(structure);
            
            // شنونده‌های رویداد را برای تعاملات (اسکرول، کلیک و...) تنظیم کن.
            this._setupEventListeners();
            
            // برای حالت چسبنده، padding بدنه را تنظیم کن.
            if (this.config.sticky) {
                this._updateBodyPadding();
            }
        } catch (error) {
            console.error('NavbarPlugin failed to initialize:', error);
            // در صورت بروز خطا، نوار ناوبری را مخفی کن تا چیدمان به هم نریزد.
            if (this.navbarEl) this.navbarEl.style.display = 'none';
        }
    }

    /**
     * هر بار که یک صفحه جدید رندر می‌شود، فراخوانی می‌شود.
     */
    onPageLoad() {
        if (!this.config.enabled || !this.navbarEl) return;
        
        // لینک فعال در نوار ناوبری را به‌روزرسانی کن.
        this._updateActiveLink();
        
        // اگر منوی موبایل باز است، آن را ببند.
        if (document.body.classList.contains('mobile-menu-open')) {
            document.body.classList.remove('mobile-menu-open');
            this.hamburgerBtn.setAttribute('aria-expanded', 'false');
        }
    }

    /**
     * کانتینر اصلی نوار ناوبری و دکمه همبرگری را ایجاد می‌کند.
     * @private
     */
    _createNavbarContainer() {
        // افزودن یک کلاس به body برای اینکه سایر کامپوننت‌ها از وجود نوار ناوبری مطلع شوند
        document.body.classList.add('shirazeh-navbar-active');
        
        this.navbarEl = document.createElement('nav');
        this.navbarEl.className = 'navbar-container';
        
        if (this.config.sticky) {
            this.navbarEl.classList.add('is-sticky');
        }

        // تنظیم متغیرهای CSS به صورت سراسری تا سایر فایل‌های CSS بتوانند از آن‌ها استفاده کنند
        document.documentElement.style.setProperty('--navbar-height', this.config.height || '64px');
        document.documentElement.style.setProperty('--navbar-height-scrolled', this.config.heightScrolled || '56px');
        
        const wrapper = document.createElement('div');
        wrapper.className = 'navbar-wrapper';
        
        // ایجاد سه بخش اصلی: چپ، وسط و راست
        this.leftSection = document.createElement('div');
        this.leftSection.className = 'navbar-section navbar-left';
        
        this.centerSection = document.createElement('div');
        this.centerSection.className = 'navbar-section navbar-center';

        this.rightSection = document.createElement('div');
        this.rightSection.className = 'navbar-section navbar-right';

        // ایجاد دکمه همبرگری برای موبایل
        this.hamburgerBtn = document.createElement('button');
        this.hamburgerBtn.className = 'hamburger-button';
        this.hamburgerBtn.setAttribute('type', 'button');
        this.hamburgerBtn.setAttribute('aria-label', 'باز کردن منو');
        this.hamburgerBtn.setAttribute('aria-expanded', 'false');
        this.hamburgerBtn.innerHTML = `<span></span><span></span><span></span>`;

        wrapper.append(this.leftSection, this.centerSection, this.rightSection, this.hamburgerBtn);
        this.navbarEl.appendChild(wrapper);

        // نوار ناوبری را در ابتدای بدنه صفحه قرار بده.
        document.body.prepend(this.navbarEl);
    }
    
    /**
     * محتوای مارک‌داون را خط به خط پردازش کرده و به یک ساختار شیء تبدیل می‌کند.
     * @param {string} markdown - محتوای فایل `navbar.md`.
     * @returns {object} - یک شیء با سه آرایه برای بخش‌های چپ، وسط و راست.
     * @private
     */
    _parseMarkdown(markdown) {
        const structure = { left: [], center: [], right: [] };
        let currentPosition = 'center';
        const stack = [{ items: structure.center, level: -1 }];
        const lines = markdown.split('\n');

        const positionRegex = /\{\.?position:\s*(left|center|right)\s*\}/;
        const itemRegex = /^(\s*)-\s*(.*)/;
        const specialSyntaxRegex = /\{.([^}]+)\}/;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            // بررسی دستور موقعیت‌یابی
            const posMatch = trimmedLine.match(positionRegex);
            if (posMatch) {
                currentPosition = posMatch[1];
                stack.splice(1); // ریست کردن پشته
                stack[0] = { items: structure[currentPosition], level: -1 };
                continue;
            }

            // بررسی آیتم لیست
            const itemMatch = line.match(itemRegex);
            if (itemMatch) {
                const indentation = itemMatch[1].length;
                const level = Math.floor(indentation / 2);
                let content = itemMatch[2].trim();
                
                // FIX: Strip HTML comments before parsing the content
                content = content.replace(/<!--.*-->/, '').trim();

                const item = { text: content, children: [] };
                
                // پردازش سینتکس‌های ویژه ({.cta}, {.badge:..})
                const specialMatch = content.match(specialSyntaxRegex);
                if (specialMatch) {
                    const syntax = specialMatch[1].trim();
                    if (syntax === 'cta') {
                        item.isCta = true;
                    } else if (syntax.startsWith('badge:')) {
                        item.badge = syntax.substring(6).trim();
                    }
                    content = content.replace(specialMatch[0], '').trim();
                }

                // بررسی برای جداکننده
                if (content === '---') {
                    item.isDivider = true;
                } else {
                    // پردازش لینک
                    const linkMatch = content.match(/\[(.*?)\]\((.*?)\)/);
                    if (linkMatch) {
                        item.text = linkMatch[1];
                        item.href = linkMatch[2];
                    } else {
                        item.text = content; // آیتم بدون لینک
                    }
                }

                // مدیریت ساختار تودرتو (منوی باز شونده)
                while (level <= stack[stack.length - 1].level) {
                    stack.pop();
                }
                stack[stack.length - 1].items.push(item);
                stack.push({ items: item.children, level: level });
            }
        }
        return structure;
    }

    /**
     * ساختار شیء پردازش شده را به عناصر HTML تبدیل و در نوار ناوبری رندر می‌کند.
     * @param {object} structure - شیء خروجی از `_parseMarkdown`.
     * @private
     */
    _renderStructure(structure) {
        // افزودن لوگو و نام برنامه به بخش چپ (بر اساس کانفیگ)
        const logoConfig = this.config.logo;
        const appNameConfig = this.config.appName;
        if (logoConfig.show || appNameConfig.show) {
            const brandLink = document.createElement('a');
            brandLink.href = '#/';
            brandLink.className = 'navbar-brand';

            if (logoConfig.show) {
                const logoSrc = logoConfig.src || this.app.config.logo.src;
                if (logoSrc) {
                    const logoImg = document.createElement('img');
                    logoImg.src = this.app.resolvePath(logoSrc);
                    logoImg.alt = 'Logo';
                    logoImg.className = 'navbar-logo';
                    logoImg.style.width = logoImg.style.height = logoConfig.size;
                    brandLink.appendChild(logoImg);
                }
            }
            if (appNameConfig.show) {
                const appNameText = appNameConfig.text || this.app.config.appName;
                const appNameEl = document.createElement('span');
                appNameEl.className = 'navbar-app-name';
                appNameEl.textContent = appNameText;
                brandLink.appendChild(appNameEl);
            }
            this.leftSection.appendChild(brandLink);
        }

        // رندر کردن منوهای چپ، وسط و راست
        this.leftSection.appendChild(this._buildMenuList(structure.left));
        this.centerSection.appendChild(this._buildMenuList(structure.center));
        this.rightSection.appendChild(this._buildMenuList(structure.right));
    }
    
    /**
     * یک لیست از آیتم‌ها را به یک عنصر `<ul>` تبدیل می‌کند.
     * @param {Array<object>} items - آرایه‌ای از آیتم‌های منو.
     * @returns {HTMLUListElement} - عنصر `<ul>` ساخته شده.
     * @private
     */
    _buildMenuList(items) {
        const ul = document.createElement('ul');
        ul.className = 'navbar-menu';
        items.forEach(item => {
            const li = document.createElement('li');
            li.className = 'navbar-item';

            if (item.isDivider) {
                li.classList.add('is-divider');
                ul.appendChild(li);
                return;
            }

            const link = document.createElement('a');
            link.innerHTML = item.text; // از innerHTML برای پشتیبانی از آیکون‌های SVG/HTML استفاده می‌کنیم

            if (item.href) {
                // تبدیل لینک‌های داخلی به فرمت روتر (#/path)
                if (item.href.startsWith('/') && !item.href.startsWith('//')) {
                    link.href = `#${item.href}`;
                } else {
                    link.href = item.href;
                    // لینک‌های خارجی را در تب جدید باز کن
                    if (item.href.startsWith('http')) {
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                    }
                }
            }
            
            if (item.isCta) link.classList.add('is-cta');
            if (item.badge) {
                const badge = document.createElement('span');
                badge.className = 'badge';
                badge.textContent = item.badge;
                link.appendChild(badge);
            }

            li.appendChild(link);

            // اگر آیتم فرزند داشت، یک زیرمنو (dropdown) بساز
            if (item.children && item.children.length > 0) {
                li.classList.add('has-dropdown');
                const dropdownMenu = this._buildMenuList(item.children);
                dropdownMenu.classList.add('dropdown-menu');
                li.appendChild(dropdownMenu);
            }
            ul.appendChild(li);
        });
        return ul;
    }

    /**
     * شنونده‌های رویداد برای اسکرول، تغییر اندازه صفحه و منوی موبایل را تنظیم می‌کند.
     * @private
     */
    _setupEventListeners() {
        const dropdowns = this.navbarEl.querySelectorAll('.has-dropdown');
        const isMobile = () => window.innerWidth <= parseInt(this.config.mobile.breakpoint, 10);

        dropdowns.forEach(dropdown => {
            // --- رفتار هاور برای دسکتاپ ---
            dropdown.addEventListener('mouseenter', () => {
                if (isMobile()) return;

                // بستن زیرمنوهای هم‌سطح
                const parentList = dropdown.parentElement;
                parentList.querySelectorAll(':scope > .has-dropdown').forEach(sibling => {
                    if (sibling !== dropdown) {
                        sibling.classList.remove('is-active');
                    }
                });
                dropdown.classList.add('is-active');
            });

            dropdown.addEventListener('mouseleave', () => {
                if (isMobile()) return;
                dropdown.classList.remove('is-active');
            });
            
            // --- رفتار کلیک برای موبایل ---
            const toggleLink = dropdown.querySelector(':scope > a');
            if(toggleLink) {
                toggleLink.addEventListener('click', (e) => {
                    if (!isMobile()) return;
                    
                    e.preventDefault();
                    
                    const wasActive = dropdown.classList.contains('is-active');

                    // بستن زیرمنوهای هم‌سطح
                    const parentList = dropdown.parentElement;
                    parentList.querySelectorAll(':scope > .has-dropdown').forEach(sibling => {
                         if (sibling !== dropdown) {
                            sibling.classList.remove('is-active');
                         }
                    });
                     
                    if (!wasActive) {
                        dropdown.classList.add('is-active');
                    } else {
                        dropdown.classList.remove('is-active');
                    }
                });
            }
        });

        // بستن تمام منوها با ترک کردن کل نوار ناوبری
        this.navbarEl.addEventListener('mouseleave', () => {
             if (isMobile()) return;
             this.navbarEl.querySelectorAll('.has-dropdown.is-active').forEach(item => {
                item.classList.remove('is-active');
            });
        });
    
        // مدیریت دکمه همبرگری
        this.hamburgerBtn.addEventListener('click', () => {
            const isOpen = document.body.classList.toggle('mobile-menu-open');
            this.hamburgerBtn.setAttribute('aria-expanded', isOpen.toString());
        });
        
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            if (scrollTimeout) window.cancelAnimationFrame(scrollTimeout);
            scrollTimeout = window.requestAnimationFrame(this._handleScroll.bind(this));
        }, { passive: true });
    
        window.addEventListener('resize', this._updateBodyPadding.bind(this));
    }
    
    /**
     * رفتار نوار ناوبری را بر اساس موقعیت اسکرول مدیریت می‌کند.
     * @private
     */
    _handleScroll() {
        if (!this.config.sticky) return;
        
        const currentScrollY = window.scrollY;
        const isScrolled = currentScrollY > 10;
        
        // رفتار کوچک/پنهان شدن
        if (this.config.scrollBehavior === 'shrink' || this.config.scrollBehavior === 'hide') {
            document.body.classList.toggle('navbar-scrolled', isScrolled);
        }
        
        // منطق پیشرفته برای پنهان شدن هوشمند
        if (this.config.scrollBehavior === 'hide' && isScrolled) {
            const isScrollingDown = currentScrollY > this.lastScrollY;
            this.navbarEl.classList.toggle('is-hidden', isScrollingDown);
        }
        
        this.lastScrollY = currentScrollY < 0 ? 0 : currentScrollY;
    }

    /**
     * لینک فعال را بر اساس URL فعلی هایلایت می‌کند.
     * @private
     */
    _updateActiveLink() {
        const currentPath = window.location.hash.substring(1) || '/';
        const cleanPath = currentPath.split('#')[0];

        this.navbarEl.querySelectorAll('a.is-active').forEach(a => a.classList.remove('is-active'));
        
        const links = this.navbarEl.querySelectorAll('a[href]');
        let bestMatch = null;
        
        links.forEach(link => {
            const linkPath = (new URL(link.href).hash || '').substring(1);
            if (!linkPath) return;

            // پیدا کردن بهترین تطابق (طولانی‌ترین مسیر منطبق)
            if (cleanPath.startsWith(linkPath)) {
                if (!bestMatch || linkPath.length > bestMatch.dataset.path.length) {
                    bestMatch = link;
                    bestMatch.dataset.path = linkPath;
                }
            }
        });
        
        if (bestMatch) {
            bestMatch.classList.add('is-active');
            // فعال کردن والد در منوی باز شونده
            let parent = bestMatch.closest('.has-dropdown');
            while(parent) {
                const parentLink = parent.querySelector(':scope > a');
                if (parentLink) {
                    parentLink.classList.add('is-active');
                }
                parent = parent.parentElement.closest('.has-dropdown');
            }
        }
    }

    /**
     * `padding-top` بدنه صفحه را برای جلوگیری از همپوشانی با نوار چسبنده تنظیم می‌کند.
     * @private
     */
    _updateBodyPadding() {
        if (this.config.sticky) {
            const height = this.navbarEl.offsetHeight;
            document.body.style.paddingTop = `${height}px`;
        } else {
            document.body.style.paddingTop = '0px';
        }
    }
}