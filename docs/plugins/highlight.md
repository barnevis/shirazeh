# افزونه رنگ‌آمیزی کد (Syntax Highlighting)

این افزونه با استفاده از کتابخانه قدرتمند **Highlight.js**، بلوک‌های کد شما را به صورت خودکار رنگ‌آمیزی (syntax highlighting) می‌کند. این قابلیت خوانایی کد را به شدت افزایش داده و ظاهر حرفه‌ای به مستندات شما می‌بخشد.

## ویژگی‌های اصلی

-   **رنگ‌آمیزی خودکار:** کدها بر اساس زبان برنامه‌نویسی مشخص شده، رنگ‌آمیزی می‌شوند.
-   **تشخیص خودکار زبان:** اگر زبان کد مشخص نشده باشد، افزونه تلاش می‌کند آن را به صورت خودکار تشخیص دهد.
-   **پشتیبانی از تم:** تم‌های رنگ‌آمیزی به صورت خودکار با تم روشن و تاریک شیرازه هماهنگ می‌شوند.
-   **نمایش شماره خط:** قابلیت نمایش شماره خط در کنار کدها (قابل فعال‌سازی).
-   **هایلایت خطوط خاص:** امکان مشخص کردن خطوط خاصی از کد برای هایلایت شدن.
-   **نمایش نام فایل:** قابلیت نمایش نام فایل در بالای بلوک کد.
-   **بارگذاری منعطف:** امکان بارگذاری کتابخانه از CDN یا به صورت محلی.

## فعال‌سازی افزونه

برای فعال کردن این افزونه، مسیر آن را به لیست `plugins` در فایل `config.js` اضافه کنید:

```javascript
// in config/config.js
window.shirazeh = {
  // ...
  plugins: [
    'src/plugins/highlight/highlight.js'
  ],
  // ...
};
```

## پیکربندی

تمام تنظیمات این افزونه از طریق آبجکت `highlight` در فایل `config.js` انجام می‌شود.

```javascript
// in config/config.js
window.shirazeh = {
  // ...
  highlight: {
    enabled: true,
    source: 'cdn', // 'cdn' or 'local'
    cdn: {
      version: '11.9.0',
      themeLight: 'github.min.css',
      themeDark: 'github-dark.min.css',
    },
    local: {
      path: 'src/lib/vendor/highlight',
      themeLight: 'github.min.css',
      themeDark: 'github-dark.min.css',
    },
    languages: ['javascript', 'xml', 'css', 'bash', 'json'],
    lineNumbers: true,
    showLanguage: true,
  },
  // ...
};
```

### گزینه‌های پیکربندی

-   `enabled`: (`boolean`, پیش‌فرض: `true`) افزونه را فعال یا غیرفعال می‌کند.
-   `source`: (`string`, پیش‌فرض: `'cdn'`) منبع بارگذاری کتابخانه را مشخص می‌کند. مقادیر ممکن: `'cdn'` یا `'local'`.
-   `cdn`: (`object`) تنظیمات مربوط به بارگذاری از CDN.
    -   `version`: نسخه Highlight.js که می‌خواهید استفاده کنید.
    -   `themeLight`: نام فایل CSS تم برای حالت روشن.
    -   `themeDark`: نام فایل CSS تم برای حالت تاریک.
-   `local`: (`object`) تنظیمات مربوط به بارگذاری از فایل‌های محلی.
    -   `path`: مسیر پوشه‌ای که فایل‌های Highlight.js در آن قرار دارند.
    -   `themeLight` / `themeDark`: نام فایل‌های تم در پوشه `styles`.
-   `languages`: (`Array<string>`) لیستی از زبان‌هایی که می‌خواهید بارگذاری شوند. این کار حجم بارگذاری را کاهش می‌دهد. اگر خالی باشد، فقط زبان‌های رایج بارگذاری می‌شوند.
-   `lineNumbers`: (`boolean`, پیش‌فرض: `true`) نمایش شماره خط را فعال یا غیرفعال می‌کند.
-   `showLanguage`: (`boolean`, پیش‌فرض: `true`) نمایش نام زبان یا نام فایل در بالای بلوک کد را فعال یا غیرفعال می‌کند.

> برای مشاهده لیست کامل تم‌ها و زبان‌ها، به [وب‌سایت رسمی Highlight.js](https://highlightjs.org/static/demo/) مراجعه کنید.

## نحوه استفاده در مارک‌داون

برای استفاده از قابلیت‌های این افزونه، از سینتکس زیر در بلوک‌های کد خود استفاده کنید:

````markdown
```[language][:filename][{line-highlights}]
// your code here
```
````

-   **`[language]` (اختیاری):** نام یا نام مستعار زبان (مثلاً `js`, `javascript`, `html`, `css`). اگر مشخص نشود، زبان به صورت خودکار تشخیص داده می‌شود.
-   **`[:filename]` (اخtiاری):** نام فایلی که می‌خواهید نمایش داده شود (با یک `:` از زبان جدا می‌شود).
-   **`[{line-highlights}]` (اختیاری):** شماره خطوطی که می‌خواهید هایلایت شوند، داخل `{}`.
    -   خطوط تکی با `,` جدا می‌شوند (مثلاً `{2,5}`).
    -   محدوده‌ای از خطوط با `-` مشخص می‌شود (مثلاً `{2-5}`).
    -   می‌توانید این دو را ترکیب کنید (مثلاً `{2,4-6,10}`).

### مثال‌ها

**۱. بلوک کد ساده جاوااسکریپت**
````markdown
```javascript
function greet(name) {
  console.log(`Hello, ${name}!`);
}
```
````

**۲. نمایش نام فایل**
````markdown
```javascript:app.js
import { App } from './core/app.js';

const myApp = new App();
myApp.start();
```
````

**۳. هایلایت کردن خطوط خاص**
````markdown
```css{2, 5-7}
body {
  font-family: 'Vazirmatn', sans-serif;
  background-color: #fff;
}
.container {
  max-width: 800px;
  margin: 0 auto;
}
```
````

**۴. ترکیب نام فایل و هایلایت خطوط**
````markdown
```bash:deploy.sh{3-4}
#!/bin/bash
echo "Starting deployment..."
npm run build
npx serve .
echo "Deployment finished."
```
````