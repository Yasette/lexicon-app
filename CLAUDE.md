# Lexicon (lexicon-app) — notes for Claude

SAT Reading & Writing vocabulary app: ~1,083 words, spaced repetition, practice
questions in the test's format, guide sheets, meanings in 11 languages. This
public rewrite goes to the App Store; the personal original lives in `~/lexicon`
and is read-only reference. Owner: Yasemin (solo developer, student). About 30
users in China and Türkiye already; a backend (Supabase) holds progress.

## Hard rules

- **No test or dummy data in the app or the real database.** Fixtures and fake
  accounts exist only under `tests/` (the mock backend is injected by the test
  runner; nothing in the app references it). Never create users in the real
  Supabase project for testing; the owner creates the App Review account herself.
- The Supabase publishable key in `config.js` is public by design; Row Level
  Security protects data. Never put the service-role key, SMTP passwords or
  Google App Passwords anywhere in the repo or in chat.
- Vanilla JS, one `index.html`, no build step for the web app. Data lives in
  `data/*.js`. Keep it that way.
- Run `npm test` before every commit (data checks + 52 headless-Chrome checks;
  needs Node 22+ and Google Chrome). Add a check for every behaviour you add.
- Bump `CACHE` in `sw.js` when shipped files change.

## Commands

    node tools/serve.mjs        # http://localhost:3000 (the Supabase Site URL for local sign-in)
    npm test                    # node tests/data.test.mjs && node tests/ui/smoke.mjs
    npm run ios:sync            # rebuild www/ and copy into the Xcode project (before every archive)
    npm run ios:open            # open ios/App/App.xcodeproj
    npm run store:shots         # regenerate store/screenshots/ at Apple's sizes
    npm run smtp:check          # test a Gmail address + App Password on this Mac before Supabase gets them

## Where things are

- `index.html` all screens, styles and logic; CSS tokens per theme on `[data-theme]`.
- `sync.js` accounts + cloud sync (email code/link, password for accounts that have one,
  Google/Apple hidden until `authProviders` lists them); `native-auth.js` the phone-side
  bridge for Google/Apple (1.1); `config.js` deployment settings (`requireAccount`,
  `authProviders`, `contactEmail`, `appStoreId` for the review link, `nativeAuth`).
- `data/words.js` rows `[word, english, synonyms, turkish, example, note, band, related]`;
  `data/questions.js` (`g`/`g_tr` = meanings for options not in the list);
  `data/sheets.js`; `data/tricky.js`; `data/<lang>.js` glosses keyed by headword.
- `supabase/schema.sql` (tables, RLS, `delete_my_account`), `supabase/notify-signups.sql`.
- `ios/` Capacitor 8 project (SPM, iPhone only, bundle id `com.yasette.lexicon`);
  `www/` is its build input (git-ignored). `store/` App Store screenshots.
- `tests/` data checks, headless-Chrome smoke suite (`tests/ui`), the mock backend.
- `privacy.html` the privacy policy, `support.html` the help page (Support URL); both served by
  GitHub Pages from the repo root (`.nojekyll` keeps Pages from running Jekyll).

## Design taste (the owner's, keep it)

Paper-and-ink look: Fraunces for headings, Source Serif 4 for reading text and
meanings, Newsreader for chips and buttons, Manrope only for small labels.
Meanings and explanations are set in the serif, not the sans (she finds the sans
too thin). No framed pills for filters (a filled pill only on the active chip;
outlined-no-fill on Practice). No frame on the verdict. Answers grade green/red
with a small rise animation. Word list reads like lined paper; search in one box;
filters live in a sheet behind an underlined "Filter". Subtitles under headings
stay short. Unearned milestones are grey. The name is used only for the home greeting.
Grading colours are semantic, never the theme accent: a wrong pick, “Incorrect” and wrong
dots use `--bad`/`--badsoft` (red in every theme), the answer uses `--sage` (green). After
any answer every choice is explained (word, meaning, gloss) below Next.

## State (25 September 2026)

Branch `polish/audit-2026-09` is merged into `main` and pushed. The repo is
public and GitHub Pages serves `main` from the root: `privacy.html` and
`support.html` are the store listing's Privacy Policy and Support URLs (the
in-app Privacy link opens the former). All tests pass (data, 4 SMTP-checker,
54 browser checks) and a Release build for a real iPhone compiles.
Accounts required at first run; sign-in emails work (the Lexicon Gmail
account via SMTP); the App Review account (password sign-in) exists.
Apple Developer account: a parent's, Individual, team F34V6LU6Y6, agreements
accepted, signed in to Xcode and set as DEVELOPMENT_TEAM in the project.
Never accept or handle that Apple ID's password; the owner or the parent
types it into Apple's own sign-in boxes. Next: App Store Connect record,
archive + upload, listing, TestFlight, submission, all in the "Lexicon Launch
Runbook" artifact. Google/Apple sign-in in 1.1; native-speaker review of the
ten machine-drafted gloss languages.
