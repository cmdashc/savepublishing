import { describe, expect, it } from 'vitest';
import {
  isGoodLink,
  isLinkish,
  isNavLike,
  isNavLikeString,
  isTextish,
  isUseful,
  linkRatio,
} from '../src/extract/classify.js';

// Runs in the jsdom test environment, so `document` is the global one.
function el(html: string): Element {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.firstElementChild!;
}

describe('linkRatio / isLinkish', () => {
  // The worked examples from init.coffee's MIN_LINK_RATIO comment.
  it('a bare link is all link text (ratio 1) and linkish', () => {
    const p = el('<p><a href="http://example.com">This</a></p>');
    expect(linkRatio(p)).toBe(1);
    expect(isLinkish(p)).toBe(true);
  });

  it('a link inside a sentence is ratio 27/4 and not linkish', () => {
    const p = el(
      '<p><a href="http://example.com">This</a> is quite the sentence.</p>',
    );
    expect(linkRatio(p)).toBeCloseTo(27 / 4);
    expect(isLinkish(p)).toBe(false);
  });

  it('no links means Infinity, i.e. never linkish', () => {
    const p = el('<p>No links here at all.</p>');
    expect(linkRatio(p)).toBe(Infinity);
    expect(isLinkish(p)).toBe(false);
  });

  it('counts direct-child links only, like the original', () => {
    // The <a> is a grandchild, so this <div> itself is not linkish; the
    // inner <p> is judged on its own when the walk descends.
    const div = el('<div><p><a href="#">All link</a></p></div>');
    expect(linkRatio(div)).toBe(Infinity);
    expect(isLinkish(div)).toBe(false);
  });
});

describe('isNavLike', () => {
  it.each([
    'nav', 'breadcrumb', 'share', 'masthead', 'social', 'twitter',
    // Modern boilerplate vocabulary added to the original regex:
    'cookie', 'paywall', 'newsletter', 'related', 'promo', 'consent',
    'banner', 'subscribe', 'comment', 'sidebar', 'footer',
  ])('flags a div with class "%s"', (cls) => {
    expect(isNavLike(el(`<div class="${cls}-widget">x</div>`))).toBe(true);
  });

  it('matches on id as well as class', () => {
    expect(isNavLike(el('<ul id="site-nav"><li>Home</li></ul>'))).toBe(true);
  });

  it('ignores nav-like classes on non-container elements', () => {
    expect(isNavLike(el('<span class="nav">x</span>'))).toBe(false);
  });

  it('never fires for <a>, matching the original quirk', () => {
    // 'A' is not in NAV_CONTAINING_ELEMENTS, so even a share-classed link is
    // not nav-like — and stays a "good link".
    const a = el('<a class="share" href="#">tweet this</a>');
    expect(isNavLike(a)).toBe(false);
    expect(isGoodLink(a)).toBe(true);
  });

  it('reads classes safely on SVG elements', () => {
    // .className on SVG is an SVGAnimatedString; the original crashed here.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'decoration');
    expect(() => isNavLike(svg)).not.toThrow();
    expect(isNavLike(svg)).toBe(false);
  });
});

describe('isNavLikeString', () => {
  it('matches the original vocabulary', () => {
    expect(isNavLikeString('addthis_toolbox')).toBe(true);
    expect(isNavLikeString('fb-like')).toBe(true);
    expect(isNavLikeString('articleBody')).toBe(false);
  });
});

describe('isGoodLink / isTextish', () => {
  it('a plain link is good and textish', () => {
    const a = el('<a href="#">a link</a>');
    expect(isGoodLink(a)).toBe(true);
    expect(isTextish(a)).toBe(true);
  });

  it('a link wrapping elements is not good', () => {
    const a = el('<a href="#"><img src="x.png"></a>');
    expect(isGoodLink(a)).toBe(false);
    expect(isTextish(a)).toBe(false);
  });

  it('text nodes and inline formatting are textish', () => {
    expect(isTextish(document.createTextNode('words'))).toBe(true);
    expect(isTextish(el('<em>stress</em>'))).toBe(true);
    expect(isTextish(el('<div>block</div>'))).toBe(false);
  });
});

describe('isUseful', () => {
  it('rejects whitespace, comments, and irrelevant elements', () => {
    expect(isUseful(document.createTextNode('  \n '))).toBe(false);
    expect(isUseful(document.createComment('hidden'))).toBe(false);
    expect(isUseful(el('<script>x()</script>'))).toBe(false);
    expect(isUseful(el('<h2>A headline</h2>'))).toBe(false);
    expect(isUseful(el('<img src="x.png">'))).toBe(false);
  });

  it('rejects link-menu blocks and bare links, keeps prose blocks', () => {
    expect(isUseful(el('<p><a href="#">Only a link</a></p>'))).toBe(false);
    expect(isUseful(el('<a href="#">bare link</a>'))).toBe(false);
    expect(isUseful(el('<div><p>Real prose lives here.</p></div>'))).toBe(true);
  });
});
