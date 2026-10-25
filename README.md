# شیرازه

**شیرازه** یک مستندساز وب شبیه docsify است: پوشه‌ای از پرونده‌های مارک‌داون را به یک سایت مستندات زنده تبدیل می‌کند — بدون ساخت، بدون پایگاه داده، فقط پرونده‌های استاتیک.

شیرازه روی [معماری بنیان](https://github.com/barnevis/bonyan) (نسخه 0.11) و چارچوب [پی](https://github.com/peyjs) پیاده‌سازی شده است: هر توانایی یک افزونه است و هسته پی (`pey-core`) آنها را راه می‌اندازد.

## امکانات نسخه اول

- رندر زنده مارک‌داون (CommonMark + GFM) با پاک‌سازی HTML و شناسه پایدار تیترها
- سایدبار navigation از `docs/_sidebar.md`
- صفحه‌بندی قبلی/بعدی بر اساس ترتیب سایدبار
- مسیریابی Hash (`/#/guide/setup`) — قابل استقرار روی هر میزبان استاتیک حتی GitHub Pages
- رابط دوزبانه فارسی/انگلیسی با تغییر جهت RTL/LTR زنده
- صفحه و پیام «پیدا نشد»
- بدون هیچ ابزار ساخت: خروجی، خودِ همین پوشه است

## ساختار پروژه

```
shirazeh/
  index.html               — نقطه ورود + نقشه ایمپورت (تولیدشده)
  bootstrap.json           — پیکربندی بنیان (افزونه‌ها، آداپتورها، UI)
  host/browser-host.js     — میزبان اجرای مرورگر (ConfigSource/EnvSource/ModuleLoader)
  core/pey-core/           — هسته پی (وندورشده)
  plugins/
    pey.router/            — مسیریاب (وندورشده + آداپتور Hash محلی)
    pey.markdown/          — مارک‌داون (وندورشده)
    shirazeh.http/         — انتقال HTTP (جدید)
    shirazeh.docs/         — منطق مستندات (جدید)
  ui-kit/pey-webui/        — کیت رابط کاربری (وندورشده)
  ui/                      — رابط کاربری شیرازه (manifest، صفحات، مؤلفه‌ها، i18n)
  docs/                    — محتوای مستندات (نمونه)
  vendor/                  — درخت وابستگی micromark برای مرورگر بدون بیلد
  tests/integration/       — آزمون یکپارچه‌سازی با هسته واقعی
  scripts/                 — اسکریپت ساخت نقشه ایمپورت
```

مبدأ و SHA نسخه‌های وندورشده در [VENDORED.md](VENDORED.md) ثبت شده است.

## راه‌اندازی

پیش‌نیاز: Node.js نسخه ۲۲ یا بالاتر.

```bash
# نصب وابستگی اجرایی افزونه مارک‌داون
cd plugins/pey.markdown && npm install --omit=dev && cd ../..

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

همه چیز در `bootstrap.json` است. چند کلید پرکاربرد:

| کلید | جایگاه | پیش‌فرض | توضیح |
|---|---|---|---|
| `adapters.router` | ریشه | `HashHistoryAdapter` | آداپتور مسیریاب (نسخه History API هم موجود است) |
| `config.shirazeh.docs.docsRoot` | config | `./docs` | پوشه مستندات |
| `config.shirazeh.docs.homePage` | config | `README.md` | سند مسیر `/` |
| `config.ui.language` | config | `fa` | زبان پیش‌فرض رابط |
| `config.ui.direction` | config | `rtl` | جهت پیش‌فرض رابط |

پس از هر تغییر در وندورها یا صادرات بسته‌ها، نقشه ایمپورت را دوباره بسازید: `npm run build:import-map`.

## استقرار

خروجی یک پوشه استاتیک است؛ کل پوشه پروژه را روی GitHub Pages، Netlify یا هر میزبان استاتیک دیگر قرار دهید. چون مسیریابی Hash است، نیازی به تنظیم SPA-fallback روی سرور نیست.

## توسعه

- آزمون واحد هر افزونه در پوشه `tests/` خودش است (`node --test`) و از فیک به‌جای شبکه/دیتابیس واقعی استفاده می‌کند.
- آزمون یکپارچه‌سازی (`tests/integration/`) هسته واقعی را با میزبان درون‌حافظه‌ای راه می‌اندازد.
- افزودن قابلیت جدید = افزونه جدید بنیان + ثبت در `bootstrap.json`. مستندات مرجع افزونه‌های شیرازه: [shirazeh.http](plugins/shirazeh.http/docs/reference.md) و [shirazeh.docs](plugins/shirazeh.docs/docs/reference.md).

## نقشه راه نسخه بعد

جست‌وجوی سمت کلاینت، برجسته‌سازی کد، تم روشن/تاریک، پنل فهرست مطالب — و افزودن `pey-storage` برای ذخیره انتخاب‌های کاربر (زبان/تم) بین نشست‌ها.
