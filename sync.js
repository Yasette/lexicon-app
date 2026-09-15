/* Lexicon — accounts and cloud sync.
 *
 * Off by default: with no keys in config.js this file does nothing and the app
 * stays the offline app. With keys, it adds sign-in (email link or code, a
 * password for accounts that have one, plus Google / Apple when those
 * providers are turned on) and keeps a copy of the five progress keys in
 * Supabase, one row per key per person.
 *
 * The device stays the source of truth. The app calls Sync.touch(key) inside
 * save(); dirty keys are pushed a couple of seconds later. On sign-in we pull
 * what the server has, merge it per word / per day (so two devices never wipe
 * each other), write the merge locally, then push it back.
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

  var sb = null, user = null, dirty = {}, timer = null, busy = false, lastPush = 0;
  var status = 'off';                       /* off | offline | idle | saving | error */
  var pendingEmail = '';                    /* the address a code was sent to */

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
      var t = status === 'saving' ? 'Saving…'
        : status === 'offline' ? 'Offline — changes will sync when you are back online.'
        : status === 'error' ? 'Could not reach the server. Your progress is safe on this device.'
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

  /* --------------------------------------------------------- merge --- */
  function readLocal(k) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function writeLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function merge(key, local, remote) {
    if (local == null) return remote;
    if (remote == null) return local;
    var out, k;
    if (key === LS.srs) {                        /* per word: the later review wins */
      out = {};
      for (k in remote) out[k] = remote[k];
      for (k in local) out[k] = (!out[k] || (local[k].last || 0) >= (out[k].last || 0)) ? local[k] : out[k];
      return out;
    }
    if (key === LS.log) {                        /* per day: union names, never double count */
      out = {};
      for (k in remote) out[k] = remote[k];
      for (k in local) {
        if (!out[k]) { out[k] = local[k]; continue; }
        var a = local[k], b = out[k];
        out[k] = {
          right: Math.max(a.right || 0, b.right || 0), wrong: Math.max(a.wrong || 0, b.wrong || 0),
          qr: Math.max(a.qr || 0, b.qr || 0), qw: Math.max(a.qw || 0, b.qw || 0),
          missed: union(a.missed, b.missed), seen: union(a.seen, b.seen)
        };
      }
      return out;
    }
    if (key === LS.notes) {                      /* per day: keep what this device says, else remote */
      out = {};
      for (k in remote) out[k] = remote[k];
      for (k in local) if (local[k]) out[k] = local[k];
      return out;
    }
    if (key === LS.mine) {                       /* union by word */
      var have = {}; out = [];
      (local || []).concat(remote || []).forEach(function (row) {
        var n = String(row[0] || '').toLowerCase(); if (!n || have[n]) return; have[n] = 1; out.push(row);
      });
      return out;
    }
    if (key === LS.prof) {                       /* field by field, this device first */
      out = {};
      for (k in remote) out[k] = remote[k];
      for (k in local) if (local[k] !== '' && local[k] != null && local[k] !== false) out[k] = local[k];
      if (!local.goalSet && remote.goalSet) { out.goal = remote.goal; out.goalSet = true; }
      out.perfect = !!(local.perfect || remote.perfect);
      out.bestStreak = Math.max(local.bestStreak || 0, remote.bestStreak || 0);
      /* piles are unions: a word flagged on either phone stays flagged */
      if (local.idk || remote.idk) out.idk = union(local.idk, remote.idk);
      if (local.qmiss || remote.qmiss) out.qmiss = union(local.qmiss, remote.qmiss);
      if (local.miles || remote.miles) {
        out.miles = {};
        for (k in remote.miles || {}) out.miles[k] = remote.miles[k];
        for (k in local.miles || {}) if (!out.miles[k] || local.miles[k] < out.miles[k]) out.miles[k] = local.miles[k];
      }
      return out;
    }
    return local;
  }
  function union(a, b) {
    var out = [], seen = {};
    (a || []).concat(b || []).forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  /* --------------------------------------------------------- pull ---- */
  async function pull() {
    if (!user || busy) return;
    busy = true; status = 'saving'; paint();
    try {
      var res = await sb.from('user_data').select('key,value').eq('user_id', user.id);
      if (res.error) throw res.error;
      var remote = {}; (res.data || []).forEach(function (r) { remote[r.key] = r.value; });
      var changed = false, toPush = [];
      KEYS.forEach(function (k) {
        var local = readLocal(k), merged = merge(k, local, remote[k]);
        if (merged == null) return;
        if (!same(merged, local)) { writeLocal(k, merged); changed = true; }
        if (!same(merged, remote[k])) toPush.push(k);
      });
      if (changed && window.App) App.reloadState();
      toPush.forEach(function (k) { dirty[k] = 1; });
      status = 'idle';
      busy = false;
      await push();
    } catch (e) {
      status = navigator.onLine ? 'error' : 'offline';
    }
    busy = false; paint();
  }

  /* --------------------------------------------------------- push ---- */
  async function push() {
    if (!user || !sb) return;
    var keys = Object.keys(dirty); if (!keys.length) return;
    var rows = keys.map(function (k) { return { user_id: user.id, key: k, value: readLocal(k) || {}, updated_at: new Date().toISOString() }; });
    status = 'saving'; paint();
    try {
      var res = await sb.from('user_data').upsert(rows, { onConflict: 'user_id,key' });
      if (res.error) throw res.error;
      keys.forEach(function (k) { delete dirty[k]; });
      lastPush = Date.now(); status = 'idle';
    } catch (e) {
      status = navigator.onLine ? 'error' : 'offline';   /* keys stay dirty; we retry */
      setTimeout(schedule, 15000);
    }
    paint();
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () { if (!busy) push(); }, 2500);
  }

  /* --------------------------------------------------------- auth ---- */
  function here() { return location.href.split('#')[0].split('?')[0]; }
  function emailOf(btn) { var input = $(btn.dataset.email); return ((input && input.value) || pendingEmail || '').trim(); }
  async function signIn(provider, btn) {
    try {
      if (provider === 'email') {
        var email = emailOf(btn);
        if (!email || email.indexOf('@') < 0) { msg(btn, 'Type your email address first.', true); return; }
        /* One email, two ways in: the link signs you in where you tap it (the
           web app); the 6-digit code works anywhere, including the App Store
           build, where a link would open Safari instead of the app. */
        var r = await sb.auth.signInWithOtp({ email: email, options: { emailRedirectTo: here(), shouldCreateUser: true } });
        if (r.error) throw r.error;
        pendingEmail = email;
        var row = $(btn.dataset.coderow);
        if (row) { row.hidden = false; var code = row.querySelector('input'); if (code) { code.value = ''; code.focus(); } }
        msg(btn, 'Sent. Tap the link in the email, or type the code from it here. Nothing arrived? Check spam, and wait a minute before asking again.');
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
      msg(btn, 'Sign-in did not work: ' + (e.message || e), true);
    }
  }
  async function verifyCode(btn) {
    var email = emailOf(btn), code = ($(btn.dataset.code).value || '').replace(/\D/g, '');
    if (!email) { msg(btn, 'Type your email address first.', true); return; }
    if (code.length < 6) { msg(btn, 'Type the code from the email.', true); return; }
    try {
      var r = await sb.auth.verifyOtp({ email: email, token: code, type: 'email' });
      if (r.error) throw r.error;
      msg(btn, '');
    } catch (e) {
      msg(btn, 'That code did not work: ' + (e.message || e) + ' Ask for a new email and try again.', true);
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
      msg(btn, 'Sign-in did not work: ' + (e.message || e), true);
    }
  }
  async function signOut() {
    await push();
    await sb.auth.signOut();
    user = null; dirty = {}; paint();
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
      await sb.auth.signOut();
      user = null; dirty = {};
      msg(btn, 'Your account and its data were deleted. What is on this phone stays here until you clear it.');
      paint();
    } catch (e) {
      msg(btn, 'Could not delete: ' + (e.message || e), true);
    }
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-auth]'); if (!b) return;
    var a = b.dataset.auth;
    if (a === 'email-toggle' || a === 'pw-toggle') {
      var row = $(b.dataset.target);
      if (row) { row.hidden = !row.hidden; var f = row.querySelector('input'); if (!row.hidden && f) f.focus(); }
      return;
    }
    if (a === 'signout') return void signOut();
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
    touch: function (k) { if (user && KEYS.indexOf(k) >= 0) { dirty[k] = 1; schedule(); } },
    status: function () { return status; },
    user: function () { return user; },
    pull: pull, push: push
  };

  loadSdk().then(function () {
    sb = window.supabase.createClient(cfg.supabaseUrl, KEY);
    status = 'idle';
    sb.auth.onAuthStateChange(function (event, session) {
      var u = session ? session.user : null;
      var fresh = !!u && (!user || user.id !== u.id);
      user = u; paint();
      if (fresh) pull();
    });
    sb.auth.getSession().then(function (r) {
      var u = r.data && r.data.session ? r.data.session.user : null;
      var fresh = !!u && (!user || user.id !== u.id);
      user = u; paint();
      if (fresh) pull();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { clearTimeout(timer); push(); }
      else if (user && !busy) pull();
    });
    window.addEventListener('online', function () { if (user) { status = 'idle'; pull(); } paint(); });
    window.addEventListener('offline', function () { status = 'offline'; paint(); });
  }).catch(function () {
    /* No SDK (file missing, or blocked): stay the offline app, quietly. */
    status = 'off';
    document.dispatchEvent(new CustomEvent('lexicon:auth'));
  });
})();
