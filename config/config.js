/**
 * @file فایل تنظیمات مرکزی شیرازه
 * =================================================================
 * این فایل به شما اجازه می‌دهد تا تمام جنبه‌های شیرازه را شخصی‌سازی کنید.
 * مقادیر موجود در این فایل، تنظیمات پیش‌فرض برنامه را بازنویسی می‌کنند.
 * نیازی نیست تمام گزه‌ها را پر کنید؛ فقط مواردی که قصد تغییرشان را دارید، نگه دارید.
 * 
 * برای اعمال تغییرات، کافیست این فایل را ویرایش و صفحه را رفرش کنید.
 */

window.shirazeh = {
  /**
   * @property {string} appName
   * نام ویکی شما که در هدر سایدبار نمایش داده می‌شود.
   */
  appName: 'شیرازه',
  
  /**
   * @property {string} basePath
   * مسیر پایه ویکی شما. اگر پروژه شما در یک زیرپوشه (مثلاً 'docs/') قرار دارد،
   * این مقدار را روی آن پوشه تنظیم کنید. برای حالت عادی، '.' کافیست.
   * مثال: basePath: 'my-wiki'
   */
  basePath: '.',

  /**
   * @property {object} files
   * مسیر فایل‌های اصلی پروژه. تمام مسیرها نسبت به `basePath` سنجیده می‌شوند.
   */
  files: {
    /**
     * @property {string} sidebar - فایل مارک‌داون که ساختار منوی کناری را مشخص می‌کند.
     */
    sidebar: 'config/sidebar.md',
    
    /**
     * @property {string} defaultPage - فایلی که به عنوان صفحه اصلی (/) نمایش داده می‌شود.
     */
    defaultPage: 'README.md',

    /**
     * @property {string} notFoundPage - فایلی که در صورت پیدا نشدن یک صفحه (خطای 404) نمایش داده می‌شود.
     */
    notFoundPage: 'config/404.md'
  },

  /**
   * @property {Array<string>} plugins
   * لیستی از مسیر فایل‌های افزونه‌هایی که باید بارگذاری شوند.
   * مسیرها نسبت به `basePath` سنجیده می‌شوند.
   */
  plugins: [
    'src/plugins/toc.js' // فعال‌سازی افزونه فهرست مطالب
  ],

  /**
   * @property {object} markdown
   * تنظیمات مربوط به مفسر مارک‌داون.
   */
  markdown: {
    /**
     * @property {string|object} parser
     * مفسر مارک‌داون مورد استفاده را مشخص می‌کند.
     * - برای استفاده از مفسر داخلی، نام آن را به صورت رشته وارد کنید (مثلاً 'parsneshan').
     * - برای استفاده از مفسر سفارشی، یک آبجکت با کلید `path` حاوی مسیر فایل مفسر ارائه دهید.
     */
    parser: 'parsneshan',

    /**
     * @property {object} parserOptions
     * گزینه‌هایی که به مفسر مارک‌داون پاس داده می‌شوند.
     * این بخش برای مفسرهای مبتنی بر markdown-it بسیار کاربردی است.
     */
    parserOptions: {
      /**
       * @property {Array} plugins
       * لیستی از افزونه‌های markdown-it که باید فعال شوند.
       * هر آیتم می‌تواند خود افزونه یا یک آرایه شامل [افزونه, تنظیمات] باشد.
       * 
       * مثال:
       * plugins: [
       *   window.markdownitFootnote, // افزونه بدون تنظیمات
       *   [window.markdownitEmoji, { shortcuts: {} }] // افزونه با تنظیمات
       * ]
       * 
       * توجه: برای استفاده از افزونه‌ها، باید ابتدا آن‌ها را از طریق CDN در index.html بارگذاری کنید.
       */
      plugins: [],

      // شما می‌توانید سایر گزینه‌های markdown-it را نیز در اینجا قرار دهید
      // html: true, // این گزینه به صورت پیش‌فرض در پارس‌نشان فعال است
      linkify: true,
    }
  },

  /**
   * @property {object} font
   * تنظیمات مربوط به فونت‌ها و تایپوگرافی.
   */
  font: {
    /**
     * @property {string} baseSize
     * اندازه پایه فونت برای کل وب‌سایت. مثال: '16px', '1rem'.
     */
    baseSize: '16px',
    
    /**
     * @property {number} lineHeight
     * ضریب ارتفاع خط برای متن اصلی.
     */
    lineHeight: 1.7,

    /**
     * @property {object} custom
     * تنظیمات مربوط به استفاده از فونت سفارشی.
     */
    custom: {
      /**
       * @property {boolean} enabled
       * برای فعال‌سازی فونت سفارشی، این گزینه را `true` کنید.
       * در این حالت، باید پوشه `config/fonts` را ساخته و فایل‌های فونت و CSS را در آن قرار دهید.
       */
      enabled: false,

      /**
       * @property {string} path
       * مسیر فایل CSS که فونت‌های سفارشی شما را با `@font-face` تعریف می‌کند.
       * مسیر نسبت به `basePath` سنجیده می‌شود.
       * مثال: 'config/fonts/my-fonts.css'
       */
      path: 'config/fonts/fonts.css',

      /**
       * @property {string} family
       * نام `font-family` اصلی که باید برای متن‌ها استفاده شود.
       * این نام باید با نام تعریف شده در فایل CSS شما مطابقت داشته باشد.
       * مثال: 'IRANSansX'
       */
      family: '',

      /**
       * @property {string} codeFamily
       * نام `font-family` که باید برای بلوک‌های کد استفاده شود.
       * در صورت خالی بودن، از فونت پیش‌فرض مرورگر استفاده می‌شود.
       * مثال: 'Fira Code VF'
       */
      codeFamily: '',
    }
  },

  /**
   * @property {object} toc
   * تنظیمات مربوط به افزونه فهرست مطالب (Table of Contents).
   */
  toc: {
    /**
     * @property {boolean} enabled - آیا افزونه فعال باشد؟
     */
    enabled: true,
    
    /**
     * @property {number} maxDepth - حداکثر عمق تیترهایی که نمایش داده می‌شوند (مثلاً 3 یعنی h1, h2, h3).
     */
    maxDepth: 3,
    
    /**
     * @property {string} title - عنوانی که بالای فهرست مطالب نمایش داده می‌شود.
     */
    title: 'در این صفحه',
  },
  
  /**
   * @property {object} title
   * تنظیمات مربوط به عنوان تب مرورگر (تگ <title>).
   */
  title: {
    /**
     * @property {boolean} enabled
     * فعال یا غیرفعال کردن مدیریت هوشمند عنوان.
     */
    enabled: true,
    
    /**
     * @property {boolean} includeWiki
     * آیا نام ویکی (appName) در عنوان گنجانده شود؟
     */
    includeWiki: true,
    
    /**
     * @property {string} order
     * ترتیب نمایش نام ویکی و نام صفحه.
     * مقادیر ممکن:
     *  - 'page-first': 'نام صفحه | نام ویکی' (پیش‌فرض)
     *  - 'wiki-first': 'نام ویکی | نام صفحه'
     *  - 'page-only': 'نام صفحه'
     */
    order: 'page-first',
    
    /**
     * @property {string} separator
     * نویسه جداکننده بین نام صفحه و نام ویکی.
     */
    separator: ' | ',
    
    /**
     * @property {string} fallback
     * متنی که در صورت پیدا نشدن هیچ عنوانی نمایش داده می‌شود.
     */
    fallback: 'بدون عنوان',
    
    /**
     * @property {Array<string>} sourcePriority
     * اولویت منابع برای استخراج عنوان صفحه. اولین منبع معتبر استفاده می‌شود.
     * مقادیر ممکن: 'sidebarTitle', 'sidebarLabel', 'h1', 'filename', 'fallback'.
     * ویرایش این بخش توصیه نمی‌شود مگر اینکه بدانید چه می‌کنید.
     */
    // sourcePriority: ['sidebarTitle', 'sidebarLabel', 'h1', 'filename', 'fallback'],
  },

  /**
   * @property {object} selectors
   * شناسه‌های CSS برای المان‌های اصلی HTML. تنها در صورتی این مقادیر را تغییر دهید
   * که ساختار فایل `index.html` را ویرایش کرده باشید.
   */
  selectors: {
    root: '#app',
    content: '.content',
    sidebarNav: '.sidebar-nav',
    sidebarToggle: '.sidebar-toggle',
  },
  
  /**
   * @property {object} sidebar
   * تنظیمات مربوط به منوی کناری
   */
  sidebar: {
    /**
     * @property {boolean} enabled - آیا منوی کناری فعال باشد؟
     * اگر `false` باشد، منو و دکمه آن به طور کامل پنهان می‌شوند.
     */
    enabled: true,
  },

  /**
   * @property {object} theme
   * تنظیمات ظاهری برای شخصی‌سازی رنگ‌ها و فونت‌ها.
   * این مقادیر، متغیرهای CSS مربوطه را بازنویسی می‌کنند.
   */
  theme: {
    /**
     * @property {string} default
     * تم پیش‌فرض هنگام اولین بازدید کاربر.
     * مقادیر ممکن:
     *  - 'auto': به طور خودکار تم سیستم‌عامل کاربر را تشخیص می‌دهد (پیش‌فرض).
     *  - 'light': همیشه با تم روشن شروع می‌شود.
     *  - 'dark': همیشه با تم تاریک شروع می‌شود.
     * انتخاب کاربر پس از اولین بازدید در حافظه مرورگر ذخیره می‌شود.
     */
    default: 'auto',

    // در اینجا می‌توانید متغیرهای رنگی را بازنویسی کنید.
    // این رنگ‌ها هم در تم روشن و هم در تم تاریک اعمال می‌شوند.
    // برای مشاهده لیست کامل متغیرها، به مستندات تم‌بندی مراجعه کنید.
    //
    // مثال: برای تغییر رنگ اصلی به نارنجی گوجه‌ای
    // primaryColor: '#ff6347',
    //
    // مثال: برای تغییر رنگ پس‌زمینه سایدبار
    // sidebarBg: '#2c3e50',
  },

  /**
   * @property {object} remote
   * تنظیمات مربوط به بارگذاری محتوای مارک‌داون از URLهای خارجی.
   */
  remote: {
    /**
     * @property {boolean} enabled
     * آیا قابلیت بارگذاری از URL خارجی فعال باشد؟
     * در صورت فعال بودن، می‌توانید در منوی کناری به فایل‌های مارک‌دان روی اینترنت لینک دهید.
     */
    enabled: false,

    /**
     * @property {string} corsProxyUrl
     * آدرس یک پروکسی CORS برای عبور از محدودیت‌های امنیتی مرورگر.
     * این پروکسی قبل از URL خارجی قرار می‌گیرد.
     * مثال: 'https://api.allorigins.win/raw?url=' or 'https://corsproxy.io/?'
     * اگر سرور شما هدرهای CORS مناسب را ارسال می‌کند، این فیلد را خالی بگذارید.
     */
    corsProxyUrl: '',
  },
};