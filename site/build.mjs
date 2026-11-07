// Builds the public web pages of OpenDives from the app's own files, into
// build/site/ (not in git), ready to be published on Cloudflare Pages:
//   build/site/privacy.html     privacy policy, English: /privacy
//   build/site/privacy/fr.html  privacy policy, French: /privacy/fr
//   build/site/assets/          the app's body font and logo
// Cloudflare Pages serves page.html at /page: a page (a resource) has no
// trailing slash, only a collection does.
// The text is app/public/privacy/<language>.html, the same file the app shows
// in About: one source for both. Run from anywhere: node site/build.mjs
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'build', 'site');

/** Texts of the page around the policy, per language. */
const pages = {
  en: {
    path: 'privacy.html',
    title: 'OpenDives privacy policy',
    heading: 'Privacy policy',
    description: 'Which data the OpenDives dive log uses, where it goes and how to erase it.',
    other: { lang: 'fr', href: '/privacy/fr', label: 'Version française' },
  },
  fr: {
    path: 'privacy/fr.html',
    title: 'Politique de confidentialité d’OpenDives',
    heading: 'Politique de confidentialité',
    description: 'Les données qu’utilise le carnet de plongée OpenDives, où elles vont et comment les effacer.',
    other: { lang: 'en', href: '/privacy', label: 'English version' },
  },
};

/** Removes the source's leading comment: it is for the people who edit the file. */
const content = (html) => html.replace(/^\s*<!--[\s\S]*?-->\s*/, '').trim();

const page = (lang, p, body) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title}</title>
<meta name="description" content="${p.description}">
<link rel="alternate" hreflang="en" href="/privacy">
<link rel="alternate" hreflang="fr" href="/privacy/fr">
<link rel="icon" href="/assets/logo-light.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<header>
  <img src="/assets/logo-light.svg" alt="" width="56" height="56">
  <p class="name">OpenDives</p>
  <a class="other" href="${p.other.href}" hreflang="${p.other.lang}" lang="${p.other.lang}">${p.other.label}</a>
</header>
<main>
<h1>${p.heading}</h1>
${body}
</main>
</body>
</html>
`;

// Empty the folder, not remove it: a local server may be serving it.
await mkdir(out, { recursive: true });
for (const entry of await readdir(out)) await rm(join(out, entry), { recursive: true, force: true });
await mkdir(join(out, 'assets'), { recursive: true });
for (const [lang, p] of Object.entries(pages)) {
  const source = await readFile(join(root, 'app', 'public', 'privacy', `${lang}.html`), 'utf8');
  const file = join(out, p.path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, page(lang, p, content(source)));
}
await copyFile(join(root, 'app', 'src', 'fonts', 'SourceSans3VF-Upright.ttf.woff2'), join(out, 'assets', 'SourceSans3VF-Upright.ttf.woff2'));
await copyFile(join(root, 'app', 'src', 'fonts', 'OFL.txt'), join(out, 'assets', 'OFL.txt'));
await copyFile(join(root, 'app', 'public', 'logo-light.svg'), join(out, 'assets', 'logo-light.svg'));
await copyFile(join(root, 'site', 'site.css'), join(out, 'assets', 'site.css'));
console.log(`Built ${Object.keys(pages).length} pages in ${out}`);
