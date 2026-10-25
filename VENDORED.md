# وندور شده — بسته‌های پی (Vendored Pey Packages)

این بسته‌ها از مخزن‌های رسمی چارچوب پی کلون و به‌صورت کد منبع عادی داخل مخزن شیرازه وندور شده‌اند (پوشه‌های `.git` جداگانه حذف شده‌اند). برای به‌روزرسانی هر بسته، همان مسیر مخزن مبدأ را کلون کرده و تغییرات محلی را دوباره اعمال کنید.

| بسته | مبدأ | SHA مبدأ | تاریخ آخرین کامیت مبدأ | وندور شده در |
|---|---|---|---|---|
| pey-core | https://github.com/peyjs/pey-core | `582f77ce8b7cffc61ecd088c34a58ba6da315420` | 2026-08-10 | `core/pey-core/` |
| pey-router | https://github.com/peyjs/pey-router | `4b2001b88d057b5ea51c648a7a8f7eba53272063` | 2026-08-10 | `plugins/pey.router/` |
| pey-markdown | https://github.com/peyjs/pey-markdown | `feb3d8fc677343d62d87bad89acca1d6106762bc` | 2026-10-25 | `plugins/pey.markdown/` |
| pey-webui | https://github.com/peyjs/pey-webui | `801a3e70c6a4c63e60131c4e9c631485437419f4` | 2026-08-17 | `ui-kit/pey-webui/` |
| parsneshan | https://github.com/barnevis/parsneshan (برچسب v0.2.0) | — (کلون تگ) | 2026-10-26 | `vendor/node_modules/parsneshan/` |

> بسته parsneshan (گویش مارک‌داون فارسی برای micromark) بدون کامیت‌های مفردِ تگ وندور شده است؛ آزمایش‌ها، بازیچه و سندهای بالادست آن در این کپی حذف شده‌اند. وابستگی‌های اجرایی micromark آن در مرورگر از نقشه ایمپورت `index.html` و در Node از `node_modules` ریشه (اعلام‌شده در `package.json` ریشه) حل می‌شوند.

## تغییرات محلی نسبت به مبدأ

- `plugins/pey.router/` — افزودن آداپتور `HashHistoryAdapter` (پرونده `adapters/hash-history-adapter.js`) و مدخل بارگذاری آن در `lib/adapter-loader.js` به‌علاوه آزمون‌های قرارداد. سایر رفتارها بدون تغییر مانده‌اند.

## مجوز

پروژه شیرازه (کدهای متعلق به خودش: افزونه‌های `shirazeh.*`، رابط کاربری، میزبان و داربست) تحت مجوز MIT پرونده `LICENSE` در ریشه منتشر می‌شود. بسته‌های وندورشده مالکیت مجوز خودشان را نگه می‌دارند: بر پایه صفحه مخزن مبدأ همه MIT هستند؛ `pey-markdown` و `pey-webui` پرونده LICENSE را همراه خود دارند و `pey-core` و `pey-router` در زمان وندور پرونده LICENSE در مخزن مبدأ نداشتند.
