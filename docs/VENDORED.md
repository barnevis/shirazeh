# وندور شده — بسته‌های پی (Vendored Pey Packages)

این بسته‌ها از مخزن‌های رسمی چارچوب پی کلون و به‌صورت کد منبع عادی داخل مخزن شیرازه وندور شده‌اند (پوشه‌های `.git` جداگانه حذف شده‌اند). برای به‌روزرسانی هر بسته، همان مسیر مخزن مبدأ را کلون کرده و تغییرات محلی را دوباره اعمال کنید.

| بسته | مبدأ | SHA مبدأ | تاریخ آخرین کامیت مبدأ | وندور شده در |
|---|---|---|---|---|
| pey-core | https://github.com/peyjs/pey-core | `582f77ce8b7cffc61ecd088c34a58ba6da315420` | 2026-08-10 | `src/core/` |
| pey-router | https://github.com/peyjs/pey-router | `4b2001b88d057b5ea51c648a7a8f7eba53272063` | 2026-08-10 | `src/plugins/pey.router/` |
| pey-markdown | https://github.com/peyjs/pey-markdown | `feb3d8fc677343d62d87bad89acca1d6106762bc` | 2026-10-25 | `src/plugins/pey.markdown/` |
| pey-webui | https://github.com/peyjs/pey-webui | `801a3e70c6a4c63e60131c4e9c631485437419f4` | 2026-08-17 | `src/ui-kit/` |
| pey-storage | https://github.com/peyjs/pey-storage | `9db2985a2331f3df40dc283cd8ef8a152dca28ed` | 2026-10-17 | `src/plugins/pey.storage/` |
| highlight.js 11.9.0 | https://github.com/highlightjs/highlight.js (باندل UMD از cdnjs) | — (بارگیری نسخه) | 2026-10-27 | `src/vendor/highlight/` |
| parsneshan | https://github.com/barnevis/parsneshan | `cb8f0551fa7cd681c2b44d3449601a4497059e62` | 2026-10-26 | `src/vendor/node_modules/parsneshan/` (بازتولیدپذیر) |

## بازتولیدپذیری درخت `src/vendor/node_modules/`

این درخت **در مخزن گیت نیست** — از `src/vendor/package.json` بازتولید می‌شود:

```bash
npm run vendor          # معادل: npm install --prefix src/vendor
```

- همه وابستگی‌ها با نسخه دقیق (بدون `^`) پین شده‌اند و `src/vendor/package-lock.json` نصب را بازتولیدپذیر می‌کند.
- `parsneshan` روی npm منتشر نشده و به‌صورت وابستگی گیت با SHA کامل بالا نصب می‌شود؛ پرونده `src/vendor/.npmrc` گزینه `allow-git` را برای npmهای جدید (که وابستگی‌های گیت را پیش‌فرض می‌بندند) تنظیم می‌کند.
- درست‌بودن درخت با `npm run build:import-map` راستی‌آزمایی می‌شود: خروجی باید با نقشه ایمپورت کامیت‌شده `index.html` بایت‌به‌بایت یکسان باشد و آزمون `src/tests/import-map.test.js` موجودیت همه مقصدها را کنترل می‌کند.
- نصب npm شامل چند بسته ترانزیتیو اضافه (مثل `debug`/`ms`/`devlop`/`@types`) است که هیچ import ESM به آن‌ها نیست و مدخلی در نقشه نمی‌گیرند.

> بسته parsneshan (گویش مارک‌داون فارسی برای micromark) وندور شده است. وابستگی‌های اجرایی micromark آن در مرورگر از نقشه ایمپورت `index.html` و در Node از `node_modules` ریشه (اعلام‌شده در `package.json` ریشه) حل می‌شوند.

## تغییرات محلی نسبت به مبدأ

- `src/plugins/pey.router/` — افزودن آداپتور `HashHistoryAdapter` (پرونده `adapters/hash-history-adapter.js`) و مدخل بارگذاری آن در `lib/adapter-loader.js` به‌علاوه آزمون‌های قرارداد. سایر رفتارها بدون تغییر مانده‌اند.
- `src/plugins/pey.storage/` — ثبت آداپتور درون‌حافظه‌ای (`InMemoryAdapter`) در نقشه بارگذاری آداپتورهای `index.js` (برای محیط Node بدون IndexedDB؛ مرورگر `IndexedDBAdapter` را انتخاب می‌کند) و مقایسه نسخه رویداد ready با manifest در آزمون ورودی به‌جای مقدار هاردکد.
- `src/vendor/highlight/` — باندل UMD و دو تم (روشن/تاریک) با مجوز BSD-3-Clause بالادست؛ به‌صورت اسکریپت کلاسیک با تزریق تنبل بارگذاری می‌شود (UMD در ESM قابل ایمپورت نیست).

## مجوز

پروژه شیرازه (کدهای متعلق به خودش: افزونه‌های `shirazeh.*`، رابط کاربری، میزبان و داربست) تحت مجوز MIT پرونده `LICENSE` در ریشه منتشر می‌شود. بسته‌های وندورشده مالکیت مجوز خودشان را نگه می‌دارند: بر پایه صفحه مخزن مبدأ همه MIT هستند؛ `pey-markdown` و `pey-webui` پرونده LICENSE را همراه خود دارند و `pey-core` و `pey-router` در زمان وندور پرونده LICENSE در مخزن مبدأ نداشتند.
