# شیرازه

[![version](https://img.shields.io/badge/version-0.3.0-blue)](#)
[![AI](https://img.shields.io/badge/Built%20with-AI-blueviolet)](#)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Bonyan Architecture](https://img.shields.io/badge/bonyan-0.11-56c3bf)](https://github.com/barnevis/bonyan)
<a href="docs/features.md"><img src="src/ui/assets/shirazeh.svg" height="20" alt="شیرازه"></a>

**شیرازه** یک مستندساز وب است: پوشه‌ای از پرونده‌های مارک‌داون را به یک سایت مستندات زنده تبدیل می‌کند — بدون ساخت، بدون پایگاه داده، فقط پرونده‌های استاتیک.

شیرازه روی [معماری بنیان](https://github.com/barnevis/bonyan) (نسخه 0.11) و چارچوب [پی](https://github.com/peyjs) پیاده‌سازی شده است: هر توانایی یک افزونه است و هسته پی (`pey-core`) آنها را راه می‌اندازد. ایده محصول از [docsify](https://docsify.js.org/) الهام گرفته شده است.

## امکانات

- رندر زنده مارک‌داون (CommonMark + GFM) با پاک‌سازی HTML و شناسه پایدار تیترها
- سایدبار درختی جمع‌شونده از `docs/_sidebar.md` با کشوی موبایل
- صفحه‌بندی قبلی/بعدی بر اساس ترتیب سایدبار
- پنل «در این صفحه» (فهرست مطالب) با scrollspy و برجسته‌سازی نحوی کد با دکمه رونوشت
- لنگر تیترها با پیوند عمیق، دستور پارسنشان (جعبه هشدار، شعر، پانویس فارسی) و اندازه‌گذاری تصویر
- تم روشن/تاریک (با حالت `auto`) و پایداری تنظیمات کاربر بین نشست‌ها
- نوار بالای پیکربندی‌پذیر، دکمه‌های شناور تم/زبان، خروجی صفحه (HTML خودکفا/مارک‌داون) و استایل چاپ
- رابط دوزبانه فارسی/انگلیسی با تغییر جهت RTL/LTR زنده
- صفحه و پیام «پیدا نشد»
- مسیریابی Hash (`/#/guide/setup`) — قابل استقرار روی هر میزبان استاتیک حتی GitHub Pages
- بدون هیچ ابزار ساخت: خروجی، خودِ همین پوشه است

معرفی کامل ویژگی‌ها: [docs/features.md](docs/features.md).

## ساختار پروژه

```
shirazeh/
├── index.html               — نقطه ورود + نقشه ایمپورت (تولیدشده)
├── bootstrap.json           — پیکربندی بنیان (افزونه‌ها، آداپتورها، UI)
├── package.json / LICENSE / CHANGELOG.md / README.md
├── config/
│   └── config.js            — پیکربندی کاربر (ظاهر و نحوه استفاده)
├── docs/                    — محتوای مستندات + VENDORED.md
├── imp/                     — اسناد داخلی (در گیت نیست)
├── src/
│   ├── core/                — هسته پی (وندورشده)
│   ├── host/
│   │   ├── browser-host.js  — میزبان مرورگر
│   │   └── user-config.js   — ادغام پیکربندی کاربر
│   ├── plugins/
│   │   ├── pey.router/      — مسیریاب (وندور + آداپتور Hash)
│   │   ├── pey.markdown/    — مارک‌داون (وندور)
│   │   ├── pey.storage/     — ذخیره‌سازی (وندور)
│   │   ├── shirazeh.http/   — انتقال HTTP
│   │   ├── shirazeh.docs/   — منطق مستندات
│   │   └── shirazeh.prefs/  — پایداری تنظیمات
│   ├── scripts/             — سرور توسعه + ساخت نقشه ایمپورت
│   ├── tests/               — آزمون‌های پروژه (واحد + یکپارچه)
│   ├── ui/                  — رابط کاربری + assets (لوگو، فونت)
│   ├── ui-kit/              — کیت رابط کاربری (وندور)
│   └── vendor/              — وابستگی‌های وندور (micromark، highlight.js)
└── node_modules/
```

مسیر مبدأ و نسخه بسته‌های وندورشده در [docs/VENDORED.md](docs/VENDORED.md) ثبت شده است.

## راه‌اندازی

پیش‌نیاز: Node.js نسخه ۲۲ یا بالاتر.

```bash
# نصب وابستگی‌ها (ریزه: وابستگی‌های اجرایی وندور پارسنشان؛ افزونه مارک‌داون)
npm install
cd src/plugins/pey.markdown && npm install --omit=dev && cd ../../..

# بازسازی وابستگی‌های مرورگری وندورشده (در گیت نیستند؛ از src/vendor/package.json)
npm run vendor

# اجرای آزمون‌ها (کل مجموعه)
npm test

# اجرای برنامه
npm run serve
# سپس http://127.0.0.1:8901 را باز کنید
```

## نوشتن مستندات

- `docs/README.md` — صفحه نخست
- `docs/_sidebar.md` — فهرست navigation (مارک‌داون با لینک؛ تودرتویی با تورفتگی)
- هر پرونده `.md` دیگر یک صفحه است؛ نشانی آن از مسیرش می‌آید:
  `docs/guide/config.md` ← `/#/guide/config`

## پیکربندی

پیکربندی روزمره در `config/config.js` است (زبان، تم، لوگو، فهرست مطالب و…) — راهنمای کامل: [docs/configuration.md](docs/configuration.md). پیکربندی فنی افزونه‌ها در `bootstrap.json` است. چند کلید پرکاربرد:

| کلید | جایگاه | پیش‌فرض | توضیح |
|---|---|---|---|
| `adapters.router` | ریشه | `HashHistoryAdapter` | آداپتور مسیریاب (نسخه History API هم موجود است) |
| `config.shirazeh.docs.docsRoot` | config | `./docs` | پوشه مستندات |
| `config.shirazeh.docs.homePage` | config | `README.md` | سند مسیر `/` |
| `config.ui.language` | config | `fa` | زبان پیش‌فرض رابط |
| `config.ui.direction` | config | `rtl` | جهت پیش‌فرض رابط |

پس از هر تغییر در وندورها یا صادرات بسته‌ها، نقشه ایمپورت را دوباره بسازید: `npm run build:import-map`.

## استقرار

خروجی یک پوشه استاتیک است و چون مسیریابی Hash است، نیازی به تنظیم SPA-fallback روی سرور نیست.

**GitHub Pages:** پوشه `.github/workflows/deploy-pages.yml` همراه پروژه است — با هر push به `main` (یا اجرای دستی workflow) وابستگی‌های وندورشده بازتولید، آزمون‌ها اجرا و فقط پرونده‌های لازم سایت منتشر می‌شوند. کافی است در تنظیمات مخزن، Source صفحه‌ها را روی «GitHub Actions» بگذارید. انتشار مستقیم از ریشه برنچ کار نمی‌کند، چون `src/vendor/node_modules` (وابستگی‌های مرورگری) در مخزن گیت نیست و فقط در استقرار بازسازی می‌شود.

**میزبان استاتیک دیگر:** محتوای همان استقرار Pages را می‌توانید محلی هم بسازید — `npm run vendor` و سپس کپی `index.html`، `bootstrap.json`، `config/`، `docs/` و `src/` (منهای `src/tests` و `src/scripts` و node_modules افزونه‌ها).

## توسعه

- آزمون واحد هر افزونه در پوشه `tests/` خودش است (`node --test`) و از فیک به‌جای شبکه/دیتابیس واقعی استفاده می‌کند.
- آزمون یکپارچه‌سازی (`src/tests/integration/`) هسته واقعی را با میزبان درون‌حافظه‌ای راه می‌اندازد.
- افزودن قابلیت جدید = افزونه جدید بنیان + ثبت در `bootstrap.json`. مستندات مرجع افزونه‌های شیرازه: [shirazeh.http](src/plugins/shirazeh.http/docs/reference.md) و [shirazeh.docs](src/plugins/shirazeh.docs/docs/reference.md).

## نقشه راه

برخی ایده‌ها برای نسخه‌های بعد: خروجی PDF، صفحات ریموت (بارگیری مستندات از نشانی دیگر)، سینتکس `==نشانه‌گذاری==` و تعیین خودکار جهت متن.
