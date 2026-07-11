# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Quotelink (working title) — the 2026 rewrite of SavePublishing.com as a Manifest V3 browser extension (Chrome and Firefox) in plain TypeScript. Click the toolbar button on any article: sentences worth quoting light up, click one to share it with a `#:~:text=` deep link that highlights the exact sentence for whoever follows it. This is the actively developed artifact — see `PLAN.md` for the full design and roadmap.

The original SavePublishing bookmarklet (CoffeeScript, `htdocs/coffee/`) is retired. It's kept in the repo for history but is frozen, not developed against.

## Build

The extension lives in `extension/`, plain TypeScript bundled with esbuild:

```bash
cd extension
npm install
npm run build      # bundles background.ts + content.ts into dist/
npm test           # vitest: unit + fixture-page regression tests
npm run typecheck
```

See `extension/README.md` for loading the built extension unpacked in Chrome or as a temporary add-on in Firefox, and the manual QA script to run after any change.

### Legacy: the CoffeeScript bookmarklet

`htdocs/coffee/src/` is the old bookmarklet's source, frozen. Building it requires the `coffee` compiler (and `docco` for docs):

```bash
cd htdocs/coffee
cake build   # concatenates src files → savepublishing.coffee → compiles to ../js/lib/savepublishing.js
cake docs    # regenerates docco docs
```

The file list and concatenation order are hardcoded in `htdocs/coffee/Cakefile` (`appFiles`): init → document → array → node → string → run. Order matters — `init.coffee` defines the globals (`DEBUG`, `JQ`, `MAX_STRING_LENGTH`, element lists, etc.) everything else uses, and `run.coffee` kicks off execution.

`htdocs/js/lib/savepublishing.js` is generated output — edit the `.coffee` sources, not the JS, if this legacy code is ever touched at all.

## Testing

`extension/test/` is a vitest suite (jsdom environment): unit tests per module (`classify.ts`, `segment.ts`, `walk.ts`, `ranges.ts`, `fragment.ts`, `targets.ts`, `overlay.ts`) plus fixture-page regression tests — real saved pages under `extension/test/fixtures/` run through the extraction pipeline, asserting known narrative sentences survive, known chrome/nav/paywall text is dropped, and the sentence count stays within pinned bounds (tripwires, not exact specs). Run with `npm test` from `extension/`.

The legacy bookmarklet has no automated tests. Its testing was manual: `htdocs/test/tests.html` (and saved copies of real pages like `nyt.html`, `mefi.html`) loading `js/lib/savepublishing.js` against sample markup, served via the nginx configs in `local/etc/nginx/`.

## Architecture

```
extension/
  manifest.json          MV3: action + activeTab/scripting/storage permissions,
                          browser_specific_settings for Firefox
  src/
    background.ts         service worker: action click → ping-or-inject content script
    content.ts             entry point: run extraction, decorate page, toolbar
    browserAPI.ts           prefers Firefox's Promise-native `browser.*` over
                            `chrome.*`; no polyfill needed
    extract/
      classify.ts          DOM classification: isNavLike, isLinkish, link-ratio,
                            TEXTISH/IRRELEVANT element lists — ported from the
                            bookmarklet's node.coffee predicates
      walk.ts               TreeWalker traversal yielding narrative text runs,
                            non-destructively (wraps ranges, never mutates the page)
      segment.ts            sentence splitting via Intl.Segmenter
      ranges.ts              maps extracted sentences onto DOM Ranges
    share/
      fragment.ts           builds #:~:text= deep links
      targets.ts             navigator.share() + fallback menu (X, Bluesky,
                              Mastodon, Threads, copy)
    ui/
      toolbar.ts             the fixed toolbar widget, in a Shadow DOM
      overlay.ts              page decoration (sentence spans) + teardown
  test/
    fixtures/               saved real pages for regression tests
    *.test.ts               vitest + jsdom
```

The extraction heuristics (link-ratio scoring, nav-classname detection, the classify/walk/segment split) are the original CoffeeScript bookmarklet's, ported as pure, tested functions rather than prototype extensions.

### Legacy: the bookmarklet's architecture

The bookmarklet chain: `htdocs/js/bookmarklet.js` (a `javascript:` one-liner, plain JS) loads jQuery, Twitter widgets, jQuery UI, and then `savepublishing.js` from savepublishing.com, assigning jQuery to the `window.JQ` global that all the CoffeeScript code uses (never bare `$`, to avoid clobbering the host page).

The core technique was monkey-patching prototypes of built-in classes — the app was organized by which class got extended:

- `init.coffee` — globals and config: `SHORTENABLE_WORDS`, element classification lists, `MAX_STRING_LENGTH` (117 chars, leaving room for URL + ellipsis in a 140-char tweet), and the `debug()` helper gated by `DEBUG`.
- `node.coffee` — `Node::` predicates for DOM classification and the recursive `unwrap()` traversal that decides what's narrative text vs. nav/ads.
- `string.coffee` — `String::` text munging: sentence splitting (`getStatements`), word abbreviation, entity escaping, `enTweeten` (wraps a sentence as a tweet link).
- `array.coffee` — `Array::merge` collapses adjacent text nodes into tweetable spans.
- `document.coffee` / `run.coffee` — `Document::` methods: injects styles and the fixed toolbar widget, then `document.run()` drives the whole pass.

## Other pieces

- `htdocs/index.html`, `credits.html`, `button.html` — the static site (legacy; the extension has no landing page yet).
- `htdocs/socialpull/` — stub, essentially empty.
