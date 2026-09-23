# Lexicon (app)

The public Lexicon: SAT Reading & Writing vocabulary with spaced repetition,
SAT-style practice questions and grammar sheets, with meanings in the
learner's own language. This is the repo that goes to the App Store and Play
Store. The personal site it was seeded from, `Yasette/lexicon`, stays as it is.

| | `Yasette/lexicon` | `Yasette/lexicon-app` |
|---|---|---|
| audience | me + friends | everybody |
| grouping | study weeks (W1–W21) | frequency / difficulty |
| meanings | English + Turkish | English + your language (12 to choose from) |
| first run | none | language pick, optional sign-in |
| progress | this device only | this device, or synced to an account |
| published | GitHub Pages | App Store + Play Store |

## Files

```
index.html          the app: markup, styles, all screens and logic (no build step)
data/words.js       1,083 words — one row per line: [word, english, synonyms, turkish, example, note, band, related]
data/questions.js   practice bank; ex = English explanation, ex_tr = Turkish
data/sheets.js      the Guide sheets
data/tricky.js      the tricky-word drills (rhetorical verbs, second meanings, curveballs)
data/<lang>.js      glosses keyed by headword: zh-Hans, zh-Hant, ko, ja, es, pt, vi, ar, ru, hi
fonts/              the four typefaces, served locally (see fonts/README.md)
vendor/supabase.js  the Supabase client, bundled (no CDN)
config.js           backend URL + publishable key (empty = offline app, no accounts)
native-auth.js      Google/Apple inside the phone app (1.1); idle until its plugin is installed
sync.js             accounts + cloud sync; does nothing until config.js has keys
sw.js               service worker: offline copy, network-first
privacy.html        the privacy policy the App Store listing links to
supabase/schema.sql database tables, Row Level Security, account deletion
tools/              serve.mjs (local server), build-www.mjs (copies the app into www/ for iOS)
ios/                the Xcode project (Capacitor, iPhone only); www/ is its build input, ignored by git
store/              App Store screenshots at Apple's sizes (node tools/store-shots.mjs)
tests/              data checks, headless-Chrome smoke test, fake backend (never shipped)
```

Run it locally with `node tools/serve.mjs` and open `http://localhost:3000/`.
Run the tests with `npm test` (or `node tests/data.test.mjs` and
`node tests/ui/smoke.mjs`; needs Node 22+ and Google Chrome).

## How progress is stored

Five keys in `localStorage`, mirrored to the server when someone is signed in:

| key | holds |
|---|---|
| `lexicon.srs.v2` | per word (lower-cased headword): Leitner box, right/wrong counts, streak, last seen |
| `lexicon.log.v2` | per day: right, wrong, words seen, words missed |
| `lexicon.profile.v1` | name, test date, weekly goal, language, theme, best streak |
| `lexicon.notes.v1` | per-day notes from the progress screen |
| `lexicon.mine.v1` | words the person added |

Progress is keyed by the word, never by the row number, so `data/words.js` can be
edited freely. (`lexicon.srs.v1`, keyed by row, is converted on first load.)

Two more keys are sync bookkeeping, never shown: `lexicon.sync.owner.v1` (the
account this phone's progress was last pushed to) and `lexicon.sync.shadow.v1`
(per key, the copy the phone and the server last agreed on, which is what lets
a deletion on one phone reach the other).

Practice answers are logged per day as `qr` / `qw` (kept apart from word
reviews), so they count for the streak and the trail without touching the word
statistics. The profile also holds `qmiss` (missed question ids, until answered
right), `idk` (words flagged “I don’t know this word”, until answered right
twice in a row or unflagged), `miles` (the day each milestone was earned) and
`celebrated` (the last day the streak confetti ran).

## Languages

Meanings can be shown in Turkish, Simplified and Traditional Chinese, Korean,
Japanese, Spanish, Portuguese, Vietnamese, Arabic, Russian and Hindi. Turkish
was written by hand; the other ten were machine-drafted in the same short,
SAT-oriented style and read through once. Each is one line per word, so a
native speaker can review a whole language in about an hour; please do that
before you advertise a language.

## Adding a language

1. Copy `data/ko.js` to `data/<code>.js`, change the `GLOSS["ko"]` key to your
   code and fill in the glosses (keys are the exact headwords in `data/words.js`).
2. Add a `<script src="data/<code>.js">` tag next to the others in `index.html`.
3. Add the language to `LANGS` in `index.html` (id, name in that language, one sample line).
4. Optional: add `ex_<code>` to questions in `data/questions.js` for translated explanations.
5. Add `./data/<code>.js` to `PRECACHE` in `sw.js` and bump `CACHE`.

`node tests/data.test.mjs` tells you which headwords are still missing a gloss.

## Accounts and sync (Supabase)

The project is set up and its URL and publishable key are in `config.js`
(safe to commit: the key is public by design, Row Level Security keeps each
person's rows private). `supabase/schema.sql` has been run. Sign-in is by
email only for now: one email carries a link (signs you in where you tap it —
fine for the web app) and a 6-digit code (works anywhere, including the App
Store build, where a link would open Safari instead of the app).

Four rules keep the account copy safe (the header of `sync.js` has the
detail): nothing is pushed until the server copy has been pulled and merged
once, so a new phone can never overwrite an account with its own empty copy;
a push clears only the dirty flags it actually sent; merges are three-way
against the last agreed copy, so removed words, cleared notes and "Clear my
progress" stick across phones while anything new survives; and a different
account signing in on the same phone starts from its own server copy instead
of absorbing the previous person's progress.

Version 1 asks every new user to sign in on the welcome screen (Start waits
for it), so progress lives in the database from day one; `requireAccount:
false` in `config.js` turns that into an offer. Accounts that have a password
can also sign in with it (“Have a password? Sign in with it” under the email
field): that is the way in for App Review, with an account you create in
Supabase → Authentication → Users → Add user (email, password, Auto Confirm).

Things to keep in mind:

- **Custom SMTP first.** Supabase does not let you edit the email templates
  until custom SMTP is configured, and the templates are what put the code in
  the email. So SMTP is step one, not a later polish.
- **Email templates.** In Authentication → Email Templates, both *Magic Link*
  and *Confirm signup* must include `{{ .Token }}` so the email shows the code
  as well as the link. Without it the App Store build has no way in.
- **Redirect URLs.** Authentication → URL Configuration: the Site URL is where
  the link lands. `http://localhost:3000` (the default) works with
  `node tools/serve.mjs`; add the GitHub Pages address of the app for the web
  version.
- **Google / Apple** (version 1.1) stay off until turned on in
  Authentication → Providers; then add them to `authProviders` in `config.js`,
  install the native plugin (`npm i @capgo/capacitor-social-login`, then
  `npx cap sync ios`) and fill `nativeAuth` in `config.js`; `native-auth.js`
  hands the id token to Supabase. Mainland China cannot reach Google, so email
  must always remain. Offering Google makes Sign in with Apple mandatory
  (guideline 4.8); email-only does not.
- The Supabase client is bundled in `vendor/supabase.js` (2.116.0, MIT).
  Nothing loads from a CDN.

Try it locally:

```bash
node tools/serve.mjs          # http://localhost:3000
```

## Shipping to the App Store

The iOS project exists: `ios/` (Capacitor 8, Swift Package Manager, no
CocoaPods). The web app stays at the repo root; `www/` is a build product.

```bash
npm install                   # once
npm run ios:sync              # rebuild www/ and copy it into the Xcode project
npm run ios:open              # opens ios/App/App.xcodeproj in Xcode
```

In Xcode: select the App target → Signing & Capabilities → pick your Team,
keep the bundle id `com.yasette.lexicon` (or change it, then also in
`capacitor.config.json`), then Product → Archive → Distribute App.

The project already has: your icon (from `icon-1024.png`), a paper-coloured
launch screen, portrait only, `ITSAppUsesNonExemptEncryption = NO` (the app
only uses HTTPS, so the export-compliance question is answered up front), and
the page keeps below the status bar with the theme colour behind it
(`viewport-fit=cover` + `env(safe-area-inset-top)`).

Checklist Apple will hold you to:

- **Apple Developer Program** membership (enrolment can take a day or two).
- **Account deletion inside the app** (guideline 5.1.1(v)) — Settings has it;
  `delete_my_account()` in the schema does the work.
- A **privacy policy URL**: `privacy.html` is in the repo, so on GitHub Pages
  it is at `https://yasette.github.io/lexicon-app/privacy.html`. Put a contact
  address in it first (search for `CONTACT-EMAIL`).
- App Privacy questionnaire: data collected = email address (account), user
  content (progress). Not used for tracking.
- Screenshots for the 6.9" iPhone size (and 6.5"), a description, keywords,
  a support URL.
- Bump `CACHE` in `sw.js` on every web release; `npm run ios:sync` before
  every archive.

## Reach us, a review link, and an email for every new account

`contactEmail` in `config.js` puts a “Reach us” mail link in Settings and the
same address on the privacy page. `appStoreId` (the numeric Apple ID from
App Store Connect → App Information) adds “Let us know what you think about
this app” above Clear my progress, a link straight to the App Store's
write-a-review page; leave it empty and the panel stays hidden. To get an email yourself whenever someone
creates an account, see `supabase/notify-signups.sql` and
`tools/signup-mailer.gs` (a Google Apps Script that mails the account it is
deployed from; the SQL adds a trigger that calls it through pg_net). The
runbook has the click-by-click version.

## Freemium later

`profiles.plan` / `plan_until` in the schema are reserved for it and can only be
changed by the server (never by the app), so paid content can be gated by a
single column when the time comes. Nothing in the app reads them yet.
