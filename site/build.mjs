// Builds the public web pages of OpenDives from the app's own files, into
// build/site/ (not in git), ready to be published on Cloudflare Pages. One
// folder per language, the same pages in each:
//   build/site/index.html          /           sends the visitor to their language
//   build/site/en/index.html       /en/        home page
//   build/site/en/privacy.html     /en/privacy privacy policy
//   build/site/fr/...              /fr/, /fr/privacy
//   build/site/_redirects          the former addresses of the policy
//   build/site/assets/             the app's body font and logo
// Cloudflare Pages serves page.html at /page and folder/index.html at
// /folder/: a page (a resource) has no trailing slash, a collection has one.
// The policy is app/public/privacy/<language>.html and the tagline comes from
// the app's translations: one source for the app and the site.
// Run from anywhere: node site/build.mjs
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'build', 'site');
const SOURCE = 'https://github.com/remillc/opendives';

/** The languages of the site. To add one: its texts here, and its files in the app. */
const languages = {
  en: {
    other: 'Version française',
    privacy: {
      title: 'OpenDives privacy policy',
      heading: 'Privacy policy',
      description: 'Which data the OpenDives dive log uses, where it goes and how to erase it.',
    },
    home: { title: 'OpenDives, a free dive log', privacyLink: 'Privacy policy', sourceLink: 'Source code' },
  },
  fr: {
    other: 'English version',
    privacy: {
      title: 'Politique de confidentialité d’OpenDives',
      heading: 'Politique de confidentialité',
      description: 'Les données qu’utilise le carnet de plongée OpenDives, où elles vont et comment les effacer.',
    },
    home: { title: 'OpenDives, un carnet de plongée libre', privacyLink: 'Politique de confidentialité', sourceLink: 'Code source' },
  },
};
const codes = Object.keys(languages);

/** Removes the source's leading comment: it is for the people who edit the file. */
const content = (html) => html.replace(/^\s*<!--[\s\S]*?-->\s*/, '').trim();

/**
 * @param {string} lang
 * @param {string} tail the page's address after the language: '' or 'privacy'
 * @param {{ title: string, description: string, heading?: string }} p
 * @param {string} body
 */
function page(lang, tail, p, body) {
  const other = codes.find((c) => c !== lang);
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title}</title>
<meta name="description" content="${p.description}">
${codes.map((c) => `<link rel="alternate" hreflang="${c}" href="/${c}/${tail}">`).join('\n')}
<link rel="icon" href="/assets/logo-light.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<header>
  <a href="/${lang}/"><img src="/assets/logo-light.svg" alt="" width="56" height="56"></a>
  <p class="name">OpenDives</p>
  <a class="other" href="/${other}/${tail}" hreflang="${other}" lang="${other}">${languages[lang].other}</a>
</header>
<main>
${p.heading ? `<h1>${p.heading}</h1>\n` : ''}${body}
</main>
</body>
</html>
`;
}

/** The address /: the visitor's language, or the choice without JavaScript. */
const chooser = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenDives</title>
${codes.map((c) => `<link rel="alternate" hreflang="${c}" href="/${c}/">`).join('\n')}
<link rel="alternate" hreflang="x-default" href="/en/">
<link rel="icon" href="/assets/logo-light.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css">
<script>location.replace(/^fr\\b/i.test(navigator.language) ? '/fr/' : '/en/');</script>
</head>
<body>
<header><img src="/assets/logo-light.svg" alt="" width="56" height="56"><p class="name">OpenDives</p></header>
<main><p><a href="/en/" lang="en">English</a> · <a href="/fr/" lang="fr">Français</a></p></main>
</body>
</html>
`;

/** @param {string} path relative to the output @param {string} text */
async function write(path, text) {
  const file = join(out, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, text);
}

// Empty the folder, not remove it: a local server may be serving it.
await mkdir(out, { recursive: true });
for (const entry of await readdir(out)) await rm(join(out, entry), { recursive: true, force: true });
await mkdir(join(out, 'assets'), { recursive: true });

for (const [lang, l] of Object.entries(languages)) {
  const policy = await readFile(join(root, 'app', 'public', 'privacy', `${lang}.html`), 'utf8');
  await write(`${lang}/privacy.html`, page(lang, 'privacy', l.privacy, content(policy)));
  const app = JSON.parse(await readFile(join(root, 'app', 'src', 'i18n', `${lang}.json`), 'utf8'));
  const tagline = app.about.tagline;
  const home = `<h1>OpenDives</h1>
<p>${tagline}</p>
<ul>
  <li><a href="/${lang}/privacy">${l.home.privacyLink}</a></li>
  <li><a href="${SOURCE}">${l.home.sourceLink}</a></li>
</ul>`;
  await write(`${lang}/index.html`, page(lang, '', { title: l.home.title, description: tagline }, home));
}
await write('index.html', chooser);
// The addresses of the policy before the language folders.
await write('_redirects', '/privacy /en/privacy 301\n/privacy/ /en/privacy 301\n/privacy/fr /fr/privacy 301\n/privacy/fr/ /fr/privacy 301\n');
// Without a 404 page, Cloudflare Pages answers any unknown address with the home page.
await write('404.html', chooser.replace(/<script>.*<\/script>\n/, '').replace('<title>OpenDives</title>', '<title>OpenDives: page not found / page introuvable</title>').replace('<main><p>', '<main><p>Page not found. Page introuvable.</p><p>'));

await copyFile(join(root, 'app', 'src', 'fonts', 'SourceSans3VF-Upright.ttf.woff2'), join(out, 'assets', 'SourceSans3VF-Upright.ttf.woff2'));
await copyFile(join(root, 'app', 'src', 'fonts', 'OFL.txt'), join(out, 'assets', 'OFL.txt'));
await copyFile(join(root, 'app', 'public', 'logo-light.svg'), join(out, 'assets', 'logo-light.svg'));
await copyFile(join(root, 'site', 'site.css'), join(out, 'assets', 'site.css'));
console.log(`Built ${codes.length * 2 + 1} pages in ${out}`);
