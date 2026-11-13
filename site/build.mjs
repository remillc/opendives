// Builds the public web pages of OpenDives from the app's own files, into
// build/site/ (not in git), ready to be published on Cloudflare Pages. One
// folder per language, the same pages in each:
//   build/site/index.html          /           sends the visitor to their language
//   build/site/en/index.html       /en/        home page
//   build/site/en/privacy.html     /en/privacy privacy policy
//   build/site/fr/...              /fr/, /fr/privacy
//   build/site/_redirects          the former addresses of the policy; the app's links to open.html
//   build/site/_headers            application/json for the two .well-known files
//   build/site/open.html           the page of an app link opened without the app (fr and en)
//   build/site/.well-known/        assetlinks.json (Android App Links), apple-app-site-association (iOS)
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

// --- Links that open the app (decided on 13 November 2026) -----------------------
/** The Android package and the iOS bundle identifier of the app. */
const ANDROID_PACKAGE = 'org.opendives.app';
const IOS_BUNDLE_ID = 'org.opendives.app';
/** SHA-256 fingerprints of the certificates that sign the Android app: the debug key now. */
const DEBUG_FINGERPRINT = '7D:01:A3:29:6D:F9:18:27:45:48:41:A1:40:DC:49:A2:AB:11:AE:00:09:11:F9:F5:1F:94:D5:17:D6:4E:8A:90';
/**
 * RELEASE KEY: add here the SHA-256 fingerprint of the key that signs the published app
 * (keytool -list -v -keystore <release keystore>; with Google Play App Signing, the
 * "App signing key certificate" of the Play Console, Setup > App signing). Until it is
 * there, only builds signed with the debug key open https links in the app.
 * @type {string[]}
 */
const RELEASE_FINGERPRINTS = [];
/**
 * The Apple Team ID, ten characters (developer.apple.com > Membership). TEAMID is a
 * placeholder: iOS Universal Links do not work until it is replaced.
 */
const APPLE_TEAM_ID = 'TEAMID';
/** The paths of the app's https links: the app's intent filters and Associated Domains cover them. */
const APP_PATHS = ['/dives/at/*', '/sites/*', '/plan/*', '/plans/*', '/tools/*', '/statistics/*'];

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
    open: {
      title: 'Open in OpenDives',
      heading: 'This link opens in the OpenDives app',
      text: 'It leads to a dive, a site or a tool of an OpenDives dive log. If OpenDives is installed on this phone or tablet, open the link from there.',
      button: 'Open in the app',
      install: 'OpenDives is not installed yet? It is a free dive log for phones and tablets; the source code is open.',
    },
  },
  fr: {
    other: 'English version',
    privacy: {
      title: 'Politique de confidentialité d’OpenDives',
      heading: 'Politique de confidentialité',
      description: 'Les données qu’utilise le carnet de plongée OpenDives, où elles vont et comment les effacer.',
    },
    home: { title: 'OpenDives, un carnet de plongée libre', privacyLink: 'Politique de confidentialité', sourceLink: 'Code source' },
    open: {
      title: 'Ouvrir dans OpenDives',
      heading: 'Ce lien s’ouvre dans l’application OpenDives',
      text: 'Il mène à une plongée, à un site ou à un outil d’un carnet OpenDives. Si OpenDives est installé sur ce téléphone ou cette tablette, ouvrez le lien depuis l’appareil.',
      button: 'Ouvrir dans l’application',
      install: 'OpenDives n’est pas encore installé ? C’est un carnet de plongée libre pour téléphones et tablettes ; le code source est ouvert.',
    },
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

// An app link opened in a browser (the app is not installed, or does not handle it): one page,
// both languages (the visitor's is first), and a button that tries the opendives:// form.
const openSection = (/** @type {string} */ lang) => {
  const o = languages[lang].open;
  return `<section lang="${lang}" class="open-${lang}">
<h1>${o.heading}</h1>
<p>${o.text}</p>
<p><a class="button" id="open-app-${lang}" href="opendives://">${o.button}</a></p>
<p>${o.install}</p>
<p><a href="${SOURCE}">${languages[lang].home.sourceLink}</a> · <a href="/${lang}/">OpenDives</a></p>
</section>`;
};
await write(
  'open.html',
  `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${codes.map((c) => languages[c].open.title).join(' / ')}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/assets/logo-light.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
<header><img src="/assets/logo-light.svg" alt="" width="56" height="56"><p class="name">OpenDives</p></header>
<main>
${codes.map(openSection).join('\n')}
</main>
<script>
  // The address stays the one the visitor followed: the button gives it to the custom scheme.
  var path = location.pathname.replace(/^\\//, '') + location.search;
  document.querySelectorAll('a.button').forEach(function (a) { a.href = 'opendives://' + path; });
  // The visitor's language first, the other one below.
  if (!/^fr\\b/i.test(navigator.language)) document.querySelector('main').appendChild(document.querySelector('.open-fr'));
</script>
</body>
</html>
`,
);
// The addresses of the policy before the language folders, and the app's links: a 200 rewrite
// serves the page without changing the address, so the browser keeps the link as it was.
await write(
  '_redirects',
  '/privacy /en/privacy 301\n/privacy/ /en/privacy 301\n/privacy/fr /fr/privacy 301\n/privacy/fr/ /fr/privacy 301\n' +
    APP_PATHS.map((p) => `${p} /open.html 200`).join('\n') +
    '\n',
);
// The files that prove the app belongs to the site must be served as JSON, with no redirect.
await write('_headers', '/.well-known/assetlinks.json\n  Content-Type: application/json\n\n/.well-known/apple-app-site-association\n  Content-Type: application/json\n');
await write(
  '.well-known/assetlinks.json',
  JSON.stringify(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: [DEBUG_FINGERPRINT, ...RELEASE_FINGERPRINTS] },
      },
    ],
    null,
    2,
  ) + '\n',
);
await write(
  '.well-known/apple-app-site-association',
  JSON.stringify({ applinks: { details: [{ appIDs: [`${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`], components: APP_PATHS.map((p) => ({ '/': p })) }] } }, null, 2) + '\n',
);
// Without a 404 page, Cloudflare Pages answers any unknown address with the home page.
await write('404.html', chooser.replace(/<script>.*<\/script>\n/, '').replace('<title>OpenDives</title>', '<title>OpenDives: page not found / page introuvable</title>').replace('<main><p>', '<main><p>Page not found. Page introuvable.</p><p>'));

await copyFile(join(root, 'app', 'src', 'fonts', 'SourceSans3VF-Upright.ttf.woff2'), join(out, 'assets', 'SourceSans3VF-Upright.ttf.woff2'));
await copyFile(join(root, 'app', 'src', 'fonts', 'OFL.txt'), join(out, 'assets', 'OFL.txt'));
await copyFile(join(root, 'app', 'public', 'logo-light.svg'), join(out, 'assets', 'logo-light.svg'));
await copyFile(join(root, 'site', 'site.css'), join(out, 'assets', 'site.css'));
console.log(`Built ${codes.length * 2 + 2} pages in ${out}`);
if (APPLE_TEAM_ID === 'TEAMID') console.log('Warning: APPLE_TEAM_ID is still the placeholder TEAMID: iOS Universal Links will not work.');
if (!RELEASE_FINGERPRINTS.length) console.log('Warning: no release fingerprint in RELEASE_FINGERPRINTS: only debug builds verify the Android App Links.');
