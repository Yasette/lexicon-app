/* In-memory stand-in for the Supabase JS client, used ONLY by tests/ui/smoke.mjs.
 * It is injected into the page by the test runner before any app script runs;
 * nothing in the app references this file. It pins window.LEXICON_CONFIG so
 * config.js cannot override the mock settings, and it provides just enough of
 * the client for sync.js: auth (session + OTP + OAuth stubs), from().select/upsert
 * and rpc(). Everything lives in memory and is thrown away with the page.
 */
(function () {
  var cfg = { supabaseUrl: 'https://mock.local', supabaseKey: 'mock-key', supabaseSdkUrl: 'about:blank', authProviders: ['email', 'google'], requireAccount: true, contactEmail: 'help' + '@' + 'mock.local' };
  Object.defineProperty(window, 'LEXICON_CONFIG', { get: function () { return cfg; }, set: function () {}, configurable: true });

  var rows = {};          /* key -> value, for the single fake person */
  var user = null, listeners = [], calls = { upsert: 0, select: 0, rpc: [] };
  var FAKE_USER = { id: 'user-0000-mock', email: 'tester' + '@' + 'mock.local', user_metadata: { full_name: 'Test Person' } };

  function ok(data) { return Promise.resolve({ data: data, error: null }); }
  function ok0(err) { return Promise.resolve({ data: null, error: err }); }
  function fire(event) { listeners.forEach(function (fn) { fn(event, user ? { user: user } : null); }); }

  window.supabase = {
    createClient: function () {
      return {
        auth: {
          getSession: function () { return ok({ session: user ? { user: user } : null }); },
          onAuthStateChange: function (fn) { listeners.push(fn); return { data: { subscription: { unsubscribe: function () {} } } }; },
          signInWithOtp: function (o) { calls.otp = o; return ok({}); },
          signInWithPassword: function (o) { calls.password = o; if (o.password !== 'correct-horse') return ok0({ message: 'Invalid login credentials' }); user = FAKE_USER; fire('SIGNED_IN'); return ok({ session: { user: user } }); },
          verifyOtp: function (o) { calls.verify = o; if (String(o.token) !== '123456') return ok0({ message: 'Token has expired or is invalid' }); user = FAKE_USER; fire('SIGNED_IN'); return ok({ session: { user: user } }); },
          signInWithOAuth: function (o) { calls.oauth = o; return ok({}); },
          signInWithIdToken: function () { return ok({}); },
          signOut: function () { user = null; fire('SIGNED_OUT'); return ok({}); }
        },
        from: function (table) {
          return {
            select: function () { calls.select++; return { eq: function () {
              return ok(Object.keys(rows).map(function (k) { return { key: k, value: rows[k] }; })); } }; },
            upsert: function (list) { calls.upsert++; list.forEach(function (r) { rows[r.key] = r.value; }); return ok({}); }
          };
        },
        rpc: function (name) { calls.rpc.push(name); if (name === 'delete_my_account') { rows = {}; } return ok({}); }
      };
    }
  };

  /* Test hooks: sign the fake person in, seed server rows, inspect calls. */
  window.__mock = {
    cfg: cfg,
    signIn: function () { user = FAKE_USER; fire('SIGNED_IN'); },
    seed: function (k, v) { rows[k] = v; },
    rows: function () { return JSON.parse(JSON.stringify(rows)); },
    calls: function () { return JSON.parse(JSON.stringify(calls)); }
  };
})();
