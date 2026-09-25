/* Lexicon — accounts and cloud sync.
 *
 * Off by default: with no keys in config.js this file does nothing and the app
 * stays the offline app. With keys, it adds sign-in (email link or code, a
 * password for accounts that have one, plus Google / Apple when those
 * providers are turned on) and keeps a copy of the five progress keys in
 * Supabase, one row per key per person.
 *
 * The device stays the source of truth. The app calls Sync.touch(key) inside
 * save(); a couple of seconds later the phone syncs: it reads the server copy,
 * merges it per word / per day with what it has, writes the merge locally and
 * sends back whatever differs from the server. The same sync runs at sign-in,
 * when the app comes to the foreground and when the connection returns.
 *
 * Four rules keep the account copy safe:
 *   1. Every write is a read-merge-write: nothing is sent until the server
 *      copy has been read and merged first, so a phone can never overwrite
 *      the account with an older or emptier copy of its own. A sync that
 *      fails retries by itself, with backoff.
 *   2. A sync clears only the dirty flags it actually sent; a change made
 *      while a request is in flight is sent again.
 *   3. Merges are three-way. The "shadow" is the copy both sides last agreed
 *      on; something one side lacks was deleted there if the shadow had it and
 *      the other side still holds that same copy. So a removed word, a cleared
 *      note or an emptied pile stays removed, on this phone and the next, while
 *      anything new or changed since is kept. A setting changed on one phone
 *      reaches the other for the same reason. "Clear my progress" records
 *      when it happened, and anything older than the newest clear stays gone.
 *   4. Progress on this phone belongs to the account it has synced with. When
 *      a different account signs in on the same phone, the phone starts from
 *      that account's server copy instead of mixing two people's progress.
 */
(function () {
  'use strict';
  var cfg = window.LEXICON_CONFIG || {};
  var KEY = cfg.supabaseKey || cfg.supabaseAnonKey;      /* publishable key, or the legacy anon JWT */
  if (!cfg.supabaseUrl || !KEY) return;
  var PROVIDERS = cfg.authProviders || ['email'];

  var $ = function (id) { return document.getElementById(id); };
  var LS = window.App && App.LS;
  if (!LS) return;
  var KEYS = [LS.srs, LS.log, LS.prof, LS.notes, LS.mine];
  var OWNER = 'lexicon.sync.owner.v1';      /* the account this phone has synced with */
  var SHADOW = 'lexicon.sync.shadow.v1';    /* per key: the copy the phone and the server last agreed on */
  var DAY = /^\d{4}-\d{2}-\d{2}$/;
  /* profile fields that are progress (cleared by "Clear my progress"), as
     opposed to settings */
  var DERIVED = { perfect: 1, bestStreak: 1, miles: 1, idk: 1, qmiss: 1, celebrated: 1, clearedAt: 1 };
  var WAITS = [5000, 5000, 10000, 20000, 40000, 60000];

  var sb = null, user = null, dirty = {}, timer = null, busy = false, again = false, lastPush = 0;
  var pulled = false;                       /* the server copy has been merged in for this account */
  var gen = 0;                              /* bumped by every touch; a sync clears only what it sent */
  var retry = null, fails = 0;              /* retry after a failed sync, with backoff */
  var leaving = false;                      /* our own sign-out, as opposed to a session that vanished */
  var status = 'off';                       /* off | offline | idle | saving | error */
  var pendingEmail = '', sentAt = 0;        /* the address a code was sent to, and when */

  /* ------------------------------------------------------------ UI --- */
  function show(id, on) { var el = $(id); if (el) el.hidden = !on; }
  function msg(near, text, isErr) {
    var box = near && near.closest ? near.closest('.panel') : null;
    var el = box ? box.querySelector('[data-auth-msg]') : null;
    if (!el) return;
    el.hidden = !text; el.textContent = text || '';
    el.style.color = isErr ? 'var(--accent)' : '';
  }
  function paint() {
    show('acct', true);
    show('wl-account', !user);
    show('acct-out', !user);
    show('acct-in', !!user);
    /* only the sign-in methods this deployment has turned on */
    ['google', 'apple'].forEach(function (p) {
      [].forEach.call(document.querySelectorAll('[data-auth="' + p + '"]'), function (b) { b.hidden = PROVIDERS.indexOf(p) < 0; });
    });
    if (user) {
      var who = user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name);
      $('acct-who').textContent = who ? who + ' · ' + (user.email || '') : (user.email || 'Signed in');
      var t = status === 'saving' ? (pulled ? 'Saving…' : 'Fetching your progress…')
        : status === 'offline' ? 'Offline — changes will sync when you are back online.'
        : status === 'error' ? (pulled ? 'Could not reach the server. Your progress is safe on this device.'
                                       : 'Could not reach the server yet. Your progress is safe on this device and joins your account as soon as the server answers.')
        : lastPush ? 'Synced ' + ago(lastPush) + '.' : 'Synced.';
      $('acct-sync').textContent = t;
    }
    /* the welcome screen gates Start on this */
    document.dispatchEvent(new CustomEvent('lexicon:auth'));
  }
  function ago(ts) {
    var s = Math.round((Date.now() - ts) / 1000);
    return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago';
  }

  /* ---------------------------------------------------------- SDK ---- */
  function loadSdk() {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve();
      var s = document.createElement('script');
      s.src = cfg.supabaseSdkUrl || 'vendor/supabase.js';    /* bundled; nothing from a CDN */
      s.onload = resolve; s.onerror = function () { reject(new Error('sdk')); };
      document.head.appendChild(s);
    });
  }

  /* ------------------------------------------------------- storage --- */
  function readLocal(k) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function writeLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function dropLocal(k) { try { localStorage.removeItem(k); } catch (e) {} }
  /* Postgres stores JSON with its keys sorted, so equality must ignore key order. */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function same(a, b) { return canon(a) === canon(b); }
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function wellFormed(k, v) { return k === LS.mine ? Array.isArray(v) : isObj(v); }
  function emptyFor(k) { return k === LS.mine ? [] : {}; }
  function dayOf(ts) { var d = new Date(ts); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function owner() { try { return localStorage.getItem(OWNER) || ''; } catch (e) { return ''; } }
  function setOwner(id) { try { localStorage.setItem(OWNER, id); } catch (e) {} }
  var shadow = null;
  function readShadow() { if (shadow === null) { var s = readLocal(SHADOW); shadow = isObj(s) ? s : {}; } return shadow; }
  function setShadow(k, v) { readShadow()[k] = v; writeLocal(SHADOW, shadow); }
  function clearShadow() { shadow = {}; dropLocal(SHADOW); }

  /* --------------------------------------------------------- merge --- */
  /* Only entries that pass the test, in a fresh object. */
  function clean(side, test) {
    var out = {}, k;
    for (k in side || {}) if (has(side, k) && test(side[k], k)) out[k] = side[k];
    return out;
  }
  /* Three-way, per item. L and R are the two sides, B the shadow (null when
     this phone has never synced: then everything is kept). pick(l, r, k, b)
     settles an item both sides have; b is the shadow's copy, if any. */
  function fold(L, R, B, pick) {
    var out = {}, k;
    for (k in R) if (has(R, k)) {
      if (has(L, k)) out[k] = pick(L[k], R[k], k, B && has(B, k) ? B[k] : undefined);
      else if (!(B && has(B, k) && same(B[k], R[k]))) out[k] = R[k];    /* new elsewhere, unless deleted here */
    }
    for (k in L) if (has(L, k) && !has(R, k)) {
      if (!(B && has(B, k) && same(B[k], L[k]))) out[k] = L[k];         /* new here, unless deleted elsewhere */
    }
    return out;
  }
  /* The same for a list of items (words, question ids, own-word rows), keyed
     by keyOf; order is this device's first, then what the server adds. */
  function foldList(L, R, B, keyOf) {
    var lm = {}, rm = {}, bm = B ? {} : null, out = [], seen = {};
    function index(list, map) { arr(list).forEach(function (x) { var k = keyOf(x); if (k && !has(map, k)) map[k] = x; }); }
    index(L, lm); index(R, rm); if (bm) index(B, bm);
    var keep = fold(lm, rm, bm, function (l, r, k, b) { return b !== undefined && same(b, l) ? r : l; });   /* unchanged here: theirs */
    arr(L).concat(arr(R)).forEach(function (x) { var k = keyOf(x); if (k && has(keep, k) && !seen[k]) { seen[k] = 1; out.push(keep[k]); } });
    return out;
  }
  function itemKey(x) { return typeof x === 'string' || typeof x === 'number' ? String(x) : ''; }
  function rowKey(row) { return Array.isArray(row) && typeof row[0] === 'string' ? row[0].toLowerCase() : ''; }
  function union(a, b) {
    var out = [], seen = {};
    arr(a).concat(arr(b)).forEach(function (x) { var k = itemKey(x); if (k && !seen[k]) { seen[k] = 1; out.push(x); } });
    return out;
  }
  /* A side that has not seen the newest clear: its piles, streak and perfect
     flag cannot be dated, so they go; its milestones carry a date and are cut
     by it like everything else. */
  function unseen(p) { var out = {}, k; for (k in p) if (has(p, k) && (!DERIVED[k] || k === 'miles')) out[k] = p[k]; return out; }

  /* cut: the newest "Clear my progress" on either side (a timestamp, 0 when
     none). Anything older than it was cleared on purpose and stays gone,
     whichever phone still holds a copy; anything newer survives the clear. */
  function merge(key, local, remote, base, cut) {
    if (!wellFormed(key, local)) local = null;
    if (!wellFormed(key, remote)) remote = null;
    if (!wellFormed(key, base)) base = null;
    if (local == null && remote == null) return null;
    if (remote == null) return local;                 /* nothing usable on the server: keep what we have */
    if (local == null) { local = emptyFor(key); base = null; }   /* nothing here yet: take the server copy */
    var cutDay = cut ? dayOf(cut) : '';
    if (key === LS.srs) {                        /* per word: the later review wins */
      var okEntry = function (e) { return isObj(e) && (e.last || 0) >= cut; };
      return fold(clean(local, okEntry), clean(remote, okEntry), base && clean(base, isObj),
        function (l, r) { return (l.last || 0) >= (r.last || 0) ? l : r; });
    }
    if (key === LS.log) {                        /* per day: union names, never double count */
      var okDay = function (e, k) { return isObj(e) && DAY.test(k) && k >= cutDay; };
      return fold(clean(local, okDay), clean(remote, okDay), base && clean(base, isObj), function (a, b) {
        return {
          right: Math.max(a.right || 0, b.right || 0), wrong: Math.max(a.wrong || 0, b.wrong || 0),
          qr: Math.max(a.qr || 0, b.qr || 0), qw: Math.max(a.qw || 0, b.qw || 0),
          missed: union(a.missed, b.missed), seen: union(a.seen, b.seen)
        };
      });
    }
    if (key === LS.notes) {                      /* per day: what this device changed wins, else the server's */
      var okNote = function (e, k) { return typeof e === 'string' && DAY.test(k) && k >= cutDay; };
      return fold(clean(local, okNote), clean(remote, okNote), base && clean(base, function (e) { return typeof e === 'string'; }),
        function (l, r, k, b) { return (b !== undefined && b === l) ? r : (l || r); });
    }
    if (key === LS.mine) {                       /* own words, by word */
      return foldList(local, remote, base, rowKey);
    }
    if (key === LS.prof) {
      /* Settings: field by field. A field this phone changed since the last
         sync wins (including emptying it); one it did not touch takes the
         server's value; with no shadow yet, a value here beats an empty one.
         Progress fields are three-way like everything else, and a side that
         has not seen the newest clear contributes only dated milestones. */
      var L = local, R = remote, B = base, out = {}, k, v;
      var Lp = (L.clearedAt || 0) < cut ? unseen(L) : L;
      var Rp = (R.clearedAt || 0) < cut ? unseen(R) : R;
      for (k in R) if (has(R, k) && !DERIVED[k]) out[k] = R[k];
      for (k in L) if (has(L, k) && !DERIVED[k]) {
        var mine = L[k] !== '' && L[k] != null && L[k] !== false;
        if (B && has(B, k)) { if (!same(B[k], L[k])) out[k] = L[k]; }        /* changed here since the last sync */
        else if (B && !has(R, k)) out[k] = L[k];                             /* new here */
        else if (mine || !has(R, k)) out[k] = L[k];                          /* no shadow: a value beats an empty one */
      }
      if (!L.goalSet && R.goalSet) { out.goal = R.goal; out.goalSet = true; }
      var one = function (name, combine) {
        var hasL = has(Lp, name), hasR = has(Rp, name);
        if (hasL && hasR) return combine(Lp[name], Rp[name]);
        if (hasR) return (B && has(B, name) && same(B[name], Rp[name])) ? undefined : Rp[name];
        if (hasL) return (B && has(B, name) && same(B[name], Lp[name])) ? undefined : Lp[name];
        return undefined;
      };
      v = one('perfect', function (a, b) { return !!(a || b); }); if (v) out.perfect = true;
      v = one('bestStreak', function (a, b) { return Math.max(a || 0, b || 0); }); if (v > 0) out.bestStreak = v;
      v = one('celebrated', function (a, b) { return String(a) > String(b) ? a : b; }); if (typeof v === 'string' && DAY.test(v)) out.celebrated = v;
      var okMile = function (d) { return typeof d === 'string' && DAY.test(d) && d >= cutDay; };
      v = fold(clean(Lp.miles, okMile), clean(Rp.miles, okMile), B && clean(B.miles, okMile), function (a, b) { return a < b ? a : b; });
      if (Object.keys(v).length) out.miles = v;
      v = foldList(Lp.idk, Rp.idk, B && arr(B.idk), itemKey); if (v.length) out.idk = v;
      v = foldList(Lp.qmiss, Rp.qmiss, B && arr(B.qmiss), itemKey); if (v.length) out.qmiss = v;
      if (cut) out.clearedAt = cut;
      return out;
    }
    return local;
  }

  /* ---------------------------------------------------------- sync ---- */
  /* Read the server copy, merge, write the merge here, send what differs. */
  async function sync() {
    if (!user || !sb) return;
    if (busy) { again = true; return; }
    clearTimeout(retry); retry = null;
    busy = true; status = 'saving'; paint();
    var me = user.id, ok = false;
    try {
      var res = await sb.from('user_data').select('key,value').eq('user_id', me);
      if (!user || user.id !== me) throw new Error('switched');   /* another account meanwhile: this copy is not theirs */
      if (res.error) throw res.error;
      var remote = {};
      (res.data || []).forEach(function (r) { if (r && KEYS.indexOf(r.key) >= 0) remote[r.key] = r.value; });
      var base = readShadow(), lp = readLocal(LS.prof), rp = remote[LS.prof];
      var cut = Math.max(isObj(lp) && +lp.clearedAt || 0, isObj(rp) && +rp.clearedAt || 0);
      var merged = {}, sent = {}, mark = {}, changed = false, failed = false;
      KEYS.forEach(function (k) { mark[k] = dirty[k] || 0; });   /* what was dirty when we read the phone's copy */
      KEYS.forEach(function (k) {
        var local = readLocal(k), m = merge(k, local, remote[k], base[k], cut);
        if (m == null) return;
        merged[k] = m;
        if (!same(m, local)) { if (writeLocal(k, m)) changed = true; else failed = true; }
        if (!same(m, remote[k])) sent[k] = 1;
      });
      if (failed) throw new Error('storage');     /* never send a copy the phone could not keep */
      if (changed && window.App) App.reloadState();
      var keys = Object.keys(sent);
      if (keys.length) {
        var rows = keys.map(function (k) { return { user_id: me, key: k, value: merged[k], updated_at: new Date().toISOString() }; });
        var up = await sb.from('user_data').upsert(rows, { onConflict: 'user_id,key' });
        if (!user || user.id !== me) throw new Error('switched');
        if (up.error) throw up.error;
        lastPush = Date.now();
      }
      KEYS.forEach(function (k) {
        if ((dirty[k] || 0) === mark[k]) { if (has(merged, k)) setShadow(k, merged[k]); delete dirty[k]; }
        /* else: changed while we were syncing; the flag stays and we go again */
      });
      setOwner(me);                                /* rule 4: this phone's progress now belongs here */
      pulled = true; ok = true; status = 'idle'; fails = 0;
    } catch (e) {
      if (String(e && e.message) === 'switched') { busy = false; again = false; if (user) sync(); return; }
      status = navigator.onLine ? 'error' : 'offline';
      retry = setTimeout(sync, WAITS[Math.min(fails, WAITS.length - 1)]); fails++;
    }
    busy = false; paint();
    if (ok && (again || Object.keys(dirty).length)) { again = false; schedule(0); }
    else again = false;
  }
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(sync, ms == null ? 2500 : ms);
  }
  function unsaved() {
    if (Object.keys(dirty).length) return true;
    return !pulled && KEYS.some(function (k) { return readLocal(k) != null; });
  }

  /* --------------------------------------------------------- auth ---- */
  function here() { return location.href.split('#')[0].split('?')[0]; }
  function emailOf(btn) { var input = $(btn.dataset.email); return ((input && input.value) || pendingEmail || '').trim(); }
  async function signIn(provider, btn) {
    try {
      if (provider === 'email') {
        var email = emailOf(btn);
        if (!email || email.indexOf('@') < 0) { msg(btn, 'Type your email address first.', true); return; }
        if (email === pendingEmail && Date.now() - sentAt < 30000) {
          msg(btn, 'Already sent. Check your inbox and spam; you can ask again in a minute.'); return;
        }
        /* One email, two ways in: the link signs you in where you tap it (the
           web app); the 6-digit code works anywhere, including the App Store
           build, where a link would open Safari instead of the app. */
        var r = await sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: here(), shouldCreateUser: true } });
        if (r.error) throw r.error;
        pendingEmail = email; sentAt = Date.now();
        var row = $(btn.dataset.coderow);
        if (row) { row.hidden = false; var code = row.querySelector('input'); if (code) { code.value = ''; code.focus(); } }
        msg(btn, window.Capacitor
          ? 'Sent. Type the code from the email here. (The link in the email opens the browser, not the app, so use the code.) Nothing arrived? Check spam, and wait a minute before asking again.'
          : 'Sent. Tap the link in the email, or type the code from it here. Nothing arrived? Check spam, and wait a minute before asking again.');
        return;
      }
      /* Inside the App Store build, native sign-in is expected: native-auth.js
         provides window.LexiconNativeAuth once its plugin is installed (1.1). */
      if (window.Capacitor && window.LexiconNativeAuth) {
        var tok = await window.LexiconNativeAuth(provider);
        var r2 = await sb.auth.signInWithIdToken({ provider: provider, token: tok.idToken, nonce: tok.nonce });
        if (r2.error) throw r2.error;
        return;
      }
      if (window.Capacitor) { msg(btn, 'This sign-in is not available in this version of the app yet. Use your email address.', true); return; }
      var r3 = await sb.auth.signInWithOAuth({ provider: provider, options: { redirectTo: here() } });
      if (r3.error) throw r3.error;
    } catch (e) {
      msg(btn, 'Sign-in did not work: ' + explain(e), true);
    }
  }
  /* The server's own words are for logs; these are for the person. A 500 on
     the email request means the email service (SMTP) refused to send, not
     that the address was wrong — unless the database itself failed first. */
  function explain(e) {
    var m = String((e && e.message) || e), st = e && e.status;
    if (/database error/i.test(m)) return 'the server could not set up your account just now. Try again in a minute; if it keeps happening, write to us from Settings.';
    if (st === 500 || /error sending/i.test(m)) return 'the server could not send the email just now. Your address is fine; the email service is the problem. Try again in a few minutes.';
    if (st === 429 || /rate limit|after \d+ seconds/i.test(m)) return 'please wait a minute before asking for another email.';
    if (/invalid login credentials/i.test(m)) return 'wrong email or password. Most accounts have no password at all: use “Send me a sign-in email” instead.';
    if ((e && e.name === 'AuthRetryableFetchError') || /load failed|failed to fetch|network/i.test(m)) return 'the app could not reach the server. Check your connection and try again.';
    return m;
  }
  async function verifyCode(btn) {
    var email = pendingEmail || emailOf(btn), code = ($(btn.dataset.code).value || '').replace(/\D/g, '');
    if (!email) { msg(btn, 'Type your email address first.', true); return; }
    if (code.length < 6) { msg(btn, 'Type the code from the email.', true); return; }
    try {
      var r = await sb.auth.verifyOtp({ email: email, token: code, type: 'email' });
      if (r.error) throw r.error;
      msg(btn, '');
    } catch (e) {
      msg(btn, 'That code did not work: ' + (e.message || e) + '. Ask for a new email and try again.', true);
    }
  }
  /* Accounts that have a password (App Review's, for one) can use it. */
  async function signInPassword(btn) {
    var email = emailOf(btn), pw = $(btn.dataset.pw).value || '';
    if (!email || email.indexOf('@') < 0) { msg(btn, 'Type your email address first.', true); return; }
    if (!pw) { msg(btn, 'Type your password.', true); return; }
    try {
      var r = await sb.auth.signInWithPassword({ email: email, password: pw });
      if (r.error) throw r.error;
      msg(btn, '');
    } catch (e) {
      msg(btn, 'Sign-in did not work: ' + explain(e), true);
    }
  }
  async function endSession() {
    leaving = true;
    try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {}   /* this phone only; other phones stay signed in */
    leaving = false;
    clearTimeout(retry); retry = null; clearTimeout(timer);
    user = null; dirty = {}; pulled = false; lastPush = 0; paint();
  }
  var outArmed = null;
  async function signOut(btn) {
    if (!user) return;
    if (!outArmed) {
      await sync();
      if (unsaved()) {                          /* the server has not got the latest; say so, once */
        msg(btn, 'Your latest changes have not reached your account yet (the server could not be reached). Signed out now, they stay on this phone only, until another account signs in here.', true);
        btn.textContent = 'Tap again to sign out anyway';
        outArmed = setTimeout(function () { outArmed = null; btn.textContent = 'Sign out'; }, 8000);
        return;
      }
    }
    clearTimeout(outArmed); outArmed = null; btn.textContent = 'Sign out';
    msg(btn, '');
    await endSession();
  }
  var delArmed = null;
  async function deleteAccount(btn) {
    if (!delArmed) {
      btn.textContent = 'Tap again to delete for good';
      delArmed = setTimeout(function () { delArmed = null; btn.textContent = 'Delete my account and data'; }, 5000);
      return;
    }
    clearTimeout(delArmed); delArmed = null;
    try {
      var r = await sb.rpc('delete_my_account');
      if (r.error) throw r.error;
      await endSession();
      dropLocal(OWNER); clearShadow();          /* what stays on the phone can join a new account */
      msg(btn, 'Your account and its data were deleted. What is on this phone stays here until you clear it.');
      paint();
    } catch (e) {
      msg(btn, 'Could not delete: ' + (e.message || e), true);
    }
  }
  /* A (new) account is signed in on this phone. */
  function arrive(u) {
    var was = owner(), prof = readLocal(LS.prof);
    if (was && was !== u.id) {
      /* rule 4: this phone's progress belongs to another account. Start this
         one from its own server copy; only the language and theme carry
         over, as this phone's preference until the account says otherwise. */
      var keep = {};
      if (isObj(prof)) { if (prof.lang) keep.lang = prof.lang; if (prof.theme) keep.theme = prof.theme; }
      KEYS.forEach(dropLocal); clearShadow(); dirty = {};
      writeLocal(LS.prof, keep); setShadow(LS.prof, keep);
      if (window.App) App.reloadState();
    } else if (!was && isObj(prof) && prof.clearedAt) {
      /* a clear made before this phone ever synced is a local matter, not
         an instruction to wipe the account */
      delete prof.clearedAt; writeLocal(LS.prof, prof);
    }
    pulled = false; fails = 0; lastPush = 0;
    sync();
  }
  function seen(u) {
    var fresh = !!u && (!user || user.id !== u.id);
    var gone = !u && !!user && !leaving;
    user = u;
    if (gone) {                                /* the sign-in expired or was ended elsewhere */
      pulled = false; dirty = {};
      msg($('acct'), 'You were signed out (the sign-in expired). Everything is safe on this phone; sign in again to keep saving it to your account.', true);
    }
    paint();
    if (fresh) arrive(u);
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-auth]'); if (!b) return;
    var a = b.dataset.auth;
    if (a === 'email-toggle' || a === 'pw-toggle') {
      var row = $(b.dataset.target);
      if (row) { row.hidden = !row.hidden; var f = row.querySelector('input'); if (!row.hidden && f) f.focus(); }
      return;
    }
    if (a === 'signout') return void signOut(b);
    if (a === 'delete') return void deleteAccount(b);
    if (a === 'code') return void verifyCode(b);
    if (a === 'password') return void signInPassword(b);
    signIn(a, b);
  });
  /* Enter in the email, code or password field does what the button under it does. */
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter') return;
    var f = ev.target.closest && ev.target.closest('.field'); if (!f) return;
    var b = f.querySelector('[data-auth]'); if (b) { ev.preventDefault(); b.click(); }
  });

  /* --------------------------------------------------------- boot ---- */
  window.Sync = {
    touch: function (k) { if (user && KEYS.indexOf(k) >= 0) { dirty[k] = ++gen; schedule(); } },
    status: function () { return status; },
    user: function () { return user; },
    pull: sync, push: sync
  };

  loadSdk().then(function () {
    sb = window.supabase.createClient(cfg.supabaseUrl, KEY);
    status = 'idle';
    sb.auth.onAuthStateChange(function (event, session) { seen(session ? session.user : null); });
    sb.auth.getSession().then(function (r) { seen(r.data && r.data.session ? r.data.session.user : null); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { clearTimeout(timer); if (Object.keys(dirty).length) sync(); }
      else if (user) sync();
    });
    window.addEventListener('online', function () { if (user) { status = 'idle'; sync(); } paint(); });
    window.addEventListener('offline', function () { status = 'offline'; paint(); });
  }).catch(function () {
    /* No SDK (file missing, or blocked): stay the offline app, quietly. */
    status = 'off';
    document.dispatchEvent(new CustomEvent('lexicon:auth'));
  });
})();
