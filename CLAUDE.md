# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SavePublishing.com — a bookmarklet (plus a thin Chrome extension wrapper) that scans the current page's DOM, finds sentences short enough to tweet, and turns them into Twitter web-intent links. Everything runs client-side. The repo contains the full deployable site.

## Build

The source is CoffeeScript in `htdocs/coffee/src/`. Building requires the `coffee` compiler (and `docco` for docs):

```bash
cd htdocs/coffee
cake build   # concatenates src files → savepublishing.coffee → compiles to ../js/lib/savepublishing.js
cake docs    # regenerates docco docs
```

The file list and concatenation order are hardcoded in `htdocs/coffee/Cakefile` (`appFiles`): init → document → array → node → string → run. Order matters — `init.coffee` defines the globals (`DEBUG`, `JQ`, `MAX_STRING_LENGTH`, element lists, etc.) everything else uses, and `run.coffee` kicks off execution. If you add a source file, add it to `appFiles`.

`htdocs/js/lib/savepublishing.js` is generated output — edit the `.coffee` sources, not the JS.

## Testing

There is no automated test suite. Testing is manual: `htdocs/test/tests.html` (and `oldtests.html`, plus saved copies of real pages like `nyt.html`, `mefi.html`) load `js/lib/savepublishing.js` directly against sample markup. Serve `htdocs/` (nginx configs in `local/etc/nginx/`, launcher in `local/bin/nginx.sh`), rebuild, and reload the test page. QUnit resources exist under `htdocs/test/qunit/` but are effectively unused.

## Architecture

The bookmarklet chain: `htdocs/js/bookmarklet.js` (a `javascript:` one-liner, plain JS) loads jQuery, Twitter widgets, jQuery UI, and then `savepublishing.js` from savepublishing.com, assigning jQuery to the `window.JQ` global that all the CoffeeScript code uses (never bare `$`, to avoid clobbering the host page).

The core technique is monkey-patching prototypes of built-in classes — the app is organized by which class gets extended:

- `init.coffee` — globals and config: `SHORTENABLE_WORDS`, element classification lists (`TEXTISH_ELEMENTS`, `IRRELEVANT_ELEMENTS`, `NAV_CONTAINING_ELEMENTS`), `MAX_STRING_LENGTH` (117 chars, leaving room for URL + ellipsis in a 140-char tweet), and the `debug()` helper gated by `DEBUG`.
- `node.coffee` — `Node::` predicates for DOM classification (`isTextish`, `isNavLike`, `isIrrelevant`, …) and the recursive `unwrap()` traversal that decides what's narrative text vs. nav/ads.
- `string.coffee` — `String::` text munging: sentence splitting (`getStatements`), word abbreviation, entity escaping, `enTweeten` (wraps a sentence as a tweet link).
- `array.coffee` — `Array::merge` collapses adjacent text nodes into tweetable spans.
- `document.coffee` / `run.coffee` — `Document::` methods: injects styles and the fixed toolbar widget, then `document.run()` drives the whole pass.

Each source file sets a `SECTION` variable used in debug output to trace which concatenated file a message came from.

Other pieces:

- `chrome/savepublishing/` — minimal Chrome extension that just invokes the bookmarklet; it requires a copy of the built `savepublishing.js` manually placed in that directory. `savepublishing.js` there is a stale compiled copy — the canonical source is `htdocs/coffee/src/`.
- `htdocs/index.html`, `credits.html`, `button.html` — the static site.
- `htdocs/socialpull/` — stub, essentially empty.
