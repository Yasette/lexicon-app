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
const listed = new Set(BASE.map(r => r[0].toLowerCase()));
QUESTIONS.filter(q => q.sec === 'wic').forEach(q => q.o.forEach(o =>
  check(listed.has(String(o).toLowerCase()) || (q.g && q.g[o]), 'practice option without a meaning: ' + q.id + ' ' + o)));
QUESTIONS.forEach(q => { if (q.g) Object.keys(q.g).forEach(o => check(q.o.includes(o) && q.g[o] && !TRCH.test(q.g[o]), 'stray or non-English option gloss: ' + q.id + ' ' + o)); });
QUESTIONS.forEach(q => {
  check(Array.isArray(q.why) && q.why.length === 4 && q.why.every(w => w && w.trim().length > 20 && !TRCH.test(w)), 'every option needs an English explanation: ' + q.id);
  check(q.why && /^Correct\b/.test(q.why[q.a]) && q.why.filter(w => /^Correct\b/.test(w)).length === 1, 'exactly the answer\'s explanation starts with Correct: ' + q.id);
  check(q.ex_tr && q.ex_tr.trim(), 'Turkish summary: ' + q.id);
  check(new Set(q.o).size === 4, 'four different options: ' + q.id);
  if (q.sec === 'wic') q.o.forEach(o => check(listed.has(String(o).toLowerCase()), 'words-in-context option not in the word list: ' + q.id + ' ' + o));
});
check(!QUESTIONS.some(q => /^[cg]\d+$/.test(q.id)), 'an id from the retired bank is back');
/* ten practice tests of 30: 15 words in context, then 15 rules, with the
   answers spread over A-D so no letter is a pattern to learn */
const TESTS = 10;
check(QUESTIONS.every(q => Number.isInteger(q.t) && q.t >= 1 && q.t <= TESTS), 'every question belongs to a test 1-' + TESTS);
for (let t = 1; t <= TESTS; t++) {
  const qs = QUESTIONS.filter(q => q.t === t);
  check(qs.length === 30, 'Practice ' + t + ' has ' + qs.length + ' questions, not 30');
  check(qs.slice(0, 15).every(q => q.sec === 'wic') && qs.slice(15).every(q => q.sec === 'wr'), 'Practice ' + t + ': 15 words in context, then 15 rules');
  for (const sec of ['wic', 'wr']) {
    const pos = [0, 1, 2, 3].map(i => qs.filter(q => q.sec === sec && q.a === i).length);
    check(pos.every(n => n >= 3), 'Practice ' + t + ' ' + sec + ': answers lean on one letter ' + pos.join('/'));
  }
}
check(QUESTIONS.every((q, i) => i === 0 || q.t >= QUESTIONS[i - 1].t), 'questions are grouped by test, in order');
const stems = QUESTIONS.map(q => q.p);
check(new Set(stems).size === stems.length, 'two questions share a passage');
const wicAnswers = QUESTIONS.filter(q => q.sec === 'wic').map(q => String(q.o[q.a]).toLowerCase());
check(new Set(wicAnswers).size === wicAnswers.length, 'a word is the answer twice: ' + wicAnswers.filter((w, i) => wicAnswers.indexOf(w) !== i).join(', '));
/* a distractor the list calls a synonym of the answer would make two options right */
const synOf = new Map(BASE.map(r => [r[0].toLowerCase(), r[2].map(s => s.toLowerCase())]));
QUESTIONS.filter(q => q.sec === 'wic').forEach(q => {
  const ans = String(q.o[q.a]).toLowerCase();
  q.o.forEach((o, j) => {
    const w = String(o).toLowerCase();
    if (j !== q.a) check(!(synOf.get(ans) || []).includes(w) && !(synOf.get(w) || []).includes(ans), 'distractor listed as a synonym of the answer: ' + q.id + ' ' + o);
  });
});
/* "a ___" or "an ___": every option must take that article, or grammar alone rules one out */
const vowelSound = w => /^[aeiou]/i.test(w) && !/^(ub|un[ai]|uti|usu|ura|ure|uro|eu|one)/i.test(w);
QUESTIONS.forEach(q => {
  if (/\b(a|an)\s+___/i.test(q.p)) check(new Set(q.o.map(o => vowelSound(String(o)))).size === 1, 'the article before the blank gives an option away: ' + q.id);
});
console.log('  ' + QUESTIONS.length + ' questions in ' + TESTS + ' tests, every option explained');

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
