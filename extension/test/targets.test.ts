import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import {
  blueskyIntentURL,
  closeShareMenu,
  MENU_ATTR,
  mastodonShareURL,
  normalizeInstance,
  quoteText,
  shareSentence,
  threadsIntentURL,
  xIntentURL,
  type ShareDeps,
} from '../src/share/targets.js';

describe('intent URL builders', () => {
  const text = quoteText('A quote, & a dash-y one.');
  const url = 'https://example.com/story';

  it('X takes separate text and url params', () => {
    expect(xIntentURL(text, url)).toBe(
      'https://x.com/intent/post?text=%E2%80%9CA%20quote%2C%20%26%20a%20dash-y%20one.%E2%80%9D&url=https%3A%2F%2Fexample.com%2Fstory',
    );
  });

  it('Bluesky and Threads take a single text param with the url appended', () => {
    expect(blueskyIntentURL(text, url)).toMatch(/^https:\/\/bsky\.app\/intent\/compose\?text=/);
    expect(decodeURIComponent(blueskyIntentURL(text, url))).toContain(`${text} ${url}`);
    expect(threadsIntentURL(text, url)).toMatch(/^https:\/\/threads\.net\/intent\/post\?text=/);
    expect(decodeURIComponent(threadsIntentURL(text, url))).toContain(`${text} ${url}`);
  });

  it('Mastodon shares against the instance origin', () => {
    expect(mastodonShareURL('https://mstdn.example', text, url)).toBe(
      `https://mstdn.example/share?text=${encodeURIComponent(`${text} ${url}`)}`,
    );
  });
});

describe('normalizeInstance', () => {
  it('accepts bare hosts, full URLs, and junk', () => {
    expect(normalizeInstance('mastodon.social')).toBe('https://mastodon.social');
    expect(normalizeInstance(' https://mstdn.example/path ')).toBe('https://mstdn.example');
    expect(normalizeInstance('')).toBeNull();
    expect(normalizeInstance('   ')).toBeNull();
  });
});

function fakeDeps(overrides: Partial<ShareDeps> = {}): ShareDeps & {
  opened: string[];
  copied: string[];
} {
  const opened: string[] = [];
  const copied: string[] = [];
  return {
    opened,
    copied,
    openURL: (url) => {
      opened.push(url);
    },
    copy: async (text) => {
      copied.push(text);
    },
    getInstance: async () => undefined,
    setInstance: async () => {},
    promptInstance: () => null,
    ...overrides,
  };
}

function domWithSpan(): { doc: Document; anchor: Element; win: Window } {
  const { window } = new JSDOM('<body><p><span id="s">A sentence.</span></p></body>', {
    url: 'https://example.com/x',
  });
  return { doc: window.document, anchor: window.document.getElementById('s')!, win: window as unknown as Window };
}

function menuButtons(doc: Document): HTMLButtonElement[] {
  const host = doc.querySelector(`[${MENU_ATTR}]`);
  return host ? Array.from(host.shadowRoot!.querySelectorAll('button.item')) : [];
}

describe('shareSentence', () => {
  const url = 'https://example.com/x#:~:text=A%20sentence.';

  it('uses navigator.share when available and skips the menu', async () => {
    const { doc, anchor } = domWithSpan();
    const nativeShare = vi.fn().mockResolvedValue(undefined);
    const deps = fakeDeps({ nativeShare });
    await shareSentence(doc, { sentence: 'A sentence.', url, anchor, deps });
    expect(nativeShare).toHaveBeenCalledWith({ text: '“A sentence.”', url });
    expect(doc.querySelector(`[${MENU_ATTR}]`)).toBeNull();
  });

  it('falls back to the menu when native share is refused, but not when cancelled', async () => {
    const { doc, anchor } = domWithSpan();
    const refused = fakeDeps({
      nativeShare: vi.fn().mockRejectedValue(Object.assign(new Error(), { name: 'NotAllowedError' })),
    });
    await shareSentence(doc, { sentence: 'A sentence.', url, anchor, deps: refused });
    expect(doc.querySelector(`[${MENU_ATTR}]`)).not.toBeNull();
    closeShareMenu(doc);

    const cancelled = fakeDeps({
      nativeShare: vi.fn().mockRejectedValue(Object.assign(new Error(), { name: 'AbortError' })),
    });
    await shareSentence(doc, { sentence: 'A sentence.', url, anchor, deps: cancelled });
    expect(doc.querySelector(`[${MENU_ATTR}]`)).toBeNull();
  });

  it('opens the menu with all targets and a length badge', async () => {
    const { doc, anchor } = domWithSpan();
    const deps = fakeDeps();
    await shareSentence(doc, { sentence: 'A sentence.', url, anchor, deps });
    const labels = menuButtons(doc).map((b) => b.textContent);
    expect(labels).toEqual([
      'Post to X',
      'Post to Bluesky',
      'Post to Threads',
      'Post to Mastodon…',
      'Copy quote + link',
    ]);
    const badge = doc.querySelector(`[${MENU_ATTR}]`)!.shadowRoot!.querySelector('.length')!;
    expect(badge.textContent).toContain('11 chars');
    expect(badge.querySelectorAll('.fit')).toHaveLength(3);
  });

  it('flags targets whose limit the sentence exceeds', async () => {
    const { doc, anchor } = domWithSpan();
    const deps = fakeDeps();
    const long = 'w'.repeat(290);
    await shareSentence(doc, { sentence: long, url, anchor, deps });
    const badge = doc.querySelector(`[${MENU_ATTR}]`)!.shadowRoot!.querySelector('.length')!;
    expect(badge.querySelectorAll('.over')).toHaveLength(1); // X at 280
    expect(badge.querySelectorAll('.fit')).toHaveLength(2);
  });

  it('menu items open their target and close the menu', async () => {
    const { doc, anchor } = domWithSpan();
    const deps = fakeDeps();
    await shareSentence(doc, { sentence: 'A sentence.', url, anchor, deps });
    menuButtons(doc)[0]!.click();
    expect(deps.opened).toEqual([xIntentURL('“A sentence.”', url)]);
    expect(doc.querySelector(`[${MENU_ATTR}]`)).toBeNull();
  });

  it('copy puts quote and link on the clipboard', async () => {
    const { doc, anchor } = domWithSpan();
    const deps = fakeDeps();
    await shareSentence(doc, { sentence: 'A sentence.', url, anchor, deps });
    menuButtons(doc)[4]!.click();
    await Promise.resolve();
    expect(deps.copied).toEqual([`“A sentence.” ${url}`]);
  });

  it('Mastodon prompts once, persists, and reuses the instance', async () => {
    const { doc, anchor } = domWithSpan();
    let stored: string | undefined;
    const deps = fakeDeps({
      getInstance: async () => stored,
      setInstance: async (i) => {
        stored = i;
      },
      promptInstance: vi.fn().mockReturnValue('mastodon.social'),
    });

    await shareSentence(doc, { sentence: 'A sentence.', url, anchor, deps });
    menuButtons(doc)[3]!.click();
    await vi.waitFor(() => expect(deps.opened).toHaveLength(1));
    expect(stored).toBe('https://mastodon.social');
    expect(deps.opened[0]).toBe(
      mastodonShareURL('https://mastodon.social', '“A sentence.”', url),
    );

    // Second share: no prompt, straight to the stored instance.
    await shareSentence(doc, { sentence: 'A sentence.', url, anchor, deps });
    menuButtons(doc)[3]!.click();
    await vi.waitFor(() => expect(deps.opened).toHaveLength(2));
    expect(deps.promptInstance).toHaveBeenCalledTimes(1);
  });

  it('Mastodon prompt cancelled: nothing opens, nothing stored', async () => {
    const { doc, anchor } = domWithSpan();
    const setInstance = vi.fn();
    const deps = fakeDeps({ promptInstance: () => null, setInstance });
    await shareSentence(doc, { sentence: 'A sentence.', url, anchor, deps });
    menuButtons(doc)[3]!.click();
    await Promise.resolve();
    expect(deps.opened).toEqual([]);
    expect(setInstance).not.toHaveBeenCalled();
  });
});
