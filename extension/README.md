# Quotelink (working title)

The 2012 [SavePublishing](https://github.com/ftrain/savepublishing) bookmarklet,
reborn as a Manifest V3 browser extension in plain TypeScript. Click the toolbar
button on any article: sentences worth quoting light up red; click one to share
it — with a `#:~:text=` deep link that highlights the exact sentence for whoever
follows it.

The extraction heuristics (link-ratio scoring, nav-classname detection, the
unwrap/merge traversal) are the original CoffeeScript's, ported as pure,
tested functions. See `../PLAN.md` for the full design.

## Build

```bash
npm install
npm run build     # bundles background + content scripts into dist/
npm test          # vitest: 100+ unit + fixture-page regression tests
npm run typecheck
```

## Load it in Chrome

1. `npm install && npm run build`
2. Open `chrome://extensions`, turn on **Developer mode**
3. **Load unpacked** → pick this repo's `extension/dist` directory
4. Pin the icon if you like — it only gets access to a tab when you click it
   (`activeTab`; no host permissions)

## Manual QA script

1. Open a news article (NYT, Guardian, a Substack…). Click the extension icon:
   shareable sentences turn red, a white toolbar appears up top with the count,
   and hovering a sentence highlights all of it (`#FAA`, like old times).
2. Click a sentence: the share menu opens (or your OS share sheet, where
   Chrome supports it). Pick **Copy quote + link** and paste somewhere — you
   should get `“The sentence.” https://…#:~:text=The%20sentence.` — or pick a
   network and check the compose box is prefilled. Follow the copied link in a
   new tab: the browser should scroll to and highlight that sentence.
   Mastodon asks for your instance once, then remembers it.
3. Click the extension icon again (or the toolbar's ✕): highlights, toolbar,
   and menu all vanish and the page is back to untouched.

Sites that misbehave: please open an issue with the URL — the classifier
fixtures under `test/fixtures/` are how those get fixed for good.

## Layout

```
src/extract/   classify.ts, walk.ts, segment.ts, ranges.ts — the pure library
src/share/     fragment.ts (#:~:text= links), targets.ts (share sheet + menu)
src/ui/        overlay.ts (page decoration + teardown), toolbar.ts
src/content.ts, src/background.ts — the thin chrome.* edges
```
