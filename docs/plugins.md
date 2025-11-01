# راهنمای توسعه افزونه

سیستم افزونه شیرازه به توسعه‌دهندگان اجازه می‌دهد تا قابلیت‌های جدیدی را بدون نیاز به دستکاری کدهای اصلی به برنامه اضافه کنند. این سیستم بر پایه یک معماری ماژولار و رویداد-محور (event-driven) ساخته شده است که به افزونه‌ها اجازه می‌دهد به رویدادهای کلیدی در چرخه حیات برنامه گوش دهند و واکنش نشان دهند.

## فعال‌سازی یک افزونه

برای فعال کردن یک افزونه، کافیست مسیر فایل جاوااسکریپت آن را به آرایه `plugins` در فایل `config/config.js` اضافه کنید.

```javascript
// in config/config.js
window.shirazeh = {
  // ... سایر تنظیمات
  plugins: [
    'src/plugins/hello.js', // افزونه نمونه
    'src/plugins/my-custom-plugin.js' // افزونه جدید شما
  ],
  // ...
};
```

شیرازه به صورت خودکار این فایل‌ها را بارگذاری و اجرا می‌کند.

## معماری یک افزونه

هر افزونه در شیرازه یک **کلاس جاوااسکریپت** است که به صورت `export default` صادر می‌شود. این کلاس می‌تواند شامل متدهای خاصی به نام **هوک‌های چرخه حیات (Lifecycle Hooks)** باشد که توسط شیرازه در زمان‌های مشخصی فراخوانی می‌شوند.

### هوک‌های چرخه حیات (Lifecycle Hooks)

این متدها اختیاری هستند. افزونه شما فقط باید متدهایی را پیاده‌سازی کند که به آن‌ها نیاز دارد.

#### `onInit(app)`
این متد **یک بار**، درست پس از بارگذاری و نمونه‌سازی افزونه، فراخوانی می‌شود. این بهترین مکان برای انجام تنظیمات اولیه، بارگذاری استایل‌ها یا ثبت هرگونه وضعیت اولیه است.

-   **پارامتر `app`**: یک ارجاع به نمونه اصلی کلاس `App` شیرازه است. این پارامتر بسیار قدرتمند است و به شما اجازه می‌دهد به تنظیمات برنامه (`app.config`) و متدهای کمکی مانند `app.resolvePath()` دسترسی داشته باشید.

#### `onPageLoad(contentElement)`
این متد **هر بار** که یک صفحه جدید با موفقیت بارگذاری و رندر می‌شود، فراخوانی می‌گردد (این شامل صفحات خطا مانند 404 نیز می‌شود). این هوک برای دستکاری محتوای رندر شده (مثلاً برای اضافه کردن دکمه‌ها، هایلایت کردن کد، یا اجرای اسکریپت‌های خاص محتوا) ایده‌آل است.

-   **پارامتر `contentElement`**: یک ارجاع به المان DOM است که محتوای HTML صفحه در آن قرار گرفته است.

#### `onDestroy()`
این متد برای استفاده در آینده در نظر گرفته شده است و زمانی فراخوانی خواهد شد که برنامه در حال بسته شدن است. می‌توانید از آن برای پاک‌سازی منابع (مانند حذف event listenerها) استفاده کنید.

## ساخت یک افزونه نمونه

بیایید یک افزونه ساده بسازیم که یک دکمه "کپی" به تمام بلوک‌های کد (`<pre>`) در هر صفحه اضافه می‌کند.

### ۱. ساختار فایل‌ها

ابتدا فایل‌های مورد نیاز را در پوشه `src/plugins/` ایجاد می‌کنیم:

```
src/
└── plugins/
    ├── code-copy/
    │   ├── code-copy.css
    │   └── code-copy.js
    └── ...
```
> **نکته:** قراردادن هر افزونه در پوشه خودش به سازماندهی بهتر کمک می‌کند.

### ۲. نوشتن کد جاوااسکریپت (`code-copy.js`)

```javascript
/**
 * @file افزونه‌ای برای افزودن دکمه کپی به بلوک‌های کد
 */
import { injectCSS } from '../../core/pluginManager.js';

export default class CodeCopyPlugin {
    onInit(app) {
        console.log('CodeCopyPlugin: Initialized!');
        // استایل‌های دکمه کپی را به صفحه اضافه می‌کنیم
        const cssPath = app.resolvePath('src/plugins/code-copy/code-copy.css');
        injectCSS(cssPath);
    }

    onPageLoad(contentElement) {
        // تمام بلوک‌های <pre> را در محتوای صفحه پیدا می‌کنیم
        const codeBlocks = contentElement.querySelectorAll('pre');

        codeBlocks.forEach(block => {
            const button = document.createElement('button');
            button.className = 'copy-code-button';
            button.innerText = 'کپی';

            button.addEventListener('click', () => {
                const code = block.querySelector('code');
                if (code) {
                    navigator.clipboard.writeText(code.innerText).then(() => {
                        button.innerText = 'کپی شد!';
                        setTimeout(() => {
                            button.innerText = 'کپی';
                        }, 2000);
                    }).catch(err => {
                        console.error('Failed to copy text: ', err);
                        button.innerText = 'خطا';
                    });
                }
            });

            // دکمه را به بلوک کد اضافه می‌کنیم
            // ابتدا position آن را relative می‌کنیم تا دکمه به درستی قرار گیرد
            block.style.position = 'relative';
            block.appendChild(button);
        });
    }
}
```

### ۳. افزودن استایل (`code-copy.css`)

```css
/* استایل دکمه کپی */
.copy-code-button {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem; /* در حالت راست‌چین در سمت چپ قرار می‌گیرد */
    background-color: var(--sidebar-bg);
    color: var(--text-color);
    border: 1px solid var(--border-color);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    cursor: pointer;
    opacity: 0; /* در حالت عادی مخفی است */
    transition: opacity 0.2s;
}

/* نمایش دکمه هنگام هاور روی بلوک کد */
pre:hover .copy-code-button {
    opacity: 1;
}

.copy-code-button:hover {
    background-color: var(--border-color);
}
```

### ۴. فعال‌سازی افزونه

در نهایت، افزونه جدید را در `config/config.js` فعال می‌کنیم:

```javascript
// in config/config.js
window.shirazeh = {
  // ...
  plugins: [
    'src/plugins/hello.js',
    'src/plugins/code-copy/code-copy.js' // <-- این خط را اضافه کنید
  ],
  // ...
};
```

حالا با رفرش کردن صفحه، باید دکمه "کپی" را هنگام هاور کردن روی بلوک‌های کد مشاهده کنید.

## ابزارهای کمکی برای افزونه‌ها

### `injectCSS(path)`
این تابع کمکی که از `pluginManager` قابل `import` است، به شما اجازه می‌دهد یک فایل CSS را به صورت پویا به `<head>` صفحه اضافه کنید.

-   **نحوه استفاده:**
    ```javascript
    import { injectCSS } from '../core/pluginManager.js';

    // ... در متد onInit
    const cssPath = app.resolvePath('path/to/your/plugin.css');
    injectCSS(cssPath);
    ```
-   **نکته مهم:** همیشه از `app.resolvePath()` برای ساخت مسیر فایل CSS استفاده کنید تا مطمئن شوید مسیر نسبت به `basePath` پروژه به درستی محاسبه می‌شود.

### دسترسی به نمونه `App`
همانطور که گفته شد، پارامتر `app` در `onInit` دسترسی کاملی به هسته برنامه به شما می‌دهد. برخی از کاربردهای رایج آن عبارتند از:
-   **خواندن تنظیمات:** `app.config.appName`
-   **حل کردن مسیرها:** `app.resolvePath('some/file.md')`
-   **دسترسی به سایر اجزا (در آینده):** `app.router`, `app.sidebar`

این ابزارها به شما قدرت زیادی برای ساخت افزونه‌های پیچیده و یکپارچه با شیرازه می‌دهند.
