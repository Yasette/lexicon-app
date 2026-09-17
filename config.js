/* Lexicon — deployment settings.
 *
 * Safe to commit: the publishable key is public by design (it is the key the
 * app ships with). What keeps one person's progress private from another is
 * Row Level Security on the tables (see supabase/schema.sql), not this key.
 *
 * Leave supabaseUrl and supabaseKey empty and the app is exactly the offline
 * app: no accounts, no network, everything in localStorage.
 */
window.LEXICON_CONFIG = {
  supabaseUrl: 'https://qrwageniybszujdteemp.supabase.co',

  /* Project settings → API keys → Publishable key (sb_publishable_…).
     supabase-js 2.116 accepts this new format directly; the legacy "anon"
     JWT would also work here, but Supabase is retiring it. */
  supabaseKey: 'sb_publishable_zwsHuPtYkMzmx5llRD2XAg_YyG6WITP',

  /* The Supabase JS client, bundled with the app so nothing loads from a
     CDN (slow or blocked in mainland China). vendor/supabase.js is the UMD
     build of @supabase/supabase-js 2.116.0 (MIT). */
  supabaseSdkUrl: 'vendor/supabase.js',

  /* Shown in Settings → Reach us (a mail link) and on the privacy page. */
  contactEmail: 'lexicon.yaso@gmail.com',

  /* Version 1 asks every new user to sign in on the welcome screen, so their
     progress lives in the database from day one. false turns that into an
     offer: Start works without an account and Settings still has sign-in. */
  requireAccount: true,

  /* Sign-in methods to show. 'email' sends a one-time link and code and
     needs nothing beyond the Email provider (plus custom SMTP, so the
     template can show the code). Add 'google' and 'apple' in 1.1, after the
     providers are on in Supabase (Authentication → Providers) — a button for
     a provider that is off just fails. */
  authProviders: ['email'],

  /* 1.1 only: what the native sign-in plugin needs (see native-auth.js).
     googleIosClientId  = the iOS OAuth client from Google Cloud Console
     googleWebClientId  = the Web client that Supabase's Google provider uses
     appleClientId      = the app's bundle id for Sign in with Apple */
  nativeAuth: { googleIosClientId: '', googleWebClientId: '', appleClientId: 'com.yasette.lexicon' }
};
