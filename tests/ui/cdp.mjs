// Minimal Chrome DevTools Protocol driver: no dependencies, Node >= 22.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function req(method, url) {
  return new Promise((resolve, reject) => {
    const r = http.request(url, { method }, (res) => {
      let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad json: ' + d)); } });
    });
    r.on('error', reject); r.end();
  });
}

export async function launch({ port = 9333, profile, width = 390, height = 844, scale = 2 } = {}) {
  profile = profile || path.join(process.cwd(), '.chrome-profile');
  fs.rmSync(profile, { recursive: true, force: true });
  const proc = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--disable-gpu',
    `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });
  let version;
  for (let i = 0; i < 50; i++) { try { version = await req('GET', `http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(200); } }
  if (!version) throw new Error('chrome did not start');
  const target = await req('PUT', `http://127.0.0.1:${port}/json/new?about:blank`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const cdp = new CDP(ws, proc);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: true });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  cdp.on('Runtime.exceptionThrown', (p) => cdp.errors.push('EXCEPTION: ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text)));
  cdp.on('Log.entryAdded', (p) => { if (p.entry.level === 'error') cdp.errors.push('LOG: ' + p.entry.text + ' ' + (p.entry.url || '')); });
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error' || p.type === 'warning') cdp.errors.push(p.type.toUpperCase() + ': ' + p.args.map((a) => a.value ?? a.description).join(' ')); });
  return cdp;
}

class CDP {
  constructor(ws, proc) {
    this.ws = ws; this.proc = proc; this.id = 0; this.pending = new Map(); this.listeners = new Map(); this.errors = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); if (!p) return; msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
      else (this.listeners.get(msg.method) || []).forEach((f) => f(msg.params));
    };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => { const id = ++this.id; this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  on(method, fn) { if (!this.listeners.has(method)) this.listeners.set(method, []); this.listeners.get(method).push(fn); }
  off(method, fn) { this.listeners.set(method, (this.listeners.get(method) || []).filter((f) => f !== fn)); }
  once(method) { return new Promise((res) => { const fn = (p) => { this.off(method, fn); res(p); }; this.on(method, fn); }); }
  async goto(url, settle = 1500) {
    const loaded = this.once('Page.loadEventFired');
    await this.send('Page.navigate', { url }); await loaded; await sleep(settle);
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '\n  in: ' + expression.slice(0, 120));
    return r.result.value;
  }
  async shot(file) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
  }
  async close() {
    try { this.ws.close(); } catch {}
    const gone = new Promise((r) => this.proc.once('exit', r));
    this.proc.kill();
    await Promise.race([gone, sleep(3000)]);      /* let Chrome finish writing its profile */
  }
}
export { sleep };
