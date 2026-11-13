// @ts-check
// The drawing of one QR code (qrcode-generator, MIT, no dependency).
import qrcode from 'qrcode-generator';

/**
 * One QR code as an SVG path, in module units: a single path of unit squares, row by row,
 * low error correction (a code shown on a screen is rarely damaged; bigger modules read from
 * further away), with the 4-module quiet zone left to the viewBox.
 * @param {string} text
 * @returns {{size: number, d: string}}
 */
export function qrPath(text) {
  const code = qrcode(0, 'L');
  code.addData(text, 'Byte');
  code.make();
  const size = code.getModuleCount();
  let d = '';
  for (let r = 0; r < size; r++) {
    let c = 0;
    while (c < size) {
      if (!code.isDark(r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < size && code.isDark(r, c)) c++;
      d += `M${start} ${r}h${c - start}v1h-${c - start}z`;
    }
  }
  return { size, d };
}
