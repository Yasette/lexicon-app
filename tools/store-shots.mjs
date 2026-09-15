// App Store screenshots (node tools/store-shots.mjs): the real app rendered at the iPhone 17 Pro Max
// viewport (440 x 956 CSS px at 3x = 1320 x 2868 px, Apple's 6.9-inch size)
// and, as a second set, the 6.5-inch size (428 x 926 at 3x = 1284 x 2778).
// Runs against a local server with the test mock injected (no network) and a
// small seeded profile so the screens have something on them. Nothing here
// touches the app or the real database.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, sleep } from '../tests/ui/cdp.mjs';
import { serve } from '../tests/ui/serve.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const { server, url } = await serve(root);
const mock = fs.readFileSync(path.join(root, 'tests/mock/supabase-mock.js'), 'utf8');

function seed() {
  const d = new Date(); const key = (x) => x.toISOString().slice(0, 10);
  const log = {}; for (let i = 0; i < 3; i++) { const x = new Date(d); x.setDate(d.getDate() - i); log[key(x)] = { right: 11 - i, wrong: 2, missed: ['Abstruse'], seen: ['Abate', 'Abhor'], qr: 2, qw: 1 }; }
  const srs = {}; const words = ['abate', 'abhor', 'abstruse', 'acquiesce', 'admonish', 'aesthetic', 'affable', 'alacrity', 'ambivalent', 'ameliorate', 'anomaly', 'antipathy', 'arbitrary', 'arduous', 'assuage', 'audacious'];
  words.forEach((w, i) => { srs[w] = { b: (i % 5) + 1, r: i + 1, x: i % 3, cs: i % 3, last: Date.now() - i * 864e5 }; });
  return `localStorage.setItem('lexicon.profile.v1', ${JSON.stringify(JSON.stringify({ lang: 'tr', theme: 'ember', goal: 100, goalSet: true, testDate: '2026-12-05', celebrated: key(d), idk: ['abstruse', 'acquiesce'] }))});
    localStorage.setItem('lexicon.log.v2', ${JSON.stringify(JSON.stringify(log))});
    localStorage.setItem('lexicon.srs.v2', ${JSON.stringify(JSON.stringify(srs))});`;
}

async function run(name, width, height, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const profile = path.join(os.tmpdir(), 'lexicon-store-' + name + '-' + process.pid);
  const cdp = await launch({ profile, width, height, scale: 3, port: 9420 + (name === '6.9' ? 0 : 1) });
  const shot = (f) => cdp.shot(path.join(outDir, f + '.png'));
  const ev = (js) => cdp.eval(js);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: mock });
  /* the welcome screen first, before the seeded profile exists */
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: "document.addEventListener('DOMContentLoaded', function () { var st = document.createElement('style'); st.textContent = '.grain{display:none}'; document.head.appendChild(st); });" });
  await cdp.goto(url, 1200);
  await ev("localStorage.clear(); document.querySelector('#v-welcome').scrollTop = 0"); await shot('08-welcome');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: seed() });
  /* The paper-grain overlay is an SVG turbulence filter; rasterising it at 3x in
     software wedges headless Chrome's screenshot path, so the store shots skip
     the grain (a 30%-opacity texture nobody will miss at store size). */
  await cdp.goto(url, 1500);
  await shot('01-home');
  await ev("var fi = indexOfWord('Ameliorate'); if (fi < 0) fi = 8; F.mode='flash'; F.dir='en'; startIds([fi, 1, 2], 'flash'); document.getElementById('card').click()"); await sleep(500);
  await shot('02-flashcard');
  await ev("var ti = indexOfWord('Alacrity'); if (ti < 0) ti = 12; F.dir='en'; startIds([ti, 1, 2, 3], 'test')"); await sleep(200);
  await ev("(function(){var b=document.querySelectorAll('#answers .ch'); var c=meaningOf(WORDS[S.deck[0]]); for (var j=0;j<b.length;j++) if (b[j].textContent.slice(1)===c) { b[j].click(); return; } b[0].click();})()"); await sleep(500);
  await shot('03-test');
  await ev("show('practice'); QDRILL=null; QF='wic'; QN=0; buildSet(); renderQuestion(); document.querySelectorAll('#q-choices .ch')[QSET[0].a].click()"); await sleep(500);
  await ev("document.querySelector('#v-practice').scrollTop = 0"); await shot('04-practice');
  await ev("show('words'); WF='all'; WQ=''; WLET=''; WPRE=null; WSUF=null; WOPEN=(indexOfWord('Abstruse') >= 0 ? indexOfWord('Abstruse') : 2); renderWords()"); await sleep(300);
  await shot('05-words');
  await ev("show('guide'); openDrill('rv')"); await sleep(300);
  await shot('06-drill');
  await ev("show('map')"); await sleep(400);
  await shot('07-progress');
  const errs = cdp.errors.slice();
  await cdp.close(); fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  console.log(name + ': ' + fs.readdirSync(outDir).length + ' files in ' + outDir + (errs.length ? '\n  ERRORS: ' + errs.join('\n  ') : ''));
}

await run('6.9', 440, 956, path.join(root, 'store/screenshots/iphone-6.9-inch-1320x2868'));
await run('6.5', 428, 926, path.join(root, 'store/screenshots/iphone-6.5-inch-1284x2778'));
server.close();
