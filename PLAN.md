# SavePublishing 2026 Revival Plan

Bring the 2012 bookmarklet into the modern web: same soul (click a sentence
in any article, share it with attribution), rebuilt as a Manifest V3 browser
extension in plain TypeScript, sharing via the Web Share API and URL text
fragments instead of Twitter intents.

## Guiding decisions

- **MV3 extension is the primary artifact.** CSP and remote-code rules killed
  the script-injection bookmarklet; content scripts run in an isolated world,
  which also eliminates the `window.JQ` / prototype-pollution problem the old
  code worked around.
- **No frameworks, no build-time dependencies beyond esbuild + TypeScript.**
  Everything jQuery did here is now trivial vanilla DOM.
- **Delete, don't port, where the platform caught up:**
  - `getStatements()` (string.coffee) → `Intl.Segmenter('en', {granularity: 'sentence'})`
  - Twitter intent URLs → `navigator.share()` + a fallback chooser
    (X, Bluesky `bsky.app/intent/compose`, Mastodon, copy-to-clipboard)
  - Shared URL → append `#:~:text=` text fragment so the link highlights
    the exact quoted sentence on arrival
- **Keep the original heuristics as the extraction engine** (they're the
  interesting IP): link-ratio scoring, nav-classname detection, element
  classification, the unwrap/merge traversal. Port them as pure functions,
  not prototype extensions.
- **Character limit becomes soft.** No hard 117-char cutoff; show length,
  let long selections through (X is 280+, Bluesky 300, Mastodon 500).
  `SHORTENABLE_WORDS` ("gr8", "th@") is retired to an easter-egg
  "2012 mode" toggle.

## New layout

```
extension/
  manifest.json          MV3: action + activeTab + scripting permissions
  src/
    background.ts        action.onClicked → scripting.executeScript
    content.ts           entry point: run extraction, decorate page, toolbar
    extract/
      classify.ts        ports node.coffee predicates (isNavLike, isLinkish,
                         link-ratio, TEXTISH/IRRELEVANT element lists)
      segment.ts         Intl.Segmenter wrapper; replaces getStatements
      walk.ts            non-destructive TreeWalker version of unwrap/merge —
                         wrap sentences in <span> overlays instead of
                         emptying nodes
    share/
      targets.ts         Web Share API; fallback intent URLs per network
      fragment.ts        build #:~:text= deep link from the selected sentence
    ui/
      toolbar.ts         the fixed header widget, injected into a Shadow DOM
      styles.css         real stylesheet (Shadow DOM–scoped), replaces the
                         inline-style blobs in run.coffee
  test/
    fixtures/            reuse htdocs/test/*.html saved pages
    *.test.ts            vitest + jsdom for classify/segment/fragment
```

`htdocs/` stays as-is (historical site + fixtures) until a new landing page
is wanted; `chrome/savepublishing/` (MV2) is deleted at the end.

## Phases

### Phase 1 — Extraction core as a pure library (no extension yet)
1. Scaffold `extension/` with TypeScript + esbuild + vitest.
2. Port `node.coffee`'s classification predicates to pure functions taking a
   `Node` argument (`classify.ts`). Keep the constants from `init.coffee`
   (MIN_LINK_RATIO, element lists, nav regex) — extend the nav regex with
   modern classnames (`cookie`, `paywall`, `newsletter`, `related`, `promo`).
3. Rewrite the traversal (`walk.ts`): TreeWalker that yields "narrative text
   runs" (the merge step from array.coffee) **without mutating the page** —
   the old code emptied nodes and re-wrote them, which broke live pages;
   the new one wraps ranges.
4. `segment.ts`: sentence splitting via `Intl.Segmenter`, with the old
   heuristics' test cases ("U.S.A.", "10 p.m.", quoted dialogue) as vitest
   cases against it.
5. Run the library against the saved fixture pages (`nyt.html`, `mefi.html`,
   `tests.html`) in jsdom; assert sensible sentence counts.

### Phase 2 — MV3 extension shell
6. `manifest.json` (MV3): `action`, `activeTab` + `scripting` permissions
   (no broad host permissions — activeTab grants access only on click,
   which also eases store review).
7. `background.ts` service worker: on toolbar click, inject `content.ts`
   into the active tab; second click tears down.
8. `content.ts`: run extraction, overlay clickable sentence spans, inject
   the toolbar. All UI inside a Shadow DOM so host-page CSS can't leak in
   either direction.
9. Toolbar UI: title, sentence count, share-target picker, off switch.
   Visual nod to the original white box + red hover.

### Phase 3 — Sharing
10. `fragment.ts`: canonical-URL resolution (port `getBestURL`) + build
    `#:~:text=` fragments (percent-encode, use prefix/suffix syntax for
    disambiguation when the sentence appears twice).
11. `targets.ts`: click a sentence → try `navigator.share({text: "“…”",
    url})`; where unavailable (desktop Chrome on some platforms), show a
    mini-menu: X intent, Bluesky intent, Mastodon (prompt for instance,
    remember in `chrome.storage`), Threads, Copy quote + link.
12. Length badge per sentence (color-coded vs. 280/300/500) instead of the
    old hard true/false cutoff.

### Phase 4 — Ship & tidy
13. Manual pass on real sites: NYT, Substack, Wikipedia, a Ghost blog, a
    paywalled page. Fix classifier misses; fixtures for regressions.
14. Firefox port (MV3 with `browser_specific_settings`), since the deltas
    are tiny.
15. Delete `chrome/savepublishing/` (MV2, dead), mark `htdocs/coffee/` as
    legacy in README, update CLAUDE.md for the new build (`npm run build`,
    `npm test`), note the bookmarklet is retired.
16. Optional: new one-page site under `htdocs/` explaining the history and
    linking to the store listing.

## Open questions (for the author)

- Domain: savepublishing.com redirects to thebrick.house — does the project
  get its domain back, live under a new one, or live only as an extension? Extension only
- Store publication (Chrome Web Store fee/review) vs. "load unpacked" +
  GitHub releases only? GitHub only
- Keep "SavePublishing" name or rebrand around the quote-link idea? Rebrand

## Roadmap

- Android/iOS app
- Version 2: daily or weekly recaps of saved/shared content; discover books within the
  content; surface similar or other content written by the author of the page being saved

## Effort estimate

Phases 1–3 are roughly a few focused days of work; the codebase being
ported is only ~600 lines and half of it is replaced by platform APIs.
Phase 1 is independently valuable (a tested narrative-text extractor) even
if the extension never ships.
