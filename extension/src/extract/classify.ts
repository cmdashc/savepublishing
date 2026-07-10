// DOM-classification predicates ported from the 2012 bookmarklet
// (htdocs/coffee/src/init.coffee + node.coffee + string.coffee), rewritten as
// pure functions: no prototype extension, no jQuery, no mutation.

// nodeType values, kept as plain numbers so nothing here needs a global Node
// constructor (works identically in jsdom instances and content scripts).
export const ELEMENT_NODE = 1;
export const TEXT_NODE = 3;
export const COMMENT_NODE = 8;

// Inline formatting elements whose text belongs to the surrounding prose.
export const TEXTISH_ELEMENTS = new Set([
  'EM', 'B', 'STRONG', 'I', 'TT', 'ABBR', 'ACRONYM', 'BIG', 'CITE', 'CODE',
  'DFN', 'LABEL', 'Q', 'SAMP', 'SMALL', 'SUB', 'SUP', 'VAR', 'DEL', 'INS',
  'BR',
]);

// Elements that never contain narrative text worth extracting.
export const IRRELEVANT_ELEMENTS = new Set([
  'IMG', 'OBJECT', 'EMBED', 'IFRAME', 'SCRIPT', 'INPUT', 'TEXTAREA', 'HEAD',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STYLE', 'LINK',
]);

// Container elements that, when carrying a nav-like class or id, are treated
// as navigation rather than content.
export const NAV_CONTAINING_ELEMENTS = new Set(['DIV', 'UL', 'OL', 'LI', 'P']);

// Minimum ratio of all text to link text for a block to count as narrative.
// `<a>This</a>` alone is 4/4 = 1 (nav-ish); `<a>This</a> is quite the
// sentence.` is 27/4 = 6.75 (narrative).
export const MIN_LINK_RATIO = 2;

// The original bookmarklet's class/id heuristic, extended with boilerplate
// vocabulary common on today's pages (cookie/consent walls, newsletter promos,
// related-story rails, comment sections, …).
export const NAV_LIKE_RE =
  /head|breadcrumb|addthis|share|nav|mast|social|twitter|reddit|facebook|fb|cookie|paywall|newsletter|related|promo|consent|banner|subscribe|comment|sidebar|footer/i;

export function isNavLikeString(s: string): boolean {
  return NAV_LIKE_RE.test(s);
}

export function isNavLike(el: Element): boolean {
  if (!NAV_CONTAINING_ELEMENTS.has(el.nodeName)) return false;
  // getAttribute, not .className: on SVG elements .className is an
  // SVGAnimatedString, which crashed the original.
  const cls = el.getAttribute('class') ?? '';
  const id = el.getAttribute('id') ?? '';
  return isNavLikeString(cls) || isNavLikeString(id);
}

// A link whose text can flow into the surrounding sentence: an <a> with no
// element children. The nav-like check is kept from the original, where it
// never fired ('A' is not in NAV_CONTAINING_ELEMENTS) — preserved, not fixed,
// so link classification matches the bookmarklet exactly.
export function isGoodLink(node: Node): boolean {
  return (
    node.nodeType === ELEMENT_NODE &&
    node.nodeName === 'A' &&
    !isNavLike(node as Element) &&
    (node as Element).firstElementChild === null
  );
}

// Raw text, an inline formatting element, or a good link — anything that
// joins the current text run instead of breaking it.
export function isTextish(node: Node): boolean {
  return (
    node.nodeType === TEXT_NODE ||
    TEXTISH_ELEMENTS.has(node.nodeName) ||
    isGoodLink(node)
  );
}

export function isIrrelevant(node: Node): boolean {
  return IRRELEVANT_ELEMENTS.has(node.nodeName);
}

export function isComment(node: Node): boolean {
  return node.nodeType === COMMENT_NODE;
}

export function isWhitespace(node: Node): boolean {
  return (
    node.nodeType === TEXT_NODE &&
    /^[\t\n\r ]+$/.test((node as CharacterData).data)
  );
}

// Ratio of all text to text inside direct-child <a> elements. Direct children
// only, mirroring the original's jQuery .children('a') — deeper links belong
// to descendants and are judged when the walk reaches them. Infinity when
// there are no link chars, preserving the original's "no links ⇒ not linkish"
// (its getLinkRatio returned undefined, and MIN_LINK_RATIO > undefined is
// false).
export function linkRatio(el: Element): number {
  let linkChars = 0;
  for (const child of el.children) {
    if (child.nodeName === 'A') linkChars += (child.textContent ?? '').length;
  }
  if (linkChars === 0) return Infinity;
  return (el.textContent ?? '').length / linkChars;
}

export function isLinkish(el: Element): boolean {
  return linkRatio(el) < MIN_LINK_RATIO;
}

// Worth recursing into during the walk?
export function isUseful(node: Node): boolean {
  return !(
    isWhitespace(node) ||
    isComment(node) ||
    isIrrelevant(node) ||
    (node.nodeType === ELEMENT_NODE && isLinkish(node as Element)) ||
    isGoodLink(node)
  );
}
