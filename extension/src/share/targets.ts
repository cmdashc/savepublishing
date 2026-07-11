// Share targets: navigator.share when the platform has it, otherwise a
// small anchored menu of intent URLs — the 2026 equivalent of the old
// twitter.com/intent/tweet links. URL builders are pure; everything
// environment-shaped (window.open, clipboard, extension storage, prompt)
// comes in through ShareDeps so tests can fake it.

import { browserAPI } from '../browserAPI.js';

export const MENU_ATTR = 'data-ql-menu';

const QUOTE_OPEN = '“';
const QUOTE_CLOSE = '”';

export function quoteText(sentence: string): string {
  return `${QUOTE_OPEN}${sentence}${QUOTE_CLOSE}`;
}

export function xIntentURL(text: string, url: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function blueskyIntentURL(text: string, url: string): string {
  return `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}`;
}

export function threadsIntentURL(text: string, url: string): string {
  return `https://threads.net/intent/post?text=${encodeURIComponent(`${text} ${url}`)}`;
}

// "mastodon.social", "https://mastodon.social", trailing slashes — all
// normalize to an origin; null when it doesn't parse.
export function normalizeInstance(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  try {
    return new URL(/^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`).origin;
  } catch {
    return null;
  }
}

export function mastodonShareURL(instance: string, text: string, url: string): string {
  return `${instance}/share?text=${encodeURIComponent(`${text} ${url}`)}`;
}

// Soft length indicator, never a gate.
export const LIMITS = [
  { name: 'X', limit: 280 },
  { name: 'Bluesky', limit: 300 },
  { name: 'Mastodon', limit: 500 },
] as const;

export interface ShareDeps {
  openURL: (url: string) => void;
  copy: (text: string) => Promise<void>;
  getInstance: () => Promise<string | undefined>;
  setInstance: (instance: string) => Promise<void>;
  promptInstance: () => string | null;
  nativeShare?: (data: { text: string; url: string }) => Promise<void>;
}

const MENU_CSS = `
.menu {
  position: absolute;
  box-sizing: border-box;
  min-width: 220px;
  padding: 6px 0;
  font-family: "Gill Sans", "Gill Sans MT", "Helvetica Neue", Arial, sans-serif;
  font-size: 14px;
  line-height: 20px;
  color: #333;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 3px;
  box-shadow: 1px 0 15px rgba(0, 0, 0, 0.2);
}
.item {
  display: block;
  width: 100%;
  padding: 5px 14px;
  border: 0;
  background: none;
  font: inherit;
  color: #333;
  text-align: left;
  cursor: pointer;
}
.item:hover { background: #faa; color: #000; }
.length {
  padding: 5px 14px 3px;
  border-top: 1px solid #eee;
  margin-top: 4px;
  font-size: 12px;
  color: #aaa;
}
.length .fit { color: #6ac; }
.length .over { color: #f00; }
`;

function lengthBadge(doc: Document, sentence: string): HTMLElement {
  const div = doc.createElement('div');
  div.className = 'length';
  div.append(`${sentence.length} chars: `);
  LIMITS.forEach(({ name, limit }, i) => {
    const pill = doc.createElement('span');
    pill.className = sentence.length <= limit ? 'fit' : 'over';
    pill.textContent = `${name} ${sentence.length <= limit ? '✓' : `> ${limit}`}`;
    div.appendChild(pill);
    if (i < LIMITS.length - 1) div.append(' · ');
  });
  return div;
}

export function closeShareMenu(doc: Document): void {
  doc.querySelector(`[${MENU_ATTR}]`)?.remove();
}

interface MenuItem {
  label: string;
  action: () => void | Promise<void>;
}

function openMenu(doc: Document, anchor: Element, sentence: string, items: MenuItem[]): void {
  closeShareMenu(doc);

  const host = doc.createElement('div');
  host.setAttribute(MENU_ATTR, '');
  const rect = anchor.getBoundingClientRect();
  const win = doc.defaultView;
  const top = rect.bottom + (win?.scrollY ?? 0) + 4;
  const left = rect.left + (win?.scrollX ?? 0);
  host.style.cssText = `position:absolute;top:${top}px;left:${left}px;z-index:2147483647;`;

  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = MENU_CSS;
  shadow.appendChild(style);

  const menu = doc.createElement('div');
  menu.className = 'menu';
  for (const { label, action } of items) {
    const button = doc.createElement('button');
    button.className = 'item';
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      void action();
      closeShareMenu(doc);
    });
    menu.appendChild(button);
  }
  menu.appendChild(lengthBadge(doc, sentence));
  shadow.appendChild(menu);
  doc.body.appendChild(host);
}

async function shareToMastodon(deps: ShareDeps, text: string, url: string): Promise<void> {
  let instance = (await deps.getInstance()) ?? null;
  if (!instance) {
    const answer = deps.promptInstance();
    if (answer === null) return;
    instance = normalizeInstance(answer);
    if (!instance) return;
    await deps.setInstance(instance);
  }
  deps.openURL(mastodonShareURL(instance, text, url));
}

// Click-a-sentence entry point: native share sheet when available, the menu
// otherwise (or when the platform refuses; a user-cancelled sheet is not a
// refusal).
export async function shareSentence(
  doc: Document,
  opts: { sentence: string; url: string; anchor: Element; deps: ShareDeps },
): Promise<void> {
  const { sentence, url, anchor, deps } = opts;
  const text = quoteText(sentence);

  if (deps.nativeShare) {
    try {
      await deps.nativeShare({ text, url });
      return;
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') return;
      // NotAllowedError and friends: fall through to the menu.
    }
  }

  openMenu(doc, anchor, sentence, [
    { label: 'Post to X', action: () => deps.openURL(xIntentURL(text, url)) },
    { label: 'Post to Bluesky', action: () => deps.openURL(blueskyIntentURL(text, url)) },
    { label: 'Post to Threads', action: () => deps.openURL(threadsIntentURL(text, url)) },
    { label: 'Post to Mastodon…', action: () => shareToMastodon(deps, text, url) },
    { label: 'Copy quote + link', action: () => deps.copy(`${text} ${url}`) },
  ]);
}

// The real environment, assembled at the content-script edge. The storage
// API is referenced lazily (via browserAPI(), inside these closures) so
// this module can load in test environments where no extension globals
// exist, and so it runs unmodified in both Chrome and Firefox.
export function defaultDeps(win: Window & typeof globalThis): ShareDeps {
  const nav = win.navigator;
  return {
    openURL: (url) => {
      win.open(url, '_blank', 'noopener');
    },
    copy: (text) => nav.clipboard.writeText(text),
    getInstance: async () => {
      const got = await browserAPI().storage.sync.get('mastodonInstance');
      const value = got['mastodonInstance'];
      return typeof value === 'string' ? value : undefined;
    },
    setInstance: (instance) =>
      browserAPI().storage.sync.set({ mastodonInstance: instance }),
    promptInstance: () =>
      win.prompt('Your Mastodon instance (e.g. mastodon.social):'),
    nativeShare: typeof nav.share === 'function' ? (data) => nav.share(data) : undefined,
  };
}
