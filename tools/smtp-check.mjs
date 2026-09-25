#!/usr/bin/env node
// Lexicon — check a Gmail address and App Password on this Mac before they go
// into Supabase.
//
//   node tools/smtp-check.mjs          asks for the address and the App Password,
//                                      signs in to Gmail's mail server the same way
//                                      Supabase does (smtp.gmail.com, port 587,
//                                      encrypted), and if Gmail accepts the pair,
//                                      sends one test email to that same mailbox
//   node tools/smtp-check.mjs --probe  only checks that this Mac reaches Gmail's
//                                      mail server; no sign-in, nothing sent
//
// Nothing is saved or printed. The App Password goes to smtp.gmail.com and
// nowhere else. No dependencies; Node 18+.
import net from 'node:net';
import tls from 'node:tls';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

const AT = '@';

/* One SMTP reply per call. A reply is every line up to the one whose 3-digit
   code is followed by a space ("250-..." lines, then "250 ..."). */
function reader(sock) {
  let buf = '', lines = [], failure = null;
  const ready = [], waiting = [];
  sock.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      lines.push(line);
      if (/^\d{3}(?: |$)/.test(line)) {
        const reply = { code: Number(line.slice(0, 3)), text: lines.join('\n') };
        lines = [];
        const w = waiting.shift();
        if (w) w.resolve(reply); else ready.push(reply);
      }
    }
  });
  const fail = (e) => { if (!failure) failure = e; while (waiting.length) waiting.shift().reject(failure); };
  sock.on('error', fail);
  sock.on('close', () => fail(new Error('the mail server closed the connection')));
  return () => new Promise((resolve, reject) => {
    if (ready.length) return resolve(ready.shift());
    if (failure) return reject(failure);
    waiting.push({ resolve, reject });
  });
}

function expect(r, code, step) {
  if (r.code !== code) throw new Error(step + ': the server answered\n  ' + r.text.replace(/\n/g, '\n  '));
}

/* Gmail's refusals, in words a person can act on. */
export function explain(text) {
  if (/5\.7\.8|BadCredentials|Username and Password not accepted/i.test(text))
    return 'Gmail rejected this address and App Password together. Almost always the App Password '
      + 'was made in a different Google account than the address you typed, or it was copied wrong. '
      + 'Open an Incognito window, sign in ONLY to this address, delete its old App Passwords, make '
      + 'a new one, and run this again.';
  if (/5\.7\.9|Application-specific password required|InvalidSecondFactor/i.test(text))
    return 'That is the account\'s normal password. Gmail wants an App Password here, from '
      + 'myaccount.google.com/apppasswords (2-Step Verification must be on first).';
  if (/5\.7\.14|web browser|WebLoginRequired/i.test(text))
    return 'Google blocked this sign-in as unusual. Open gmail.com as this address, answer the '
      + 'security alert with "Yes, it was me", wait a minute, and run this again.';
  if (/4\.7\.0|too many|temporar/i.test(text))
    return 'Gmail is refusing sign-ins for a while after too many attempts. Wait 15 minutes, then try once.';
  return 'Gmail said no; its own words are above.';
}

export async function smtpCheck({ host = 'smtp.gmail.com', port = 587, user = '', pass = '', send = true, probe = false, insecure = false } = {}) {
  const raw = await new Promise((resolve, reject) => {
    const s = net.connect(port, host);
    s.once('connect', () => resolve(s));
    s.once('error', reject);
  });
  raw.setTimeout(20000, () => raw.destroy(new Error('no answer from ' + host + ' for 20 seconds')));
  const say = (s, line) => s.write(line + '\r\n');
  let read = reader(raw), r;
  try {
    r = await read(); expect(r, 220, 'Connecting');
    say(raw, 'EHLO lexicon-check'); r = await read(); expect(r, 250, 'Saying hello');
    if (!/STARTTLS/i.test(r.text)) throw new Error(host + ' does not offer an encrypted connection (STARTTLS).');
    say(raw, 'STARTTLS'); r = await read(); expect(r, 220, 'Starting encryption');
  } catch (e) { raw.destroy(); throw e; }

  raw.removeAllListeners('data');
  const t = tls.connect({ socket: raw, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: !insecure });
  await new Promise((resolve, reject) => { t.once('secureConnect', resolve); t.once('error', reject); });
  read = reader(t);
  const quit = async () => { try { say(t, 'QUIT'); await read(); } catch (e) { /* closing anyway */ } t.end(); };
  try {
    say(t, 'EHLO lexicon-check'); r = await read(); expect(r, 250, 'Saying hello (encrypted)');
    const auth = ((r.text.match(/AUTH[ =]([^\n]*)/i) || [])[1] || '').trim();
    if (probe) { await quit(); return { ok: true, auth }; }

    say(t, 'AUTH PLAIN ' + Buffer.from('\u0000' + user + '\u0000' + pass, 'utf8').toString('base64'));
    r = await read();
    if (r.code !== 235) { await quit(); return { ok: false, code: r.code, text: r.text, why: explain(r.text) }; }

    if (send) {
      say(t, 'MAIL FROM:<' + user + '>'); r = await read(); expect(r, 250, 'Sender');
      say(t, 'RCPT TO:<' + user + '>'); r = await read(); expect(r, 250, 'Recipient');
      say(t, 'DATA'); r = await read(); expect(r, 354, 'Message');
      const id = Date.now().toString(36) + '.' + Math.random().toString(36).slice(2);
      const msg = [
        'From: Lexicon <' + user + '>',
        'To: <' + user + '>',
        'Subject: Lexicon: Gmail accepted the App Password',
        'Date: ' + new Date().toUTCString(),
        'Message-ID: <' + id + AT + 'lexicon-check>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=us-ascii',
        '',
        'This test came from tools/smtp-check.mjs on your Mac.',
        'Gmail accepted this address and App Password, so the same pair will work in',
        'Supabase > Authentication > Emails > SMTP Settings.',
        ''
      ].join('\r\n');
      t.write(msg.replace(/\r\n\./g, '\r\n..') + '\r\n.\r\n');
      r = await read(); expect(r, 250, 'Sending the test email');
    }
    await quit();
    return { ok: true, sent: !!send };
  } catch (e) { t.destroy(); throw e; }
}

/* ------------------------------------------------------------- CLI --- */
function askLine(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); resolve(a); });
  });
}
/* Nothing is shown while typing or pasting, like a password prompt in Terminal. */
function askHidden(q) {
  const stdin = process.stdin;
  if (!stdin.isTTY) return askLine(q);
  return new Promise((resolve) => {
    process.stdout.write(q);
    let val = '';
    stdin.setRawMode(true); stdin.setEncoding('utf8'); stdin.resume();
    const finish = () => {
      stdin.removeListener('data', onData); stdin.setRawMode(false); stdin.pause();
      process.stdout.write('\n');
      resolve(val.replace(/\u001b\[[0-9;?]*[~A-Za-z]/g, ''));   // drop paste and arrow-key escape codes
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n' || ch === '\u0004') return finish();
        if (ch === '\u0003') { stdin.setRawMode(false); process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') { val = val.slice(0, -1); continue; }
        val += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  if (process.argv.includes('--probe')) {
    const r = await smtpCheck({ probe: true });
    console.log('This Mac reaches smtp.gmail.com on port 587, and the encrypted connection works.');
    console.log('Gmail offers sign-in by: ' + (r.auth || '(not listed)'));
    return;
  }
  console.log('Lexicon: check a Gmail address and App Password before they go into Supabase.\n');
  const user = (await askLine('Gmail address that sends the sign-in emails: ')).trim().toLowerCase();
  const at = user.lastIndexOf(AT), domain = at > 0 ? user.slice(at + 1) : '';
  if (!domain) { console.log('That is not an email address.'); process.exitCode = 2; return; }
  if (domain !== 'gmail.com' && domain !== 'googlemail.com')
    console.log('  Note: this is not a gmail.com address. School and work accounts usually do not allow\n'
      + '  App Passwords; a personal gmail.com account is the safe choice.');
  const pass = (await askHidden('App Password (nothing shows while you type or paste it; then press Enter): ')).replace(/\s+/g, '');
  if (!/^[a-z]{16}$/.test(pass))
    console.log('  Note: an App Password is 16 small letters (Google shows it as four groups of four).\n'
      + '  What you entered is ' + pass.length + ' characters' + (/[^a-z]/.test(pass) ? ', and not only small letters' : '')
      + ', so it is probably not one. Trying anyway.');
  console.log('\nSigning in to smtp.gmail.com as ' + user + ' ...');
  let r;
  try { r = await smtpCheck({ user, pass }); }
  catch (e) { console.log('\nCould not finish: ' + e.message); process.exitCode = 1; return; }
  if (!r.ok) {
    console.log('\nGmail answered:\n  ' + r.text.replace(/\n/g, '\n  ') + '\n\n' + r.why);
    process.exitCode = 1; return;
  }
  console.log('\nGmail accepted it. A test email ("Lexicon: Gmail accepted the App Password") is on its way to\n'
    + user + '. Check that inbox.\n');
  console.log('Now put exactly these into Supabase > Authentication > Emails > SMTP Settings, and press Save:');
  console.log('  Sender email    ' + user);
  console.log('  Sender name     Lexicon');
  console.log('  Host            smtp.gmail.com');
  console.log('  Port number     587');
  console.log('  Username        ' + user);
  console.log('  Password        the same 16 letters, typed or pasted without spaces');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
