// @ts-check
// Sharing a dive or a plan by QR code, phone to phone, without a network
// (inbox task 2026-11-13-102). Pure functions: the screens (QrShare.svelte, the
// received dive) and the native scanner (QrScanActivity.kt, which counts the codes
// with the same header) rely on this format.
//
// A transfer is the core's .ssrf XML of one dive or one plan, compressed (raw
// deflate) and cut into chunks; each chunk is one QR code, a text of printable ASCII:
//
//   OD1~<kind>~<transfer>~<index>~<total>~<crc>~<label>~<data>
//
// - OD1: the magic and the format version (a later, incompatible format says OD2);
// - kind: "d" a dive, "p" a plan;
// - transfer: an id of 6 characters [0-9a-z], the same on every chunk of one transfer;
// - index: 1 to total; total: the number of chunks;
// - crc: CRC-32 of the whole compressed stream, 8 hex digits (checks the assembly);
// - label: base64url of the UTF-8 summary shown by the scanner ("Lake Coleridge"), up to
//   40 characters before encoding; the same on every chunk, so the scanner shows it from
//   the first code, whatever the order;
// - data: base64url of this chunk's slice of the compressed stream.
//
// "~" never appears in base64url, so the header splits on it. Keep the scanner's header
// parsing (QrScanActivity.parseChunk) in line with parseChunk below.

export const QR_MAGIC = 'OD1';
/**
 * Bytes of the compressed stream per chunk: about 400 characters per code with the header, a
 * version 13 code (69 modules) at low error correction. Not 700 (about 1 KB, version 29,
 * 133 modules): on 13 November 2026 such codes were read only with the phone held right
 * against the screen.
 */
export const CHUNK_BYTES = 250;
/** Longest label, in characters. */
export const LABEL_MAX = 40;

/** @typedef {'d'|'p'} TransferKind a dive, a plan */

/**
 * @typedef {Object} Chunk
 * @property {TransferKind} kind
 * @property {string} transfer
 * @property {number} index 1 to total
 * @property {number} total
 * @property {string} crc
 * @property {string} label
 * @property {Uint8Array} bytes
 */

/** @param {Uint8Array} bytes */
export function toBase64Url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} text @returns {Uint8Array|null} null when it is not base64url */
export function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const s = atob(padded);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** @type {Uint32Array|null} */
let crcTable = null;

/** CRC-32 (the one of zip and PNG), 8 hex digits. @param {Uint8Array} bytes */
export function crc32(bytes) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

/**
 * @param {Uint8Array} bytes
 * @param {'compress'|'decompress'} direction
 * @returns {Promise<Uint8Array>}
 */
async function pipe(bytes, direction) {
  const stream = new Blob([/** @type {BlobPart} */ (bytes)]).stream().pipeThrough(direction === 'compress' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A new transfer id. @returns {string} */
export function newTransferId() {
  const a = new Uint8Array(6);
  crypto.getRandomValues(a);
  return [...a].map((n) => (n % 36).toString(36)).join('');
}

/** The label as it is carried: one line, at most LABEL_MAX characters. @param {string} text */
export function cleanLabel(text) {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > LABEL_MAX ? `${one.slice(0, LABEL_MAX - 1)}…` : one;
}

/**
 * The chunks (QR code texts) of one dive or plan.
 * @param {{kind: TransferKind, label: string, xml: string, transfer?: string}} input
 * @returns {Promise<{transfer: string, chunks: string[]}>}
 */
export async function encodeTransfer({ kind, label, xml, transfer = newTransferId() }) {
  const packed = await pipe(new TextEncoder().encode(xml), 'compress');
  const crc = crc32(packed);
  const total = Math.max(1, Math.ceil(packed.length / CHUNK_BYTES));
  const head = toBase64Url(new TextEncoder().encode(cleanLabel(label)));
  const chunks = [];
  for (let i = 0; i < total; i++) {
    const slice = packed.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES);
    chunks.push([QR_MAGIC, kind, transfer, i + 1, total, crc, head, toBase64Url(slice)].join('~'));
  }
  return { transfer, chunks };
}

/**
 * Reads one scanned text.
 * @param {string} text
 * @returns {{ok: true, chunk: Chunk} | {ok: false, reason: 'foreign'|'version'}}
 *   "foreign": not an OpenDives code; "version": an OpenDives code of a later format
 */
export function parseChunk(text) {
  const parts = String(text).split('~');
  const magic = parts[0] ?? '';
  if (!/^OD\d+$/.test(magic)) return { ok: false, reason: 'foreign' };
  if (magic !== QR_MAGIC) return { ok: false, reason: 'version' };
  if (parts.length !== 8) return { ok: false, reason: 'foreign' };
  const [, kind, transfer, i, n, crc, head, data] = parts;
  const index = Number(i);
  const total = Number(n);
  const bytes = fromBase64Url(data);
  const label = fromBase64Url(head);
  if ((kind !== 'd' && kind !== 'p') || !/^[0-9a-z]{6}$/.test(transfer) || !/^[0-9a-f]{8}$/.test(crc)) return { ok: false, reason: 'foreign' };
  if (!Number.isInteger(index) || !Number.isInteger(total) || index < 1 || total < 1 || index > total || total > 999 || !bytes || !label) return { ok: false, reason: 'foreign' };
  return { ok: true, chunk: { kind, transfer, index, total, crc, label: new TextDecoder().decode(label), bytes } };
}

/**
 * What a scanner knows after the codes read so far.
 * @typedef {Object} Receiver
 * @property {string} transfer '' before the first code
 * @property {TransferKind|''} kind
 * @property {string} label
 * @property {number} total
 * @property {string} crc
 * @property {Map<number, Uint8Array>} parts the chunks by index
 */

/** @returns {Receiver} */
export const newReceiver = () => ({ transfer: '', kind: '', label: '', total: 0, crc: '', parts: new Map() });

/**
 * Adds a scanned text to a receiver (which changes).
 * - "foreign" / "version": not usable; nothing changes;
 * - "other": the code belongs to another transfer; nothing changes until the caller
 *   calls restart after asking the diver;
 * - "added" / "again": a new code, or one already read; `complete` when every code is there.
 * @param {Receiver} receiver
 * @param {string} text
 * @returns {{status: 'foreign'|'version'|'other'|'added'|'again', complete: boolean}}
 */
export function receive(receiver, text) {
  const parsed = parseChunk(text);
  if (!parsed.ok) return { status: parsed.reason, complete: false };
  const c = parsed.chunk;
  if (receiver.transfer === '') {
    receiver.transfer = c.transfer;
    receiver.kind = c.kind;
    receiver.label = c.label;
    receiver.total = c.total;
    receiver.crc = c.crc;
  } else if (c.transfer !== receiver.transfer) {
    return { status: 'other', complete: false };
  }
  if (c.total !== receiver.total || c.crc !== receiver.crc) return { status: 'foreign', complete: false };
  const again = receiver.parts.has(c.index);
  receiver.parts.set(c.index, c.bytes);
  return { status: again ? 'again' : 'added', complete: receiver.parts.size === receiver.total };
}

/** Starts again with a new transfer. @param {Receiver} receiver */
export function restart(receiver) {
  Object.assign(receiver, newReceiver());
}

/** The indexes still missing, 1 to total. @param {Receiver} receiver */
export const missing = (receiver) => Array.from({ length: receiver.total }, (_, i) => i + 1).filter((i) => !receiver.parts.has(i));

/**
 * The text of the dive or plan, once every code is read. Rejects with Error('INCOMPLETE')
 * or Error('CORRUPT') (the codes do not make the stream they announced).
 * @param {Receiver} receiver
 * @returns {Promise<{kind: TransferKind, label: string, xml: string}>}
 */
export async function decodeTransfer(receiver) {
  if (receiver.transfer === '' || missing(receiver).length) throw new Error('INCOMPLETE');
  const list = [...receiver.parts.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  const packed = new Uint8Array(list.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of list) {
    packed.set(b, at);
    at += b.length;
  }
  if (crc32(packed) !== receiver.crc) throw new Error('CORRUPT');
  let raw;
  try {
    raw = await pipe(packed, 'decompress');
  } catch {
    throw new Error('CORRUPT');
  }
  return { kind: /** @type {TransferKind} */ (receiver.kind), label: receiver.label, xml: new TextDecoder().decode(raw) };
}

/**
 * Decodes a whole list of scanned texts (what the native scanner returns).
 * @param {string[]} texts
 */
export async function decodeTexts(texts) {
  const receiver = newReceiver();
  for (const text of texts) receive(receiver, text);
  return decodeTransfer(receiver);
}
