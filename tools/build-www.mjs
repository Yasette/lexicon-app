#!/usr/bin/env node
// Copies the files the phone app needs into www/, which Capacitor bundles
// into the iOS project. The web app stays at the repo root (that is what
// GitHub Pages serves); www/ is a build product and is ignored by git.
//
//   node tools/build-www.mjs        (or: npm run build:www)
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = path.join(root, 'www');
const FILES = ['index.html', 'config.js', 'native-auth.js', 'sync.js', 'sw.js', 'manifest.json',
  'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const DIRS = ['data', 'fonts', 'vendor'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(root, f), path.join(out, f));
for (const d of DIRS) fs.cpSync(path.join(root, d), path.join(out, d), { recursive: true });

const count = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .reduce((n, e) => n + (e.isDirectory() ? count(path.join(dir, e.name)) : 1), 0);
console.log('www/ rebuilt: ' + count(out) + ' files');
