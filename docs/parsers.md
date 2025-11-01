# راهنمای مفسرهای مارک‌داون

شیرازه با یک معماری منعطف طراحی شده است که به شما اجازه می‌دهد مفسر مارک‌داون (Markdown Parser) مورد نظر خود را انتخاب کرده یا حتی مفسر سفارشی خود را به پروژه اضافه کنید. این قابلیت به شما امکان می‌دهد تا از سینتکس‌های خاص، افزونه‌ها یا کتابخانه‌های مختلف مارک‌داون بهره‌مند شوید.

## انتخاب مفسر

شما می‌توانید مفسر مارک‌داون را از طریق بخش `markdown` در فایل `config/config.js` تنظیم کنید.

```javascript
// in config/config.js
window.shirazeh = {
  // ...
  markdown: {
    parser: 'marked', // یا یک مفسر سفارشی
  },
  // ...
};
```

### استفاده از مفسرهای داخلی

در حال حاضر، شیرازه یک مفسر داخلی بر پایه کتابخانه `marked.js` ارائه می‌دهد. برای استفاده از آن، کافیست مقدار `parser` را برابر با رشته `'marked'` قرار دهید.

### استفاده از مفسر سفارشی

برای استفاده از یک مفسر دیگر (مثلاً `markdown-it`) یا یک مفسر با منطق کاملاً سفارشی، می‌توانید به راحتی آن را به شیرازه معرفی کنید.

1.  **ساخت فایل مفسر:** یک فایل جاوااسکریپت در پوشه `config/parsers/` ایجاد کنید (مثلاً `my-parser.js`).
2.  **تنظیم `config.js`:** در فایل پیکربندی، به جای نام مفسر، یک آبجکت با کلید `path` به فایل مفسر خود ارائه دهید.

    ```javascript
    // in config/config.js
    markdown: {
      parser: {
        path: 'config/parsers/my-parser.js',
        options: {
          // گزینه‌های دلخواه که به مفسر شما پاس داده می‌شود
          html: true,
          linkify: true,
        }
      }
    },
    ```

## ساخت یک مفسر سفارشی

یک مفسر سفارشی باید یک **کلاس جاوااسکریپت** باشد که به صورت `export default` صادر می‌شود. این کلاس باید شامل یک متد `parse` باشد.

### ساختار اجباری

```javascript
// in config/parsers/my-parser.js

export default class MyCustomParser {
  /**
   * این متد یک رشته مارک‌داون را به رشته HTML تبدیل می‌کند.
   *
   * @param {string} markdown - رشته مارک‌داون ورودی.
   * @param {object} [options] - آبجکت گزینه‌هایی که از config.js می‌آید.
   * @returns {string} - رشته HTML خروجی.
   */
  parse(markdown, options = {}) {
    // منطق تبدیل مارک‌داون به HTML در اینجا قرار می‌گیرد
    // ...
    return '<h1>Hello from Custom Parser!</h1>';
  }
}
```

### مثال: یکپارچه‌سازی `markdown-it`

در این مثال، یک مفسر سفارشی می‌سازیم که از کتابخانه محبوب `markdown-it` استفاده می‌کند.

1.  **اضافه کردن کتابخانه:** ابتدا `markdown-it` را از طریق CDN به `index.html` اضافه کنید.

    ```html
    <!-- in index.html, before the main script -->
    <script src="https://cdn.jsdelivr.net/npm/markdown-it@13.0.1/dist/markdown-it.min.js"></script>
    <script type="module" src="src/index.js"></script>
    ```

2.  **ساخت فایل مفسر:** فایل `config/parsers/markdown-it-parser.js` را ایجاد کنید.

    ```javascript
    // in config/parsers/markdown-it-parser.js

    export default class MarkdownItParser {
      constructor() {
        if (!window.markdownit) {
          throw new Error('markdown-it library is not loaded!');
        }
        // می‌توانید نمونه markdown-it را یک بار اینجا بسازید
        this.md = window.markdownit();
      }

      parse(markdown, options = {}) {
        // می‌توانید از گزینه‌ها برای پیکربندی در لحظه استفاده کنید
        if (options.html) {
          this.md.set({ html: true });
        }
        if (options.linkify) {
          this.md.set({ linkify: true });
        }

        return this.md.render(markdown);
      }
    }
    ```

3.  **فعال‌سازی در `config.js`:**

    ```javascript
    // in config/config.js
    markdown: {
      parser: {
        path: 'config/parsers/markdown-it-parser.js',
        options: {
          html: true, // فعال کردن تگ‌های HTML در مارک‌داون
          linkify: true, // تبدیل خودکار URLها به لینک
        }
      }
    },
    ```

با این ساختار، شما کنترل کاملی بر فرآیند تبدیل مارک‌داون دارید و می‌توانید به سادگی شیرازه را با ابزارهای مورد علاقه خود یکپارچه کنید.
