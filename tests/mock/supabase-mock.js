/* In-memory stand-in for the Supabase JS client, used ONLY by tests/ui/smoke.mjs.
 * It is injected into the page by the test runner before any app script runs;
 * nothing in the app references this file. It pins window.LEXICON_CONFIG so
 * config.js cannot override the mock settings, and it provides just enough of
 * the client for sync.js: auth (session + OTP + OAuth stubs), from().select/upsert
 * and rpc(). Everything lives in memory and is thrown away with the page.
 *
 * __mock.hooks lets a test make the fake server misbehave: failSelect (how
 * many selects fail next), slowSelect (ms), failUpsert, slowUpsert (ms), otpError (returned by
 * signInWithOtp). Rows are kept per account so account switching can be tested.
 */
(function () {
  var cfg = { supabaseUrl: 'https://mock.local', supabaseKey: 'mock-key', supabaseSdkUrl: 'about:blank', authProviders: ['email', 'google'], requireAccount: true, contactEmail: 'help' + '@' + 'mock.local', appStoreId: '1234567890', privacyUrl: 'https://mock.local/privacy.html' };
  Object.defineProperty(window, 'LEXICON_CONFIG', { get: function () { return cfg; }, set: function () {}, configurable: true });

  var store = {};          /* account id -> key -> value */
  var user = null, listeners = [], calls = { upsert: 0, select: 0, otpCount: 0, rpc: [] };
  var hooks = { failSelect: 0, slowSelect: 0, failUpsert: false, slowUpsert: 0, otpError: null };
  var FAKE_USER = { id: 'user-0000-mock', email: 'tester' + '@' + 'mock.local', user_metadata: { full_name: 'Test Person' } };

  function rowsOf(uid) { return store[uid] || (store[uid] = {}); }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function ok(data) { return Promise.resolve({ data: data, error: null }); }
  function ok0(err) { return Promise.resolve({ data: null, error: err }); }
  function fire(event) { listeners.forEach(function (fn) { fn(event, user ? { user: user } : null); }); }

  window.supabase = {
    createClient: function () {
      return {
        auth: {
          getSession: function () { return ok({ session: user ? { user: user } : null }); },
          onAuthStateChange: function (fn) { listeners.push(fn); return { data: { subscription: { unsubscribe: function () {} } } }; },
          signInWithOtp: function (o) { calls.otp = o; calls.otpCount++; if (hooks.otpError) return ok0(hooks.otpError); return ok({}); },
          signInWithPassword: function (o) { calls.password = o; if (o.password !== 'correct-horse') return ok0({ message: 'Invalid login credentials' }); user = FAKE_USER; fire('SIGNED_IN'); return ok({ session: { user: user } }); },
          verifyOtp: function (o) { calls.verify = o; if (String(o.token) !== '123456') return ok0({ message: 'Token has expired or is invalid' }); user = FAKE_USER; fire('SIGNED_IN'); return ok({ session: { user: user } }); },
          signInWithOAuth: function (o) { calls.oauth = o; return ok({}); },
          signInWithIdToken: function () { return ok({}); },
          signOut: function (o) { calls.signOut = o || null; user = null; fire('SIGNED_OUT'); return ok({}); }
        },
        from: function (table) {
          return {
            select: function () { calls.select++; return { eq: function (col, uid) {
              if (hooks.failSelect > 0) { hooks.failSelect--; return ok0({ message: 'Load failed' }); }
              var reply = function () { var r = rowsOf(uid); return { data: Object.keys(r).map(function (k) { return { key: k, value: copy(r[k]) }; }), error: null }; };
              if (hooks.slowSelect) return new Promise(function (res) { setTimeout(function () { res(reply()); }, hooks.slowSelect); });
              return Promise.resolve(reply()); } }; },
            upsert: function (list) {
              calls.upsert++;
              if (hooks.failUpsert) return ok0({ message: 'Load failed' });
              var apply = function () { list.forEach(function (r) { rowsOf(r.user_id)[r.key] = copy(r.value); }); };
              if (hooks.slowUpsert) return new Promise(function (res) { setTimeout(function () { apply(); res({ data: null, error: null }); }, hooks.slowUpsert); });
              apply(); return ok({});
            }
          };
        },
        rpc: function (name) { calls.rpc.push(name); if (name === 'delete_my_account' && user) { delete store[user.id]; } return ok({}); }
      };
    }
  };

  /* Test hooks: sign the fake person in, seed server rows, inspect calls. */
  window.__mock = {
    cfg: cfg, hooks: hooks,
    signIn: function () { user = FAKE_USER; fire('SIGNED_IN'); },
    signInAs: function (id) { user = { id: id, email: id + '@' + 'mock.local', user_metadata: {} }; fire('SIGNED_IN'); },
    expire: function () { user = null; fire('SIGNED_OUT'); },
    seed: function (k, v, uid) { rowsOf(uid || FAKE_USER.id)[k] = copy(v); },
    rows: function (uid) { return copy(rowsOf(uid || FAKE_USER.id)); },
    calls: function () { return copy(calls); }
  };
})();
