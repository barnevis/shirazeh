# Shared Configuration

The application Entry Point receives final UI configuration as `context.config`. It first applies defaults from `DEFAULT_UI_CONFIG`, then validates the merged result in a separate step.

```js
import { DEFAULT_UI_CONFIG } from 'pey.webui/contracts';

const config = {
  ...DEFAULT_UI_CONFIG,
  ...context.config,
};

// Merging does not validate values; validation happens in the next step.
validateUiConfig(config);

const assetBaseUrl = new URL(
  `${config.assetBaseUrl.replace(/\/+$/, '')}/`,
  import.meta.url,
).href;
const iconSpriteUrl = new URL('icons.svg', assetBaseUrl).href;
```

## Validation

- `theme`: non-empty string.
- `language`: non-empty string. The Entry Point seeds `createI18n({ language })`, and the page host uses it as the default language for the internal fallback translations when no `t` is injected.
- `direction`: one of `ltr`, `rtl`, or `auto`.
- `fallbackPath`: `null` or a non-empty string. Router validates the path itself.
- `assetBaseUrl`: non-empty string representing a directory. The Entry Point removes trailing slashes, appends exactly one slash, resolves it against its own `import.meta.url`, and passes the resulting absolute directory URL to kit infrastructure. Child assets use `new URL('icons.svg', assetBaseUrl)`, so `icons.svg` is appended inside `assets/` rather than replacing the final `assets` segment. It never resolves against the document URL and is independent of Router `basePath`.

The application passes individual config values to components. It does not pass the whole Core config object or expose it globally.

A CSP nonce for external stylesheets is not part of the shared config (`styleNonce` is deliberately absent). The Entry Point supplies the nonce the application needs through the connection `refs`, the component keeps it in `onConnect()`, and `stylesheetNonce()` returns it; a component that needs no nonce simply returns `null`. The nonce only has meaning together with an external sheet, so a component that uses a nonce also declares its `stylesheetHref()`, built as an absolute URL from its own module location:

```js
const STYLE_URL = new URL('./app-overflow.css', import.meta.url).href;

class AppOverflow extends PeyElement {
  #styleNonce = null;

  onConnect(refs) {
    this.#styleNonce = refs.styleNonce ?? null;
  }

  stylesheetHref() {
    return STYLE_URL;
  }

  stylesheetNonce() {
    return this.#styleNonce;
  }
}
```

Shared config carries only presentation defaults and asset location.

Non-empty string checks use trimmed content. The resolved config exposes trimmed `theme`, `language`, and `fallbackPath` values.
