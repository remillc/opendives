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

Addresses follow the rule of the project: a resource (a page) has no trailing slash, a collection has one; the home page is `/`.

## Publishing on Cloudflare Pages

Once, in the Cloudflare dashboard: **Workers & Pages** → **Create** → **Pages** → **Upload assets**, project name `opendives`, then **Custom domains** → `opendives.app`.

Then, after each change of the policy:

```sh
node site/build.mjs
npx wrangler pages deploy build/site --project-name opendives
```

`wrangler` asks to sign in to Cloudflare the first time.
