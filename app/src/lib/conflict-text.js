// @ts-check
// Puts the lines of the git log of a sync conflict into words.

/** The file of the logbook's settings, which holds the names of the dive computers. */
export const SETTINGS_FILE = '00-Subsurface';

/**
 * The computers of a "divecomputerid" value, one per line of the log:
 * Model" deviceid=… serial="…" nickname="…
 * @param {string} value
 * @returns {{ id: string, model: string, serial: string, nickname: string }[]}
 */
export function parseComputers(value) {
  const list = [];
  for (const line of value.split('\n')) {
    const m = line.match(/^"?(.*?)" deviceid=\S+(?: serial="([^"]*)")?(?: nickname="(.*?))?"?$/);
    if (!m) continue;
    const serial = m[2] ?? '';
    list.push({ id: `${m[1]}\n${serial}`, model: m[1], serial, nickname: m[3] ?? '' });
  }
  return list;
}

/** @param {string[]} a @param {string[]} b */
const sameNames = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

/**
 * What differs between the two versions of the computers' names.
 * @param {string} deviceValue
 * @param {string} cloudValue
 */
export function compareComputers(deviceValue, cloudValue) {
  /** @param {string} value */
  const byId = (value) => {
    /** @type {Map<string, { model: string, serial: string, names: string[] }>} */
    const map = new Map();
    for (const c of parseComputers(value)) {
      if (!map.has(c.id)) map.set(c.id, { model: c.model, serial: c.serial, names: [] });
      /** @type {{ names: string[] }} */ (map.get(c.id)).names.push(c.nickname);
    }
    return map;
  };
  const device = byId(deviceValue);
  const cloud = byId(cloudValue);
  const differing = [];
  const same = [];
  const onlyDevice = [];
  const onlyCloud = [];
  for (const [id, d] of device) {
    const c = cloud.get(id);
    if (!c) onlyDevice.push(d);
    else if (sameNames(d.names, c.names)) same.push(d);
    else differing.push({ model: d.model, serial: d.serial, device: d.names, cloud: c.names });
  }
  for (const [id, c] of cloud) if (!device.has(id)) onlyCloud.push(c);
  return { differing, same, onlyDevice, onlyCloud };
}

/**
 * The names of a list of computers, a name used several times once with its count.
 * @param {{ model: string, names: string[] }[]} list
 */
export function computerNames(list) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const c of list) for (const name of c.names) counts.set(name || c.model, (counts.get(name || c.model) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} (×${n})` : name)).join(', ');
}
