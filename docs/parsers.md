# راهنمای مفسرهای مارک‌داون

شیرازه با یک معماری منعطف طراحی شده است که به شما اجازه می‌دهد مفسر مارک‌داون (Markdown Parser) مورد نظر خود را انتخاب کرده یا حتی مفسر سفارشی خود را به پروژه اضافه کنید.

## مفسر پیش‌فرض: پارس‌نشان

مفسر پیش‌فرض شیرازه، **پارس‌نشان** نام دارد. این یک مفسر قدرتمند و شخصی‌سازی شده بر پایه کتابخانه محبوب `markdown-it` است که با افزونه‌های اختصاصی برای زبان فارسی و نیازهای مستندسازی غنی شده است.

### قابلیت‌های پارس‌نشان

-   **پشتیبانی کامل از GFM:** شامل جداول، لیست وظایف (task lists) و...
-   **جعبه‌های هشدار (Admonitions):** برای نمایش نکات، هشدارها و اطلاعات مهم.
-   **پشتیبانی از شعر:** سینتکس ساده برای نمایش صحیح اشعار فارسی.
-   **هایلایت متن:** با استفاده از `==متن==`.
-   **تشخیص خودکار جهت متن:** پاراگراف‌ها و لیست‌ها به صورت هوشمند راست‌چین یا چپ‌چین می‌شوند.
-   **پشتیبانی از اعداد فارسی:** در لیست‌های شماره‌دار.

## افزودن افزونه به پارس‌نشان

یکی از بزرگترین مزایای پارس‌نشان (و `markdown-it`)، قابلیت افزودن افزونه‌های جدید است. شما می‌توانید به سادگی از طریق فایل `config/config.js`، افزونه‌های دلخواه خود را فعال کنید.

1.  **اضافه کردن کتابخانه افزونه:** ابتدا افزونه مورد نظر را از طریق CDN به `index.html` اضافه کنید.

    ```html
    <!-- in index.html, before the main script -->
    <script src="https://cdn.jsdelivr.net/npm/markdown-it@14.1.0/dist/markdown-it.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/markdown-it-footnote@4.0.0/dist/markdown-it-footnote.min.js"></script>
    <script type="module" src="src/index.js"></script>
    ```

2.  **فعال‌سازی در `config.js`:** افزونه را به آرایه `plugins` در بخش `markdown.parserOptions` اضافه کنید.

    ```javascript
    // in config/config.js
    markdown: {
      parser: 'parsneshan',
      parserOptions: {
        plugins: [
          // افزونه باید در window در دسترس باشد
          window.markdownitFootnote,
          
          // می‌توانید افزونه را به همراه تنظیمات نیز پاس دهید
          // [window.markdownitEmoji, { shortcuts: {} }] 
        ]
      }
    },
    ```

## استفاده از یک مفسر کاملاً سفارشی

اگر پارس‌نشان نیازهای شما را برآورده نمی‌کند، می‌توانید آن را با مفسر دلخواه خود جایگزین کنید.

1.  **ساخت فایل مفسر:** یک فایل جاوااسکریپت در پوشه `config/parsers/` ایجاد کنید (مثلاً `my-parser.js`).
2.  **تنظیم `config.js`:** در فایل پیکربندی، به جای نام مفسر، یک آبجکت با کلید `path` به فایل مفسر خود ارائه دهید.

    ```javascript
    // in config/config.js
    markdown: {
      parser: {
        path: 'config/parsers/my-parser.js',
      },
      // می‌توانید تنظیمات را نیز از اینجا پاس دهید
      parserOptions: {
        gfm: true 
      }
    },
    ```

### ساختار مفسر سفارشی

یک مفسر سفارشی باید یک **کلاس جاوااسکریپت** باشد که به صورت `export default` صادر می‌شود. این کلاس باید ساختار زیر را داشته باشد:

```javascript
// in config/parsers/my-parser.js

export default class MyCustomParser {
  /**
   * سازنده کلاس، تنظیمات را از config.js دریافت می‌کند
   * @param {object} [options] - آبجکت گزینه‌هایی که از markdown.parserOptions می‌آید.
   */
  constructor(options = {}) {
    // منطق مقداردهی اولیه مفسر در اینجا قرار می‌گیرد
    // مثلا: this.myParser = new SomeLibrary(options);
    console.log('My custom parser is initialized with options:', options);
  }

  /**
   * این متد یک رشته مارک‌داون را به رشته HTML تبدیل می‌کند.
   * @param {string} markdown - رشته مارک‌داون ورودی.
   * @returns {string} - رشته HTML خروجی.
   */
  parse(markdown) {
    // منطق تبدیل مارک‌داون به HTML در اینجا قرار می‌گیرد
    return `<h1>Hello from Custom Parser!</h1><p>${markdown}</p>`;
  }
}
```

این ساختار به شما کنترل کاملی بر فرآیند تبدیل مارک‌داون می‌دهد و به سادگی شیرازه را با ابزارهای مورد علاقه خود یکپارچه می‌کند.