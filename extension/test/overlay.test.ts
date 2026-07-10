import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { MENU_ATTR, type ShareDeps } from '../src/share/targets.js';
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

describe('overlay share flow', () => {
  function fakeDeps(): ShareDeps & { opened: string[] } {
    const opened: string[] = [];
    return {
      opened,
      openURL: (url) => {
        opened.push(url);
      },
      copy: async () => {},
      getInstance: async () => undefined,
      setInstance: async () => {},
      promptInstance: () => null,
    };
  }

  it('clicking a sentence opens the menu; a target posts quote + fragment URL', async () => {
    const { window } = new JSDOM(
      '<body><p>Unique prose sentence here. And a second one follows.</p></body>',
      { url: 'https://example.com/article' },
    );
    const doc = window.document;
    const deps = fakeDeps();
    setup(doc, { onClose: noop, deps });

    const span = doc.querySelector(`span[${SPAN_ATTR}="0"]`)!;
    span.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));

    const menu = doc.querySelector(`[${MENU_ATTR}]`);
    expect(menu).not.toBeNull();
    const x = menu!.shadowRoot!.querySelector('button.item') as HTMLButtonElement;
    x.click();
    expect(deps.opened).toHaveLength(1);
    expect(deps.opened[0]).toContain('https://x.com/intent/post?text=');
    expect(decodeURIComponent(deps.opened[0]!)).toContain('“Unique prose sentence here.”');
    expect(decodeURIComponent(deps.opened[0]!)).toContain(
      'https://example.com/article#:~:text=Unique%20prose%20sentence%20here.',
    );
  });

  it('prevents navigation when the sentence sits inside a page link', () => {
    const { window } = new JSDOM(
      '<body><p>Before text flows along for quite some time in this rather longer paragraph. <a href="/away">Linked words continue the story here.</a></p></body>',
      { url: 'https://example.com/article' },
    );
    const doc = window.document;
    setup(doc, { onClose: noop, deps: fakeDeps() });

    const inLink = doc.querySelector(`a span[${SPAN_ATTR}]`);
    expect(inLink).not.toBeNull();
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    inLink!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(doc.querySelector(`[${MENU_ATTR}]`)).not.toBeNull();
  });

  it('Escape and outside clicks dismiss the menu', () => {
    const { window } = new JSDOM('<body><p>Some prose sentence here.</p><div id="out">x</div></body>', {
      url: 'https://example.com/article',
    });
    const doc = window.document;
    setup(doc, { onClose: noop, deps: fakeDeps() });

    const span = doc.querySelector(`span[${SPAN_ATTR}]`)!;
    span.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(doc.querySelector(`[${MENU_ATTR}]`)).not.toBeNull();

    doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(doc.querySelector(`[${MENU_ATTR}]`)).toBeNull();

    span.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(doc.querySelector(`[${MENU_ATTR}]`)).not.toBeNull();
    doc.getElementById('out')!.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    );
    expect(doc.querySelector(`[${MENU_ATTR}]`)).toBeNull();
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
