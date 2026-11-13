# Public web pages

The pages of opendives.app, one folder per language: a home page and the privacy policy.

- **Source:** `app/public/privacy/en.html` and `fr.html`. The app shows the same files in About → Privacy policy, so the app and the web page never differ. Edit only these files.
- **Build:** `node site/build.mjs` writes `build/site/` (not in git): the pages, the app's body font and logo, `site.css`, and `_redirects`.
- **Adding a language:** add it to `languages` in `site/build.mjs`; the app must have its policy and translation files.

| Page | Address once published |
| --- | --- |
| `build/site/index.html` | `https://opendives.app/`, sends the visitor to their language |
| `build/site/en/index.html`, `fr/index.html` | `https://opendives.app/en/`, `https://opendives.app/fr/` |
| `build/site/en/privacy.html`, `fr/privacy.html` | `https://opendives.app/en/privacy`, `https://opendives.app/fr/privacy` |

The former addresses `/privacy` and `/privacy/fr` are redirected to these (`_redirects`, 301).

## Links that open the app

The build also writes what the app's links need (decided on 13 November 2026):

| File | Purpose |
| --- | --- |
| `.well-known/assetlinks.json` | Android App Links: the package `org.opendives.app` and the SHA-256 fingerprints of the signing keys (the debug key now). **Release key:** add its fingerprint to `RELEASE_FINGERPRINTS` in `build.mjs` before publishing the app. |
| `.well-known/apple-app-site-association` | iOS Universal Links. `APPLE_TEAM_ID` in `build.mjs` is the placeholder `TEAMID`: replace it by the Team ID of the Apple developer account. |
| `_headers` | serves both files as `application/json`; Cloudflare Pages does not redirect them |
| `open.html`, `_redirects` | the page shown when an app link (`/dives/at/*`, `/sites/*`, `/plan/*`, `/plans/*`, `/tools/*`, `/statistics/*`) is opened in a browser: a 200 rewrite keeps the address; French and English; a button tries `opendives://` |

The paths are the app's intent filters (`app/android/app/src/main/AndroidManifest.xml`) and, on iOS, `App.entitlements` (`applinks:opendives.app`). Check the files after publishing: `https://opendives.app/.well-known/assetlinks.json` must answer 200 with `application/json` and no redirect.

Addresses follow the rule of the project: a resource (a page) has no trailing slash, a collection has one; the home page is `/`.

## Publishing on Cloudflare Pages

Once, in the Cloudflare dashboard: **Workers & Pages** → **Create** → **Pages** → **Upload assets**, project name `opendives`, then **Custom domains** → `opendives.app`.

Then, after each change of the policy:

```sh
node site/build.mjs
npx wrangler pages deploy build/site --project-name opendives
```

`wrangler` asks to sign in to Cloudflare the first time.
