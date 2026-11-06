// Builds core/data/regions.txt, the offline country and region lookup used
// when Nominatim cannot be reached (core/libopendives/regions.cpp).
//
// Source: Natural Earth 1:10m, public domain (https://www.naturalearthdata.com):
//   ne_10m_admin_1_states_provinces.zip and ne_10m_admin_0_countries.zip from
//   https://naciscdn.org/naturalearth/10m/cultural/
// Unzip both in one directory, then:
//   node tools/build-regions.mjs <that directory>
// mapshaper (npx) simplifies the shapes to 5 % of their points.
//
// Format (UTF-8 text, one record per line, fields separated by tabs):
//   C <iso_a2> <name_en> <name_fr>              a country, numbered from 0
//   R <country> <name_en> <name_fr> <minx> <miny> <maxx> <maxy>
//   P <x>,<y>,<dx>,<dy>,...                     one ring of the last region
// Coordinates are in thousandths of a degree (x = longitude), the first point
// absolute and the next ones as differences. Rings use the even-odd rule, so
// holes need no marking.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/build-regions.mjs <directory with the unzipped Natural Earth files>');
  process.exit(1);
}
const out = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..', 'core', 'data', 'regions.txt');
const work = mkdtempSync(path.join(tmpdir(), 'od-regions-'));
const mapshaper = (...args) => execFileSync('npx', ['-y', 'mapshaper@0.6', ...args], { stdio: 'inherit', shell: true });

mapshaper(path.join(src, 'ne_10m_admin_1_states_provinces.shp'), '-simplify', '5%', 'keep-shapes',
  '-filter-fields', 'name,name_en,name_fr,adm0_a3,region', '-o', 'format=geojson', 'precision=0.001', path.join(work, 'a1.json'));
mapshaper(path.join(src, 'ne_10m_admin_0_countries.shp'),
  '-filter-fields', 'ADM0_A3,ISO_A2,NAME,NAME_EN,NAME_FR', '-o', 'format=json', path.join(work, 'a0.json'));

const clean = (/** @type {unknown} */ s) => String(s ?? '').replace(/[\t\r\n]/g, ' ').trim();
const countries = JSON.parse(readFileSync(path.join(work, 'a0.json'), 'utf8'));
/** @type {Map<string, number>} */
const countryIndex = new Map();
const lines = [];
// The usual short names where Natural Earth gives the official one.
/** @type {Record<string, {en?: string, fr?: string}>} */
const shortNames = { USA: { en: 'United States' }, CHN: { en: 'China', fr: 'Chine' } };
for (const c of countries) {
  countryIndex.set(c.ADM0_A3, countryIndex.size);
  const short = shortNames[c.ADM0_A3] ?? {};
  lines.push(['C', clean(c.ISO_A2), clean(short.en || c.NAME_EN || c.NAME), clean(short.fr || c.NAME_FR || c.NAME)].join('\t'));
}

const regions = JSON.parse(readFileSync(path.join(work, 'a1.json'), 'utf8')).features;
const upperLevel = new Set(['FRA', 'ITA', 'PHL']);
let skipped = 0;
for (const f of regions) {
  const country = countryIndex.get(f.properties.adm0_a3);
  if (country === undefined || !f.geometry) {
    skipped++;
    continue;
  }
  const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = polygons.flat().map((ring) => ring.map(([x, y]) => [Math.round(x * 1000), Math.round(y * 1000)]));
  const xs = rings.flat().map((p) => p[0]);
  const ys = rings.flat().map((p) => p[1]);
  // Where Natural Earth's first level is below the country's own (France's
  // départements, Italy's provinces), the region they belong to.
  const upper = upperLevel.has(f.properties.adm0_a3) ? clean(f.properties.region) : '';
  const name = upper || clean(f.properties.name_en || f.properties.name);
  lines.push(['R', country, name, upper || clean(f.properties.name_fr) || name, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].join('\t'));
  for (const ring of rings) {
    const values = [ring[0][0], ring[0][1]];
    for (let i = 1; i < ring.length; i++) values.push(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
    lines.push('P\t' + values.join(','));
  }
}
writeFileSync(out, '# OpenDives offline regions: Natural Earth 1:10m (public domain), built by tools/build-regions.mjs\n' + lines.join('\n') + '\n');
console.log(`${countries.length} countries, ${regions.length - skipped} regions (${skipped} skipped) -> ${out}`);
