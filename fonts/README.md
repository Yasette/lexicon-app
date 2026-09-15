# Fonts

The four faces the app uses, served from here instead of Google Fonts so the
app works offline and in places where fonts.googleapis.com is blocked
(mainland China among them).

| family | designer | subsets shipped |
|---|---|---|
| Fraunces (display: titles, big numbers) | Undercase Type | latin, latin-ext |
| Newsreader (controls: chips, buttons) | Production Type | latin, latin-ext, vietnamese; upright + italic |
| Manrope (labels, captions) | Mikhail Sharanda | latin, latin-ext, vietnamese, cyrillic |
| Source Serif 4 (reading text) | Adobe | latin, latin-ext, vietnamese, cyrillic; upright + italic |

All four are licensed under the SIL Open Font License 1.1 (`OFL.txt`), which
allows bundling them in an app, free of charge, as long as the license text
travels with them. Do not rename the font files' internal names.

The files are the subsetted variable woff2 files that fonts.gstatic.com serves
(about 1.4 MB in total). Chinese, Japanese, Korean, Arabic and Devanagari text
falls back to the phone's system fonts on purpose; shipping those faces would
add tens of megabytes.

To regenerate (for example to add the Greek subset), fetch the Google Fonts CSS
with a modern browser user agent, download each `url(...)` you want to keep,
and rewrite `fonts.css` with local paths. The script that produced the current
set is in the project history (commit "fonts served locally").
