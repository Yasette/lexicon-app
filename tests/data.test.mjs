// Data integrity checks. Run: node tests/data.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ['words', 'questions', 'sheets', 'tricky']) vm.runInContext(fs.readFileSync(path.join(root, 'data', f + '.js'), 'utf8'), ctx);
const { BASE, QUESTIONS, SHEETS, TRICKY } = ctx;

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log('  FAIL ' + msg); } };
const TRCH = /[çğıİöşüÇĞÖŞÜ]/;

console.log('words.js');
const names = BASE.map(r => r[0].toLowerCase());
check(new Set(names).size === names.length, 'duplicate headwords: ' + names.filter((n, i) => names.indexOf(n) !== i).join(', '));
BASE.forEach(r => {
  check(r.length === 8, 'row shape ' + r[0]);
  check(r[0].trim() && !/[?\[\]]/.test(r[0]), 'odd headword ' + JSON.stringify(r[0]));
  check(r[1].trim().length > 0, 'empty English: ' + r[0]);
  check(!TRCH.test(r[1]), 'Turkish letters inside English meaning: ' + r[0]);
  check([0, 1, 2].includes(r[6]), 'difficulty band ' + r[0]);
  const syn = r[2].map(s => s.toLowerCase()), rel = r[7].map(s => s.toLowerCase());
  check(new Set(syn.concat(rel)).size === syn.length + rel.length, 'repeated synonym/related: ' + r[0]);
  check(!syn.concat(rel).includes(r[0].toLowerCase()), 'word listed as its own synonym: ' + r[0]);
});
console.log('  ' + BASE.length + ' rows');

console.log('questions.js');
const ids = QUESTIONS.map(q => q.id);
check(new Set(ids).size === ids.length, 'duplicate question ids');
QUESTIONS.forEach(q => {
  check(['wic', 'wr'].includes(q.sec), 'section ' + q.id);
  check(q.o.length === 4 && q.a >= 0 && q.a < 4, 'options/answer ' + q.id);
  check(q.p.includes('___'), 'no blank in stem ' + q.id);
  check(q.ex && !TRCH.test(q.ex), 'English explanation missing or not English: ' + q.id);
});
console.log('  ' + QUESTIONS.length + ' questions');

console.log('sheets.js');
SHEETS.forEach(s => check(s.title && s.cat && s.html && !TRCH.test(s.html), 'sheet ' + s.title));
console.log('  ' + SHEETS.length + ' sheets');

console.log('tricky.js');
const wordSet = new Set(names);
TRICKY.rv.forEach(cat => {
  check(cat.c && cat.tr && cat.ws.length, 'rv category ' + cat.c);
  cat.ws.forEach(w => check(w.length === 3 && w[1] && w[2] && !TRCH.test(w[1]), 'rv word ' + w[0]));
});
const rvWords = TRICKY.rv.flatMap(c => c.ws.map(w => w[0]));
check(new Set(rvWords).size === rvWords.length, 'rv word listed twice');
TRICKY.m2.forEach(r => check(r.length === 5 && r.slice(1).every(x => x) && !TRCH.test(r[1] + r[2]), 'm2 row ' + r[0]));
TRICKY.tk.forEach(r => check(r.length === 6 && r[2] && r[3] && !TRCH.test(r[2] + r[4]), 'tk row ' + r[0]));
const m2Names = TRICKY.m2.map(r => r[2]), tkNames = TRICKY.tk.map(r => r[2]);
check(new Set(m2Names).size === m2Names.length && new Set(tkNames).size === tkNames.length, 'repeated meaning would make two drill options right');
console.log('  ' + rvWords.length + ' rhetorical verbs, ' + TRICKY.m2.length + ' second meanings, ' + TRICKY.tk.length + ' curveballs'
  + ' (' + rvWords.concat(TRICKY.m2.map(r => r[0]), TRICKY.tk.map(r => r[0])).filter(w => !wordSet.has(w.toLowerCase())).length + ' not in the word list)');

const LANG_FILES = fs.readdirSync(path.join(root, 'data')).filter(f => !['words.js', 'questions.js', 'sheets.js', 'tricky.js'].includes(f));
for (const f of LANG_FILES) {
  console.log(f);
  const c2 = { window: {} }; vm.createContext(c2);
  vm.runInContext(fs.readFileSync(path.join(root, 'data', f), 'utf8'), c2);
  const codes = Object.keys(c2.window.GLOSS || {});
  check(codes.length === 1, 'one language per file, found ' + codes.join(','));
  const G = c2.window.GLOSS[codes[0]] || {};
  const missing = BASE.filter(r => !G[r[0]]).map(r => r[0]);
  const extra = Object.keys(G).filter(k => !BASE.some(r => r[0] === k));
  check(missing.length === 0, 'words without a gloss (' + missing.length + '): ' + missing.slice(0, 20).join(', '));
  check(extra.length === 0, 'glosses for words that do not exist (' + extra.length + '): ' + extra.slice(0, 20).join(', '));
  Object.keys(G).forEach(k => check(typeof G[k] === 'string' && G[k].trim().length > 0, 'empty gloss: ' + k));   /* cognates may equal the headword (pt: nuance) */
  console.log('  ' + codes[0] + ': ' + Object.keys(G).length + ' glosses');
}

console.log(failures ? '\n' + failures + ' failure(s)' : '\nall data checks passed');
process.exit(failures ? 1 : 0);
