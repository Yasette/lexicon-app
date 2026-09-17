// End-to-end smoke test in headless Chrome. Run: node tests/ui/smoke.mjs
// Starts its own static server, drives the real index.html through the
// DevTools protocol and asserts on app state. No test data ever touches
// the app code: fixtures are injected into the page by this runner.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, sleep } from './cdp.mjs';
import { serve } from './serve.mjs';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const { server, url } = await serve(root);
const profile = path.join(os.tmpdir(), 'lexicon-smoke-' + process.pid);   /* never inside the repo */
const cdp = await launch({ profile });
let failures = 0, passes = 0;
const t = async (name, fn) => {
  try { await fn(); passes++; console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + (e.message || e)); }
};
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const ev = (js) => cdp.eval(js);
const visible = (id) => ev(`!document.getElementById('${id}').hidden`);
const click = (sel) => ev(`(function(){var b=document.querySelector(${JSON.stringify(sel)}); if(!b) throw new Error('no '+${JSON.stringify(sel)}); b.click(); return true;})()`);

await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(root, 'tests', 'mock', 'supabase-mock.js'), 'utf8') });
await cdp.goto(url, 2000);

await t('first run shows the welcome screen, not home', async () => {
  assert(await visible('v-welcome'), 'welcome hidden'); assert(!(await visible('v-home')), 'home shown');
  assert(await ev("document.querySelectorAll('#wl-langs [data-lang]').length") === await ev('LANGS.length'), 'every language listed');
});
await t('with accounts required, Start waits for a sign-in', async () => {
  await click('#wl-langs [data-lang=zh]');
  assert(await ev("document.getElementById('wl-go').disabled"), 'Start should be disabled before signing in');
  assert((await ev("document.getElementById('wl-go').textContent")) === 'Sign in above to start', 'gate label');
  assert(!(await visible('v-home')), 'must not land on home');
  await ev("__mock.cfg.requireAccount = false; renderGate()");
  assert(!(await ev("document.getElementById('wl-go').disabled")), 'requireAccount:false must open the door');
  await ev("__mock.cfg.requireAccount = true; renderGate()");
  assert(await ev("document.getElementById('wl-go').disabled"), 'gate back on');
});
await t('picking a language, signing in and starting lands on home and persists', async () => {
  await ev('__mock.signIn()'); await sleep(300);
  assert(!(await ev("document.getElementById('wl-go').disabled")), 'Start should open after sign-in');
  await click('#wl-go');
  assert(await visible('v-home')); assert(await ev('PROF.lang') === 'zh');
  assert(await ev("JSON.parse(localStorage.getItem(LS.prof)).lang") === 'zh', 'not saved');
  await click('[data-auth="signout"]'); await sleep(200);          /* the rest of the suite runs signed out */
  assert(!(await ev('!!Sync.user()')), 'signed out');
});
await t('Chinese gloss shows, English definition stays', async () => {
  const m = await ev("meaningOf(BASE[0])"); assert(/[㐀-鿿]/.test(m), 'no Chinese gloss for ' + await ev('BASE[0][0]') + ': ' + m);
  assert(await ev("glossOf(BASE[0]) !== BASE[0][1]"));
  await ev("setLang('en', true)"); assert(await ev("meaningOf(BASE[0]) === BASE[0][1]"), 'English only');
  await ev("setLang('tr', true)"); assert(await ev("meaningOf(BASE[0]) === BASE[0][3]"), 'Turkish');
});
await t('a flashcard session records every answer and the streak', async () => {
  await ev("F.mode='flash'; F.dir='en'; startIds([0,1,2],'flash')");
  for (let i = 0; i < 3; i++) { await click('#card'); await click(i === 1 ? '#b-miss' : '#b-got'); }
  assert(await visible('v-result'), 'result screen');
  const log = await ev('LOG[dayKey(new Date())]');
  assert(log && log.right === 2 && log.wrong === 1, 'day log ' + JSON.stringify(log));
  assert(log.seen.length === 3 && log.missed.length === 1, 'names kept');
  assert(await ev("Object.keys(SRS).length") === 3 && await ev("!!SRS[BASE[0][0].toLowerCase()]"), 'SRS keyed by word');
  assert(await ev('streak()') === 1, 'streak');
});
await t('leaving a test early still counts the answers given', async () => {
  await ev("startIds([10,11,12,13,14],'test')");
  for (let i = 0; i < 2; i++) { await click('#answers .ch'); await click('#answers .go'); }
  await ev("show('home')");
  const log = await ev('LOG[dayKey(new Date())]');
  assert(log.right + log.wrong === 5, 'expected 5 answers logged, got ' + (log.right + log.wrong));
});
await t('test distractors never include a synonym of the answer', async () => {
  const bad = await ev(`(function(){ var bad=[]; for (var n=0;n<150;n++){ var i=Math.floor(Math.random()*BASE.length); S={deck:[i],i:0,right:0,wrong:0,missed:[],shown:false,mode:'test',dir:'tr'}; renderTest(WORDS[i],'tr');
    var opts=[].map.call(document.querySelectorAll('#answers .ch'),function(b){return b.textContent.slice(1).toLowerCase();});
    var syn=synList(WORDS[i]).map(function(s){return s.toLowerCase();});
    if (new Set(opts).size!==4) bad.push('dup:'+WORDS[i][0]);
    opts.forEach(function(o){ if (syn.indexOf(o)>=0) bad.push(WORDS[i][0]+' -> '+o); }); }
    S=null; return bad; })()`);
  assert(bad.length === 0, bad.join('; '));
});
await t('added words are escaped, deduplicated and removable', async () => {
  await ev("show('add'); document.getElementById('add-text').value='<b>tricky</b> = a <i>meaning</i>\\nabate = again\\nzeal = 热情'; document.getElementById('add-save').click()");
  assert((await ev("document.getElementById('add-result').textContent")).includes('Don’t know pile: Abate'), 'dup notice');
  assert(!(await ev("document.getElementById('add-result').innerHTML")).includes('<b>tricky'), 'escaped in notice');
  await ev("show('words'); WF='mine'; renderWords()");
  const html = await ev("document.getElementById('w-list').innerHTML");
  assert(html.includes('&lt;b&gt;tricky&lt;/b&gt;') && !html.includes('<b>tricky</b>'), 'escaped in list');
  assert(await ev("WORDS.length") === await ev("BASE.length + 2"), 'two added');
  assert(await ev("meaningOf(MINE[1])") === '热情', 'native gloss kept for own word');
  await ev("removeMine(BASE.length)");
  assert(await ev("MINE.length") === 1 && await ev("MINE[0][0]") === 'zeal', 'removed the first');
});
await t('word list pages with Show more', async () => {
  await ev("WF='all'; WQ=''; WSHOW=60; renderWords()");
  assert(await ev("document.querySelectorAll('#w-list .wrow').length") === 60);
  assert(await visible('w-more')); await click('#w-more');
  assert(await ev("document.querySelectorAll('#w-list .wrow').length") === 120);
});
await t('practice: gloss only for word questions, explanation in two languages', async () => {
  await ev("show('practice'); QF='all'; QN=0; buildSet(); QI=0; renderQuestion()");
  await click('#q-choices .ch');
  assert(await visible('q-gloss'), 'gloss shown for words-in-context');
  assert(await ev("document.querySelectorAll('#q-choices .ch.right').length") === 1 && await ev("document.querySelectorAll('#q-choices .ch.dim, #q-choices .ch.wrong').length") === 3, 'options graded green / red / dim');
  assert(await ev("document.querySelectorAll('#q-ex p').length") === 2, 'English + Turkish explanation');
  await ev("QI = QSET.findIndex(function(q){return q.sec==='wr';}); renderQuestion()"); await click('#q-choices .ch');
  assert(!(await visible('q-gloss')), 'no gloss block for rules questions');
});
await t('clearing progress needs two taps', async () => {
  await ev("show('settings')"); await click('#wipe');
  assert(await ev("Object.keys(SRS).length") > 0, 'first tap must not clear');
  await click('#wipe');
  assert(await ev("Object.keys(SRS).length") === 0 && await ev("Object.keys(LOG).length") === 0, 'second tap clears');
  assert(await ev("MINE.length") === 1, 'own words survive');
});
await t('word of the day stays put while you study', async () => {
  await ev("show('home')"); const before = await ev("document.getElementById('wotd-w').textContent");
  await ev("startIds([20,21],'flash'); document.getElementById('card').click(); document.getElementById('b-got').click(); document.getElementById('card').click(); document.getElementById('b-got').click(); show('home')");
  assert(await ev("document.getElementById('wotd-w').textContent") === before, 'word changed after a session');
});
await t('theme choice is applied and saved', async () => {
  await ev("applyTheme('sage')");
  assert(await ev("document.getElementById('phone').dataset.theme") === 'sage');
  assert(await ev("JSON.parse(localStorage.getItem(LS.prof)).theme") === 'sage');
});
await t('practice answers count toward the day and the streak, misses are remembered', async () => {
  const before = await ev("(LOG[dayKey(new Date())] || {}).qr || 0") + await ev("(LOG[dayKey(new Date())] || {}).qw || 0");
  await ev("show('practice'); QF='all'; QN=0; buildSet(); QI=0; renderQuestion()");
  const wrongIdx = await ev("(QSET[0].a + 1) % 4");
  await click('#q-choices .ch:nth-child(' + (wrongIdx + 1) + ')');
  const e = await ev('LOG[dayKey(new Date())]');
  assert(((e.qr || 0) + (e.qw || 0)) === before + 1, 'one practice answer logged: ' + JSON.stringify(e));
  assert(await ev('streak()') >= 1, 'streak alive');
  assert(await ev("(PROF.qmiss || []).indexOf(QSET[0].id) >= 0"), 'miss remembered');
  assert(!(await ev("document.querySelector('#q-filter [data-v=miss]').disabled")), 'Missed chip enabled');
});
await t('word filters: status, letter, prefix and suffix combine', async () => {
  await ev("show('words'); WF='all'; WQ=''; WLET='A'; WPRE=null; WSUF=SUFFIXES.findIndex(function(x){return x[0]==='ous';}); WSHOW=500; renderWords()");
  const words = await ev("[].map.call(document.querySelectorAll('#w-list .wrow .w'), function(el){return el.textContent;})");
  assert(words.length > 0 && words.every(w => /^A/.test(w) && /ous$/i.test(w)), 'A…ous only: ' + words.slice(0, 5).join(','));
  assert(!(await ev("document.getElementById('w-clear').hidden")), 'Clear link shown');
  await click('#w-filterbtn');
  assert(!(await ev("document.getElementById('w-sheet').hidden")), 'sheet opens');
  assert(await ev("document.querySelectorAll('#w-az button').length") === 26, 'A to Z');
  await click('#w-clear'); await click('#w-done');
  assert(await ev("WLET === '' && WSUF === null && WF === 'all'"), 'cleared');
  assert(await ev("document.getElementById('w-sheet').hidden"), 'sheet closes');
});
await t('milestones screen shows earned and unearned medals', async () => {
  await ev("show('miles')");
  assert(await ev("document.querySelectorAll('#medals .medal').length") === await ev('MILES.length'), 'all medals listed');
  assert(await ev("document.querySelectorAll('#medals .medal:not(.off)').length") >= 1, 'first session earned');
  assert(await ev("!!(PROF.miles && PROF.miles.first)"), 'earned date stored');
});
await t('theme reaches the document root and the status bar colour', async () => {
  await ev("applyTheme('indigo')");
  assert(await ev("document.documentElement.dataset.theme") === 'indigo', 'html attribute');
  const meta = await ev("document.querySelector('meta[name=theme-color]').content.toUpperCase()");
  const paper = await ev("getComputedStyle(document.documentElement).getPropertyValue('--paper').trim().toUpperCase()");
  assert(meta === paper, 'meta ' + meta + ' vs paper ' + paper);
  await ev("applyTheme('ember')");
});
await t('the name greets on the home screen', async () => {
  await ev("PROF.name = 'Yasemin'; show('home')");
  assert((await ev("document.getElementById('home-eyebrow').textContent")).includes('Yasemin'), 'greeting');
  await ev("PROF.name = ''; show('home')");
  assert(await ev("document.getElementById('home-eyebrow').textContent") === 'SAT Reading & Writing', 'default eyebrow');
});
await t('confetti fires once per day when a streak is alive', async () => {
  await ev("delete PROF.celebrated; save(LS.prof, PROF); greetStreak()");
  assert(await ev("PROF.celebrated === dayKey(new Date())"), 'marked as celebrated');
  await sleep(600);
  assert(!(await ev("document.getElementById('confetti').hidden")), 'canvas showing');
  await sleep(2300);
  assert(await ev("document.getElementById('confetti').hidden"), 'canvas hidden after the burst');
});
await t('old row-number progress migrates to word keys', async () => {
  await ev("localStorage.clear(); localStorage.setItem('lexicon.srs.v1', JSON.stringify({ '0': { b: 3, r: 3, x: 0, cs: 3, last: Date.now() } })); localStorage.setItem(LS.prof, JSON.stringify({ lang: 'en', theme: 'ember' }))");
  await cdp.goto(url, 1500);
  assert(await ev("!!SRS[BASE[0][0].toLowerCase()] && SRS[BASE[0][0].toLowerCase()].b === 3"), 'migrated');
  assert(await ev("localStorage.getItem('lexicon.srs.v2') !== null"), 'saved under v2');
});
await t('no console errors or exceptions so far', async () => { assert(cdp.errors.length === 0, cdp.errors.join('\n')); });

// ---- accounts + sync, against the in-memory mock (injected, never shipped) ----
console.log('sync (mock backend)');
await ev("localStorage.clear(); localStorage.setItem(LS.prof, JSON.stringify({ lang: 'tr', theme: 'ember' }))");
await cdp.goto(url, 1500);
await t('“I don’t know this word” feeds the Don’t know pile from practice, tests, cards and the list', async () => {
  await ev("show('practice'); QDRILL=null; QF='wic'; QN=0; buildSet(); renderQuestion()");
  assert(await visible('q-idk'), 'link hidden before answering');
  assert(await ev('questionWord(QSET[QI])') >= 0, 'first question’s answer is not in the word list');
  const before = await ev("(LOG[dayKey(new Date())]||{}).qw||0");
  await click('#q-idk');
  assert(await ev('QANS[QI]') === -2, 'not recorded as “don’t know”');
  const verdict = await ev("document.getElementById('q-verdict').textContent");
  assert(verdict.includes('Not sure yet') && verdict.includes('the answer is'), 'verdict: ' + verdict);
  assert(await ev("getComputedStyle(document.getElementById('q-verdict')).borderStyle") === 'none', 'verdict is framed');
  assert(await ev("getComputedStyle(document.getElementById('q-verdict')).backgroundColor") === 'rgba(0, 0, 0, 0)', 'verdict has a fill');
  assert(!(await visible('q-idk')), 'link still shown after answering');
  assert(await ev("(LOG[dayKey(new Date())]||{}).qw") === before + 1, 'not counted as a miss for the day');
  const word = await ev("WORDS[questionWord(QSET[QI])][0].toLowerCase()");
  assert((await ev('PROF.idk')).includes(word), 'answer word not in the pile: ' + word);
  await ev("startIds([30],'test')");
  await click('#s-idk');
  assert((await ev("document.querySelector('#card .verdict').textContent")).includes('Not sure yet'), 'session verdict');
  assert(await ev("document.querySelectorAll('#answers .ch.right').length") === 1, 'right answer not shown');
  await click('#answers .go');
  assert(await ev('isIdk(30)'), 'test word not in the pile');
  assert(await ev('SRS[wkey(30)].x') === 1, 'not graded as a miss');
  await ev("startIds([31],'flash')"); await click('#s-idk');
  assert(await ev('S.shown && S.idk'), 'flash card not turned over');
  await click('#b-got');
  assert(await ev('isIdk(31)'), 'flash word not in the pile');
  assert(await ev("F.pool='idk'; poolIds().length") >= 3, 'study pool');
  await ev("F.pool='due'; show('words'); WF='idk'; WQ=''; WLET=''; WPRE=null; WSUF=null; WOPEN=31; renderWords()");
  assert(await ev("document.querySelectorAll('#w-list .wrow').length") === await ev('idkIds().length'), 'words filter');
  assert((await ev("document.getElementById('w-sum').textContent")).includes('Don’t know'), 'filter summary');
  assert(await ev("document.querySelector('[data-idk=\"31\"]').textContent") === 'I know this now', 'toggle label');
  await click('[data-idk="31"]');
  assert(!(await ev('isIdk(31)')), 'toggle did not remove the word');
  await ev("WF='all'; WOPEN=-1; renderWords()");
});
await t('add words takes dashes, colons and bare words from the list', async () => {
  const mine = await ev('MINE.length');
  await ev("show('add'); document.getElementById('add-text').value='glib - fluent but shallow\\nfrangible: kırılgan = easily broken\\nAbate\\njust some words here'; document.getElementById('add-save').click()");
  assert(await ev('MINE.length') === mine + 2, 'two added, got ' + (await ev('MINE.length') - mine));
  const fr = await ev('MINE[MINE.length-1]');
  assert(fr[0] === 'frangible' && fr[3] === 'kırılgan' && fr[5] === 'easily broken', 'colon line parsed: ' + JSON.stringify(fr));
  assert((await ev('PROF.idk')).includes('abate'), 'bare known word not flagged');
  const text = await ev("document.getElementById('add-result').textContent");
  assert(text.includes('2 added') && text.includes('Don’t know pile: Abate') && text.includes('1 line skipped'), 'notice: ' + text);
  assert(await ev("document.getElementById('add-text').value") === '', 'box not cleared');
});
await t('guide drills: a deck reads as a sheet and drills as a practice set', async () => {
  await ev("show('guide')");
  assert(await ev("document.querySelectorAll('#guide-list [data-drill]').length") === 3, 'three decks');
  await click('[data-drill="m2"]');
  assert(await visible('v-sheet') && (await ev("document.getElementById('sh-title').textContent")) === 'Second meanings', 'sheet');
  assert(await ev("document.querySelectorAll('#sh-body .dl p').length") === 14, 'list rows');
  await click('[data-drillstart="m2"]');
  assert(await visible('v-practice') && await ev("QDRILL==='m2' && QSET.length===14"), 'drill set');
  assert(!(await visible('q-filters')) && await visible('q-drillrow'), 'chips hidden, way back shown');
  assert(await ev("QSET.every(function(q){return new Set(q.o).size===4 && q.o[q.a]===TRICKY.m2.filter(function(r){return r[0]===q.word})[0][2]})"), 'options distinct with the right answer');
  const qm = (await ev('PROF.qmiss||[]')).length;
  await ev("(function(){var b=document.querySelectorAll('#q-choices .ch'); for (var j=0;j<b.length;j++) if (j!==QSET[QI].a) { b[j].click(); return; }})()");
  assert((await ev('PROF.qmiss||[]')).length === qm, 'drill miss leaked into the Missed section');
  assert((await ev("document.getElementById('q-tag').textContent")) === 'Second meanings', 'tag');
  assert(await visible('q-ex') && (await ev("document.getElementById('q-ex').textContent")).includes('SAT anlamı'), 'Turkish explanation under the English one');
  await click('#q-drillback');
  assert(await visible('v-sheet') && await ev('QDRILL===null'), 'back to the sheet');
  await ev("show('practice')");
  assert(await visible('q-filters') && await ev("QSET.length>0 && QSET[0].sec!=='drill'"), 'practice back to the bank');
});
await t('every practice option shows a meaning, and the nav sits above them', async () => {
  const bad = await ev(`(function(){ QDRILL=null; QF='wic'; QN=0; buildSet(); var bad=[]; for (var i=0;i<QSET.length;i++){ QI=i; QANS[i]=QSET[i].a; renderQuestion();
    [].forEach.call(document.querySelectorAll('#q-gloss div'), function(d,j){ if(!d.querySelector('span').textContent.trim()) bad.push(QSET[i].id+':'+QSET[i].o[j]); }); }
    return bad; })()`);
  assert(bad.length === 0, 'options without a meaning: ' + bad.join(', '));
  assert(await ev("!!(document.querySelector('.qnav').compareDocumentPosition(document.getElementById('q-gloss')) & Node.DOCUMENT_POSITION_FOLLOWING)"), 'Previous/Next should come before the meanings');
  assert((await ev("getComputedStyle(document.querySelector('#q-gloss span')).fontFamily")).includes('Source Serif'), 'meanings should be set in the serif');
  assert((await ev("getComputedStyle(document.getElementById('q-ex')).fontFamily")).includes('Source Serif'), 'explanation should be set in the serif');
  await ev("QANS=QSET.map(function(){return -1;}); QI=0; renderQuestion()");
});
await t('Settings has a Reach us line when a contact address is configured', async () => {
  await ev("show('settings')");
  assert(await visible('reach'), 'Reach us panel');
  assert((await ev("document.getElementById('reach-mail').getAttribute('href')")).indexOf('mailto:help') === 0, 'mail link');
});
await t('tall phones centre the home screen and scale the type; short phones scale down', async () => {
  await ev("show('home')");
  const base = await ev("document.querySelector('#v-home .mast').getBoundingClientRect().top");
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
  await sleep(200);
  assert(parseFloat(await ev("getComputedStyle(document.documentElement).getPropertyValue('--s')")) === 1.06, 'scale on a tall phone');
  const tall = await ev("document.querySelector('#v-home .mast').getBoundingClientRect().top");
  assert(tall > base + 20, 'home not centred: ' + base + ' -> ' + tall);
  assert(await ev("parseFloat(getComputedStyle(document.querySelector('#v-home .mast h1')).fontSize)") > 39, 'h1 not scaled');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  await sleep(200);
  assert(parseFloat(await ev("getComputedStyle(document.documentElement).getPropertyValue('--s')")) === 0.95, 'scale on a short phone');
  assert(await ev("document.querySelector('#v-home .mast').getBoundingClientRect().top") < base + 1, 'short phone should pin to the top');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(100);
});
await t('welcome says settings can be changed later and offers sign-in before Start', async () => {
  assert((await ev("document.getElementById('v-welcome').textContent")).includes('changed later, in Settings'), 'copy');
  assert(await ev("!!(document.getElementById('wl-account').compareDocumentPosition(document.getElementById('wl-go')) & Node.DOCUMENT_POSITION_FOLLOWING)"), 'account panel should come before Start');
  assert(await ev("document.querySelectorAll('[data-auth=\"email-toggle\"]').length") === 0, 'no email toggle: the field shows directly');
});
await t('account panel appears only when a backend is configured', async () => {
  await ev("show('settings')"); assert(await visible('acct'), 'panel hidden'); assert(await visible('acct-out'), 'signed-out state');
  assert(await ev("document.querySelector('#acct [data-auth=apple]').hidden"), 'Apple is not enabled in the mock config, so it must stay hidden');
  assert(await ev("!document.querySelector('#acct [data-auth=google]').hidden"), 'Google is enabled in the mock config');
});
await t('email sign-in sends one email, then takes the code from it', async () => {
  assert(await visible('acct-emailrow') && !(await visible('acct-coderow')), 'email field shows, code row waits');
  await click('#acct-emailrow [data-auth="email"]');
  assert((await ev("document.querySelector('#acct [data-auth-msg]').textContent")).includes('Type your email'), 'validation');
  await ev("document.getElementById('acct-email').value='someone' + '@' + 'example.org'");
  await click('#acct-emailrow [data-auth="email"]'); await sleep(50);
  const otp = await ev('__mock.calls().otp');
  assert(otp && otp.options.shouldCreateUser === true && /^http/.test(otp.options.emailRedirectTo), 'signInWithOtp options: ' + JSON.stringify(otp));
  assert(await visible('acct-coderow'), 'code row not revealed');
  await ev("document.getElementById('acct-code').value='000000'"); await click('#acct-coderow [data-auth="code"]'); await sleep(50);
  assert((await ev("document.querySelector('#acct [data-auth-msg]').textContent")).includes('did not work'), 'bad code message');
  assert(!(await visible('acct-in')), 'a bad code must not sign in');
  await ev("document.getElementById('acct-code').value='123 456'"); await click('#acct-coderow [data-auth="code"]'); await sleep(150);
  assert((await ev('__mock.calls().verify')).type === 'email', 'verifyOtp type');
  assert(await visible('acct-in'), 'the code did not sign in');
  await click('[data-auth="signout"]'); await sleep(150);
  assert(await visible('acct-out'), 'sign out');
});
await t('an account with a password can sign in with it (App Review’s way in)', async () => {
  assert(!(await visible('acct-pwrow')), 'password row hidden until asked for');
  await click('#acct [data-auth="pw-toggle"]');
  assert(await visible('acct-pwrow'), 'password row');
  await ev("document.getElementById('acct-email').value='reviewer' + '@' + 'example.org'; document.getElementById('acct-pw').value='wrong'");
  await click('#acct-pwrow [data-auth="password"]'); await sleep(80);
  assert((await ev("document.querySelector('#acct [data-auth-msg]').textContent")).includes('Most accounts have no password'), 'wrong password message should point to the email path');
  assert(!(await visible('acct-in')), 'wrong password must not sign in');
  await ev("document.getElementById('acct-pw').value='correct-horse'");
  await click('#acct-pwrow [data-auth="password"]'); await sleep(150);
  assert(await visible('acct-in'), 'password sign-in');
  await click('[data-auth="signout"]'); await sleep(150);
  assert(await visible('acct-out'), 'signed out again');
});
await t('a returning person on a new phone skips the welcome once the profile arrives', async () => {
  await ev("localStorage.clear()"); await cdp.goto(url, 1200);
  assert(await visible('v-welcome'), 'welcome on a fresh phone');
  await ev("__mock.seed(LS.prof, { lang: 'ko', theme: 'plum', goalSet: true, goal: 150 }); __mock.signIn()"); await sleep(500);
  assert(await visible('v-home'), 'should land on home with the pulled profile');
  assert(await ev("PROF.lang === 'ko' && PROF.goal === 150"), 'pulled profile applied');
  await click('[data-auth="signout"]'); await sleep(150);
});
await t('signing in pulls the server copy and merges it with local progress', async () => {
  await ev("F.mode='flash'; startIds([5],'flash'); document.getElementById('card').click(); document.getElementById('b-got').click()");
  await ev("__mock.seed(LS.srs, { 'zealous': { b: 4, r: 4, x: 0, cs: 4, last: 1 } }); __mock.seed(LS.log, { '2020-01-01': { right: 9, wrong: 1, missed: ['Woe'], seen: ['Woe'] } }); __mock.signIn()");
  await sleep(400);
  assert(await ev("!!SRS['zealous'] && !!SRS[BASE[5][0].toLowerCase()]"), 'merged both sides: ' + await ev('Object.keys(SRS).join()'));
  assert(await ev("!!LOG['2020-01-01']"), 'old day kept');
  assert(await visible('acct-in'), 'signed-in panel');
});
await t('local changes are pushed after a short delay', async () => {
  const before = (await ev('__mock.calls()')).upsert;
  await ev("startIds([6],'flash'); document.getElementById('card').click(); document.getElementById('b-got').click()");
  await sleep(3200);
  const rows = await ev('__mock.rows()');
  assert((await ev('__mock.calls()')).upsert > before, 'no push');
  assert(rows[await ev('LS.srs')][await ev('BASE[6][0].toLowerCase()')], 'pushed row lacks the new word');
});
await t('deleting the account needs two taps and calls the server', async () => {
  await ev("show('settings')"); await click('[data-auth="delete"]'); await sleep(50);
  assert(!(await ev('__mock.calls()')).rpc.includes('delete_my_account'), 'first tap must not delete');
  await click('[data-auth="delete"]'); await sleep(100);
  assert((await ev('__mock.calls()')).rpc.includes('delete_my_account'), 'rpc called');
  assert(await visible('acct-out'), 'signed out again');
});
await t('no console errors or exceptions during sync', async () => { assert(cdp.errors.length === 0, cdp.errors.join('\n')); });

await cdp.close(); server.close();
fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
