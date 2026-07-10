import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { isActive, setup, SPAN_ATTR, teardown } from '../src/ui/overlay.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

const noop = () => {};

function dom(html: string): JSDOM {
  return new JSDOM(`<body>${html}</body>`);
}

function spanTexts(doc: Document, id: number): string {
  return Array.from(doc.querySelectorAll(`span[${SPAN_ATTR}="${id}"]`))
    .map((s) => s.textContent ?? '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('overlay setup', () => {
  it('wraps every extracted sentence in spans that reproduce its text', () => {
    const { window } = dom(
      '<p>One thing here. <em>Two</em> continues <a href="#">here</a> now. Three more words.</p>',
    );
    const state = setup(window.document, { onClose: noop });
    expect(state.sentences).toEqual([
      'One thing here.',
      'Two continues here now.',
      'Three more words.',
    ]);
    for (const [i, sentence] of state.sentences.entries()) {
      expect(spanTexts(window.document, i)).toBe(sentence);
    }
  });

  it('injects the style element, toolbar, and reports active', () => {
    const { window } = dom('<p>A single sentence here.</p>');
    expect(isActive(window.document)).toBe(false);
    const state = setup(window.document, { onClose: noop });
    expect(isActive(window.document)).toBe(true);
    expect(window.document.querySelector('style[data-ql-style]')).not.toBeNull();
    const toolbar = window.document.querySelector('[data-ql-toolbar]');
    expect(toolbar).not.toBeNull();
    expect(toolbar!.shadowRoot!.textContent).toContain('Quotelink');
    expect(toolbar!.shadowRoot!.textContent).toContain(String(state.sentences.length));
  });

  it('is idempotent while active', () => {
    const { window } = dom('<p>Alpha beta gamma. Delta epsilon.</p>');
    setup(window.document, { onClose: noop });
    const spansBefore = window.document.querySelectorAll(`span[${SPAN_ATTR}]`).length;
    setup(window.document, { onClose: noop });
    expect(window.document.querySelectorAll(`span[${SPAN_ATTR}]`).length).toBe(spansBefore);
    expect(window.document.querySelectorAll('[data-ql-toolbar]').length).toBe(1);
  });

  it('skips nav chrome, as the extraction layer does', () => {
    const { window } = dom(
      '<div class="nav"><a href="#">Home</a> <a href="#">About</a></div><p>Real prose here.</p>',
    );
    const state = setup(window.document, { onClose: noop });
    expect(state.sentences).toEqual(['Real prose here.']);
    expect(window.document.querySelector('.nav [data-ql]')).toBeNull();
  });
});

describe('overlay hover', () => {
  it('highlights every span of the hovered sentence, and clears on out', () => {
    const { window } = dom('<p>First bit <em>and</em> second bit. Another one.</p>');
    setup(window.document, { onClose: noop });
    const doc = window.document;
    const spans = doc.querySelectorAll(`span[${SPAN_ATTR}="0"]`);
    expect(spans.length).toBeGreaterThan(1);

    spans[0]!.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
    for (const s of spans) expect(s.classList.contains('ql-hover')).toBe(true);
    // The other sentence stays unlit.
    for (const s of doc.querySelectorAll(`span[${SPAN_ATTR}="1"]`)) {
      expect(s.classList.contains('ql-hover')).toBe(false);
    }

    spans[0]!.dispatchEvent(new window.MouseEvent('mouseout', { bubbles: true }));
    for (const s of spans) expect(s.classList.contains('ql-hover')).toBe(false);
  });
});

describe('overlay teardown', () => {
  it('restores the page byte-for-byte', () => {
    const { window } = dom(
      '<div><p>One thing here. <em>Two</em> continues here now.</p>' +
        '<blockquote>Quoted words follow. More of them.</blockquote></div>',
    );
    const before = window.document.body.innerHTML;
    setup(window.document, { onClose: noop });
    expect(window.document.body.innerHTML).not.toBe(before);
    teardown(window.document);
    expect(window.document.body.innerHTML).toBe(before);
    expect(isActive(window.document)).toBe(false);
  });

  it('close button tears everything down via onClose', () => {
    const { window } = dom('<p>Some prose to find.</p>');
    const doc = window.document;
    setup(doc, { onClose: () => teardown(doc) });
    const button = doc.querySelector('[data-ql-toolbar]')!.shadowRoot!.querySelector('button.close')!;
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(isActive(doc)).toBe(false);
    expect(doc.querySelector('[data-ql-toolbar]')).toBeNull();
    expect(doc.querySelector(`span[${SPAN_ATTR}]`)).toBeNull();
  });

  it('round-trips a real page', () => {
    const html = readFileSync(join(fixtureDir, 'nyt.html'), 'utf8');
    const { window } = new JSDOM(html);
    const before = window.document.body.innerHTML;
    const state = setup(window.document, { onClose: noop });
    expect(state.sentences.length).toBeGreaterThan(10);
    teardown(window.document);
    expect(window.document.body.innerHTML).toBe(before);
  });
});
