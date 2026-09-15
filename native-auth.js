/* Lexicon — native sign-in bridge for the App Store build (version 1.1).
 *
 * Inside the phone app a browser redirect cannot come back, so Google and
 * Apple sign-in must go through a native plugin that hands us an id token;
 * sync.js then passes that token to Supabase (signInWithIdToken).
 *
 * This file does nothing until all of the following are true:
 *   1. the app runs inside Capacitor (the App Store build), and
 *   2. the plugin is installed:  npm i @capgo/capacitor-social-login && npx cap sync ios
 *   3. config.js lists 'google' and/or 'apple' in authProviders and fills nativeAuth.
 * Until then the buttons stay hidden and nothing here runs.
 *
 * Check the call shapes against the plugin's README at install time; the
 * plugin's API is the one thing here that is not under our control.
 */
(function () {
  'use strict';
  var cfg = window.LEXICON_CONFIG || {}, na = cfg.nativeAuth || {};
  var cap = window.Capacitor;
  if (!cap || !cap.Plugins || !cap.Plugins.SocialLogin) return;
  var Social = cap.Plugins.SocialLogin, ready = null;

  function init() {
    if (!ready) {
      var opts = {};
      if (na.googleIosClientId) opts.google = { iOSClientId: na.googleIosClientId, webClientId: na.googleWebClientId || undefined, mode: 'online' };
      if (na.appleClientId) opts.apple = { clientId: na.appleClientId };
      ready = Social.initialize(opts);
    }
    return ready;
  }
  async function sha256Hex(s) {
    var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }

  /* sync.js awaits this and expects { idToken, nonce }. Apple wants the
     SHA-256 of a nonce in the request and Supabase wants the raw nonce back,
     so both are produced here. Google needs no nonce. */
  window.LexiconNativeAuth = async function (provider) {
    await init();
    if (provider === 'apple') {
      var raw = crypto.randomUUID(), hashed = await sha256Hex(raw);
      var a = await Social.login({ provider: 'apple', options: { scopes: ['email', 'name'], nonce: hashed } });
      return { idToken: a.result.idToken, nonce: raw };
    }
    var g = await Social.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
    return { idToken: g.result.idToken };
  };
})();
