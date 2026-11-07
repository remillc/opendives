# Public web pages

The pages of opendives.app that come from the app: for now the privacy policy.

- **Source:** `app/public/privacy/en.html` and `fr.html`. The app shows the same files in About → Privacy policy, so the app and the web page never differ. Edit only these files.
- **Build:** `node site/build.mjs` writes `build/site/` (not in git): the pages, the app's body font and logo, and `site.css`.

| Page | Address once published |
| --- | --- |
| `build/site/privacy.html` | `https://opendives.app/privacy` (English) |
| `build/site/privacy/fr.html` | `https://opendives.app/privacy/fr` (French) |

Addresses follow the rule of the project: a resource (a page) has no trailing slash, a collection has one; the home page is `/`.

## Publishing on Cloudflare Pages

Once, in the Cloudflare dashboard: **Workers & Pages** → **Create** → **Pages** → **Upload assets**, project name `opendives`, then **Custom domains** → `opendives.app`.

Then, after each change of the policy:

```sh
node site/build.mjs
npx wrangler pages deploy build/site --project-name opendives
```

`wrangler` asks to sign in to Cloudflare the first time.
