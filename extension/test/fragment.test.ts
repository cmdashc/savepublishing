import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { encodeFragmentText, getBestURL, lastWords, quoteURL } from '../src/share/fragment.js';

function doc(html: string, url = 'https://example.com/story/one?page=2'): Document {
  return new JSDOM(`<html><head></head><body>${html}</body></html>`, { url }).window.document;
}

function head(html: string, body: string, url?: string): Document {
  return new JSDOM(`<html><head>${html}</head><body>${body}</body></html>`, {
    url: url ?? 'https://example.com/story/one?page=2',
  }).window.document;
}

describe('getBestURL', () => {
  it('falls back to the page URL, fragment stripped', () => {
    const d = doc('<p>x</p>', 'https://example.com/a#middle');
    expect(getBestURL(d)).toBe('https://example.com/a');
  });

  it('prefers an absolute canonical link', () => {
    const d = head(
      '<link rel="canonical" href="https://example.com/canonical-story">',
      '<p>x</p>',
    );
    expect(getBestURL(d)).toBe('https://example.com/canonical-story');
  });

  it('resolves a relative canonical href against the page', () => {
    const d = head('<link rel="canonical" href="/short">', '<p>x</p>');
    expect(getBestURL(d)).toBe('https://example.com/short');
  });

  it('ignores an empty canonical href', () => {
    const d = head('<link rel="canonical" href="">', '<p>x</p>');
    expect(getBestURL(d)).toBe('https://example.com/story/one?page=2');
  });
});

describe('encodeFragmentText', () => {
  it('escapes the fragment-directive delimiters', () => {
    expect(encodeFragmentText('a-b, c & d')).toBe('a%2Db%2C%20c%20%26%20d');
  });
});

describe('lastWords', () => {
  it('takes the trailing words', () => {
    expect(lastWords('one two three four five six', 3)).toBe('four five six');
    expect(lastWords('short', 5)).toBe('short');
  });
});

describe('quoteURL', () => {
  it('builds a plain text fragment for a unique sentence', () => {
    const d = doc('<p>Only one of these here.</p>');
    expect(quoteURL(d, 'Only one of these here.')).toBe(
      'https://example.com/story/one?page=2#:~:text=Only%20one%20of%20these%20here.',
    );
  });

  it('adds a prefix when the sentence occurs twice', () => {
    const d = doc('<p>Repeated words here. Something between. Repeated words here.</p>');
    const url = quoteURL(d, 'Repeated words here.', 'Something between.');
    expect(url).toBe(
      'https://example.com/story/one?page=2#:~:text=Something%20between.-,Repeated%20words%20here.',
    );
  });

  it('leaves the fragment bare when duplicated but no prefix is known', () => {
    const d = doc('<p>Twice over. Twice over.</p>');
    expect(quoteURL(d, 'Twice over.')).toBe(
      'https://example.com/story/one?page=2#:~:text=Twice%20over.',
    );
  });
});
