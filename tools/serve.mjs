#!/usr/bin/env node
// Serves the app from this folder, for trying it in a browser on this Mac.
//
//   node tools/serve.mjs            → http://localhost:3000
//   node tools/serve.mjs 8080       → http://localhost:8080
//
// Port 3000 is the default because a fresh Supabase project's "Site URL" is
// http://localhost:3000, so the sign-in link in the email lands on the running
// app without any dashboard changes. No dependencies; Node 18+.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const port = Number(process.argv[2]) || 3000;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log('Lexicon is at http://localhost:' + port + '  (Ctrl+C stops it)');
});
