// Minimal Chrome DevTools Protocol client for the app's WebView on the
// emulator, with no dependency (Node's global WebSocket and fetch).
// Never touches a device other than the emulator: every adb call carries
// `-s emulator-5554`.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const SERIAL = 'emulator-5554';
export const PACKAGE = 'org.opendives.app';
const PORT = 9223;

/** The adb to use: $ADB, the one on the PATH, or the Android SDK's. */
export function adbPath() {
  if (process.env.ADB) return process.env.ADB;
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'));
  if (sdk) {
    for (const name of ['adb.exe', 'adb']) {
      const p = path.join(sdk, 'platform-tools', name);
      if (existsSync(p)) return p;
    }
  }
  return 'adb';
}

/** @param {string[]} args */
export function adb(args) {
  return execFileSync(adbPath(), ['-s', SERIAL, ...args], { encoding: 'utf8' });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Page {
  /** @param {WebSocket} ws */
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) reject(new Error(m.error.message));
        else resolve(m.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      // A command that is never answered (the app died, the page was replaced) must not hang the run.
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`no answer to ${method} after 60 s`));
      }, 60000);
      this.pending.set(id, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Evaluates an expression in the page (awaiting promises) and returns its value. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text} in ${expression.slice(0, 120)}`);
    return r.result.value;
  }

  /** Waits until the expression is truthy; returns its value. */
  async waitFor(expression, what = expression, timeoutMs = 20000) {
    const start = Date.now();
    for (;;) {
      let v;
      try {
        v = await this.eval(expression);
      } catch {
        v = null;
      }
      if (v) return v;
      if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for ${what}`);
      await sleep(150);
    }
  }

  close() {
    this.ws.close();
  }
}

/** Connects to the app's WebView over adb forward. */
export async function connect() {
  const sockets = adb(['shell', 'cat /proc/net/unix']).split('\n').map((l) => l.match(/@(webview_devtools_remote_\d+)/)?.[1]).filter(Boolean);
  if (!sockets.length) throw new Error('no WebView debugging socket: is the app running on the emulator?');
  const pid = adb(['shell', 'pidof', PACKAGE]).trim().split(/\s+/)[0];
  const socket = sockets.find((s) => s.endsWith('_' + pid)) ?? sockets[0];
  adb(['forward', `tcp:${PORT}`, `localabstract:${socket}`]);
  const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
  if (!page) throw new Error('no page in the WebView');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket error')), { once: true });
  });
  const p = new Page(ws);
  await p.send('Runtime.enable');
  return p;
}

export { sleep };
