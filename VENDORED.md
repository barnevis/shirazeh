# وندور شده — بسته‌های پی (Vendored Pey Packages)

این بسته‌ها از مخزن‌های رسمی چارچوب پی کلون و به‌صورت کد منبع عادی داخل مخزن شیرازه وندور شده‌اند (پوشه‌های `.git` جداگانه حذف شده‌اند). برای به‌روزرسانی هر بسته، همان مسیر مخزن مبدأ را کلون کرده و تغییرات محلی را دوباره اعمال کنید.

| بسته | مبدأ | SHA مبدأ | تاریخ آخرین کامیت مبدأ | وندور شده در |
|---|---|---|---|---|
| pey-core | https://github.com/peyjs/pey-core | `582f77ce8b7cffc61ecd088c34a58ba6da315420` | 2026-08-10 | `core/pey-core/` |
| pey-router | https://github.com/peyjs/pey-router | `4b2001b88d057b5ea51c648a7a8f7eba53272063` | 2026-08-10 | `plugins/pey.router/` |
| pey-markdown | https://github.com/peyjs/pey-markdown | `feb3d8fc677343d62d87bad89acca1d6106762bc` | 2026-10-25 | `plugins/pey.markdown/` |
| pey-webui | https://github.com/peyjs/pey-webui | `801a3e70c6a4c63e60131c4e9c631485437419f4` | 2026-08-17 | `ui-kit/pey-webui/` |

## تغییرات محلی نسبت به مبدأ

- `plugins/pey.router/` — افزودن آداپتور `HashHistoryAdapter` (پرونده `adapters/hash-history-adapter.js`) و مدخل بارگذاری آن در `lib/adapter-loader.js` به‌علاوه آزمون‌های قرارداد. سایر رفتارها بدون تغییر مانده‌اند.

## مجوز

همه بسته‌ها بر پایه صفحه مخزن مبدأ تحت مجوز MIT منتشر شده‌اند. `pey-markdown` و `pey-webui` پرونده LICENSE را همراه خود دارند؛ `pey-core` و `pey-router` در زمان وندور پرونده LICENSE در مخزن مبدأ نداشتند.
