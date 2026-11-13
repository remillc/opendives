// @ts-check
// What the "received dive" screen shows of a dive or plan that came by QR code, read from the
// transferred .ssrf XML itself (before anything is added to the logbook). A small tag reader:
// the file is the core's own export, whose attributes are always quoted with ' and carry
// metric values ("24.7 m", "10.0 C", "32:00 min"). No DOM, so that the tests run in Node.

/**
 * @typedef {Object} ReceivedPreview
 * @property {string} date start of the dive, 2011-05-17T11:01:00 (local time)
 * @property {string} site
 * @property {string} country
 * @property {number} maxDepthMm 0 when unknown
 * @property {number} durationSeconds 0 when unknown
 * @property {number|null} minTempMk lowest water temperature, in millikelvin; null when none
 * @property {number[]} profile flat [time s, depth mm] pairs, at most about 60 points
 * @property {number} samples the number of profile points in the file
 * @property {{o2Permille: number, hePermille: number}[]} gases
 * @property {string[]} people buddies and dive master
 */

/** @param {string} s */
const unescapeXml = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');

/**
 * The attributes of every start tag called `name`.
 * @param {string} xml
 * @param {string} name
 * @returns {Record<string, string>[]}
 */
function tags(xml, name) {
  /** @type {Record<string, string>[]} */
  const out = [];
  const re = new RegExp(`<${name}(?=[\\s/>])([^>]*)>`, 'g');
  let m;
  while ((m = re.exec(xml))) {
    /** @type {Record<string, string>} */
    const attrs = {};
    const attr = /([\w:-]+)\s*=\s*(?:'([^']*)'|"([^"]*)")/g;
    let a;
    while ((a = attr.exec(m[1]))) attrs[a[1]] = unescapeXml(a[2] ?? a[3] ?? '');
    out.push(attrs);
  }
  return out;
}

/** The text of every element called `name`. @param {string} xml @param {string} name */
function texts(xml, name) {
  const out = [];
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([^<]*)</${name}>`, 'g');
  let m;
  while ((m = re.exec(xml))) out.push(unescapeXml(m[1]).trim());
  return out;
}

/** "24.7 m" to millimetres. @param {string|undefined} v */
function mm(v) {
  const n = parseFloat(v ?? '');
  if (!Number.isFinite(n)) return 0;
  return Math.round(/ft/.test(v ?? '') ? n * 304.8 : n * 1000);
}

/** "32:00 min" or "1:02:03 min" to seconds. @param {string|undefined} v */
function seconds(v) {
  const m = /^(\d+(?::\d+)*)/.exec(v ?? '');
  if (!m) return 0;
  return m[1].split(':').reduce((t, part) => t * 60 + Number(part), 0);
}

/** "10.0 C" to millikelvin, or null. @param {string|undefined} v */
function milliKelvin(v) {
  const n = parseFloat(v ?? '');
  if (!Number.isFinite(n)) return null;
  const c = /F/.test(v ?? '') ? ((n - 32) * 5) / 9 : /K/.test(v ?? '') ? n - 273.15 : n;
  return Math.round((c + 273.15) * 1000);
}

/** "32.0%" to per mille. @param {string|undefined} v */
const permille = (v) => (Number.isFinite(parseFloat(v ?? '')) ? Math.round(parseFloat(/** @type {string} */ (v)) * 10) : 0);

/**
 * @param {string} xml the transferred .ssrf text
 * @returns {ReceivedPreview|null} null when it holds no dive
 */
export function readPreview(xml) {
  const dive = tags(xml, 'dive')[0];
  if (!dive) return null;
  const start = xml.indexOf('<dive ');
  const body = xml.slice(start);
  const dc = body.slice(Math.max(0, body.indexOf('<divecomputer')));

  const sites = tags(xml, 'site');
  const site = sites.find((s) => s.uuid === dive.divesiteid) ?? null;
  // The country is the taxonomy entry of category 2 (Subsurface's TC_COUNTRY).
  let country = '';
  if (site) {
    const at = xml.indexOf(`uuid='${site.uuid}'`);
    const end = xml.indexOf('</site>', at);
    const own = at >= 0 ? xml.slice(at, end < 0 ? undefined : end) : '';
    country = tags(own, 'geo').find((g) => g.cat === '2')?.value ?? '';
  }

  const depth = tags(dc, 'depth')[0];
  const maxDepthMm = mm(depth?.max);

  const samples = tags(dc, 'sample');
  /** @type {number[]} */
  const points = [];
  /** @type {(number|null)[]} */
  const temps = [milliKelvin(tags(dc, 'temperature')[0]?.water)];
  let last = 0;
  for (const s of samples) {
    if (s.depth !== undefined) {
      last = mm(s.depth);
    }
    if (s.time !== undefined && s.depth !== undefined) points.push(seconds(s.time), last);
    if (s.temp !== undefined) temps.push(milliKelvin(s.temp));
  }
  const step = Math.max(1, Math.ceil(points.length / 2 / 60));
  const profile = [];
  for (let i = 0; i < points.length; i += 2 * step) profile.push(points[i], points[i + 1]);

  const valid = /** @type {number[]} */ (temps.filter((t) => t !== null && t > 0));
  const gases = tags(body.slice(0, body.indexOf('<divecomputer') < 0 ? undefined : body.indexOf('<divecomputer')), 'cylinder')
    .filter((c) => c.use !== 'not used')
    .map((c) => ({ o2Permille: permille(c.o2) || 209, hePermille: permille(c.he) }));

  const people = [...texts(body, 'buddy'), ...texts(body, 'divemaster')].flatMap((p) => p.split(',').map((x) => x.trim())).filter(Boolean);

  return {
    date: `${dive.date ?? ''}T${dive.time ?? '00:00:00'}`,
    site: site?.name ?? '',
    country,
    maxDepthMm: maxDepthMm || mm(dive.maxdepth),
    durationSeconds: seconds(dive.duration),
    minTempMk: valid.length ? Math.min(...valid) : null,
    profile,
    samples: samples.length,
    gases,
    people,
  };
}

/**
 * The label that goes with the codes: "Site", or the date when the dive has no site.
 * @param {string} xml
 */
export function labelOf(xml) {
  const p = readPreview(xml);
  return p?.site || p?.date.slice(0, 10) || '';
}

/**
 * The key by which a received dive is compared with the logbook: start date and time to the
 * second, as lib/deep-link.js does.
 * @param {ReceivedPreview} preview
 */
export const startKey = (preview) => preview.date.slice(0, 19);
