# Tests

Everything test-related lives here and nowhere else. The app (`index.html`,
`sync.js`, `data/`) never references this folder, and nothing in here is ever
served to a real person or written to the real database.

| command | what it does |
|---|---|
| `node tests/data.test.mjs` | checks the word list, question bank, sheets and Chinese glosses for shape, duplicates, missing fields and language mix-ups |
| `node tests/smtp-check.test.mjs` | checks `tools/smtp-check.mjs` against a fake mail server on this Mac (STARTTLS with a throwaway certificate, Gmail’s real refusal texts); nothing reaches Gmail |
| `node tests/ui/smoke.mjs` | starts a local server, drives the real app in headless Chrome, asserts on behaviour (first run, sessions, logging, escaping, settings, migration, the Don’t-know pile, drills, paste-anything adding, tall and short phone layouts) and on sign-in (email code) and sync against an in-memory fake backend (including a server that fails, a push in flight, account switching, deletions and Clear my progress across phones, junk rows, order-insensitive equality, mid-session guards) — 52 checks |

Needs Node 22+ and Google Chrome installed (`CHROME=/path/to/chrome` to override).

`tests/mock/supabase-mock.js` is a stand-in for the Supabase client. The runner
injects it into the page before any app script runs; it pins `LEXICON_CONFIG`
so `config.js` cannot switch it off. The fake person and fake rows it creates
exist only in that browser tab.
