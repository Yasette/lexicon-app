// Checks tools/smtp-check.mjs against a fake mail server on this Mac. The
// fake speaks just enough SMTP (STARTTLS with a throwaway certificate that
// openssl makes for the run, AUTH PLAIN, one message) and answers with
// Gmail's real refusal texts. Nothing reaches the network or Gmail.
// Run: node tests/smtp-check.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import { spawnSync } from 'node:child_process';
import { smtpCheck, explain } from '../tools/smtp-check.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicon-smtp-'));
const gen = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
  '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem')], { stdio: 'ignore' });
if (gen.status !== 0) { console.log('smtp-check: skipped (openssl is not available)'); process.exit(0); }
const key = fs.readFileSync(path.join(dir, 'key.pem')), cert = fs.readFileSync(path.join(dir, 'cert.pem'));
fs.rmSync(dir, { recursive: true, force: true });

const AT = '@';
const USER = 'sender' + AT + 'fake.local', PASS = 'abcdefghijklmnop';
const NORMAL = 'normal' + AT + 'fake.local', BLOCKED = 'blocked' + AT + 'fake.local';
const got = [];
const ctx = tls.createSecureContext({ key, cert });

const server = net.createServer((raw) => {
  let s = raw, secure = false, inData = false, data = '', buf = '';
  const say = (...lines) => s.write(lines.join('\r\n') + '\r\n');
  const onData = (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2); onLine(line); }
  };
  function onLine(line) {
    if (inData) {
      if (line === '.') { inData = false; got.push(data); data = ''; say('250 2.0.0 OK'); }
      else data += line + '\n';
      return;
    }
    if (/^EHLO /i.test(line)) return say('250-fake.local at your service', secure ? '250-AUTH LOGIN PLAIN XOAUTH2' : '250-STARTTLS', '250 8BITMIME');
    if (/^STARTTLS$/i.test(line)) {
      say('220 2.0.0 Ready to start TLS');
      raw.removeListener('data', onData);             /* same tick: the ClientHello goes to TLS */
      s = new tls.TLSSocket(raw, { isServer: true, secureContext: ctx });
      s.on('data', onData); s.on('error', () => {});
      secure = true; buf = '';
      return;
    }
    if (/^AUTH PLAIN /i.test(line)) {
      if (!secure) return say('530 5.7.0 Must issue a STARTTLS command first.');
      const [, u, p] = Buffer.from(line.slice(11), 'base64').toString('utf8').split('\u0000');
      if (u === NORMAL) return say('534-5.7.9 Application-specific password required. For more information, go to', '534 5.7.9  https://support.google.com/mail/?p=InvalidSecondFactor');
      if (u === BLOCKED) return say('534-5.7.14 <https://accounts.google.com/signin/continue> Please log in via your web browser and', '534 5.7.14 then try again.');
      if (u === USER && p === PASS) return say('235 2.7.0 Accepted');
      return say('535-5.7.8 Username and Password not accepted. For more information, go to', '535 5.7.8  https://support.google.com/mail/?p=BadCredentials');
    }
    if (/^(MAIL FROM|RCPT TO):/i.test(line)) return say('250 2.1.0 OK');
    if (/^DATA$/i.test(line)) { inData = true; return say('354 Go ahead'); }
    if (/^QUIT$/i.test(line)) { say('221 2.0.0 closing connection'); return void s.end(); }
    say('502 5.5.1 Unrecognized command.');
  }
  raw.on('data', onData); raw.on('error', () => {});
  say('220 fake.local ESMTP ready');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const opts = { host: '127.0.0.1', port: server.address().port, insecure: true };

let failures = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('  ok   ' + name); }
  catch (e) { failures++; console.log('  FAIL ' + name + '\n       ' + (e.message || e)); }
};
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

console.log('smtp-check');
await t('probe gets through STARTTLS, lists the sign-in methods, sends nothing', async () => {
  const r = await smtpCheck({ ...opts, probe: true });
  assert(r.ok && /PLAIN/.test(r.auth), JSON.stringify(r));
  assert(got.length === 0, 'a probe must not send anything');
});
await t('the right pair signs in and sends one test email to the same mailbox', async () => {
  const r = await smtpCheck({ ...opts, user: USER, pass: PASS });
  assert(r.ok && r.sent, JSON.stringify(r));
  assert(got.length === 1, 'one message, got ' + got.length);
  assert(got[0].includes('Subject: Lexicon: Gmail accepted the App Password') && got[0].includes('To: <' + USER + '>'), got[0]);
  assert(!got[0].includes(PASS), 'the password must never appear in the email');
});
await t('a wrong App Password reads as a mismatched pair, and nothing is sent', async () => {
  const r = await smtpCheck({ ...opts, user: USER, pass: 'wrongwrongwrongw' });
  assert(!r.ok && r.code === 535 && /different Google account/.test(r.why), JSON.stringify(r));
  assert(got.length === 1, 'nothing more may be sent');
});
await t('a normal password and a blocked sign-in each get their own advice', async () => {
  const a = await smtpCheck({ ...opts, user: NORMAL, pass: 'x' });
  assert(!a.ok && a.code === 534 && /normal password/.test(a.why), a.why);
  const b = await smtpCheck({ ...opts, user: BLOCKED, pass: 'x' });
  assert(!b.ok && /Yes, it was me/.test(b.why), b.why);
  assert(/too many attempts/.test(explain('454 4.7.0 Too many login attempts, please try again later.')), 'rate-limit advice');
});

server.close();
console.log(failures ? '\n' + failures + ' failure(s)' : '\nsmtp-check tests passed');
process.exit(failures ? 1 : 0);
