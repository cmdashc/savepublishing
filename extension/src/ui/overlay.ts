// Turns the extraction pipeline's sentence Ranges into page decoration —
// <span data-ql> wrappers with the original's red-on-white / #FAA-hover look
// — and cleanly reverses all of it. This is the only module that mutates the
// host page, and everything it does is undone by teardown(): spans are
// unwrapped and parents normalize()d back to their original text nodes.

import { ELEMENT_NODE, TEXT_NODE } from '../extract/classify.js';
import { extractSentences } from '../extract/ranges.js';
import { lastWords, quoteURL } from '../share/fragment.js';
import {
  closeShareMenu,
  defaultDeps,
  MENU_ATTR,
  shareSentence,
  type ShareDeps,
} from '../share/targets.js';
import { createToolbar, TOOLBAR_ATTR } from './toolbar.js';

export const SPAN_ATTR = 'data-ql';
const STYLE_ATTR = 'data-ql-style';
const HOVER_CLASS = 'ql-hover';

// Injected into the page (not the shadow tree): the wrappers live in page
// DOM, so their styling must out-shout the host page's own rules.
const PAGE_CSS = `
span[${SPAN_ATTR}] {
  color: #f00 !important;
  background: #fff !important;
  cursor: pointer;
}
span[${SPAN_ATTR}].${HOVER_CLASS} {
  background: #faa !important;
}
`;

export interface OverlayState {
  sentences: string[];
}

interface Handlers {
  over: (e: Event) => void;
  out: (e: Event) => void;
  click: (e: Event) => void;
  key: (e: Event) => void;
}

// Per-document bookkeeping that must survive until teardown. Keyed by
// document (not module-level singletons) so tests can drive several jsdom
// documents independently.
const hoverHandlers = new WeakMap<Document, Handlers>();
const overlayState = new WeakMap<Document, OverlayState>();

interface Boundary {
  sentence: string;
  startNode: Text;
  startOffset: number;
  endNode: Text;
  endOffset: number;
}

function nextInDocOrder(node: Node, root: Node): Node | null {
  if (node.firstChild) return node.firstChild;
  let n: Node | null = node;
  while (n && n !== root) {
    if (n.nextSibling) return n.nextSibling;
    n = n.parentNode;
  }
  return null;
}

// Wrap one sentence: split the boundary text nodes at the sentence edges,
// then wrap every text node inside in its own span. Range.surroundContents
// is useless here (it throws on partially-selected nodes); splitText keeps
// earlier sentences' (node, offset) snapshots valid as long as sentences are
// processed back-to-front, since a split only ever truncates text *after*
// the offsets earlier sentences point at.
function wrapSentence(doc: Document, b: Boundary, id: number): void {
  let { startNode, endNode } = b;
  if (b.endOffset < endNode.length) endNode.splitText(b.endOffset);
  if (b.startOffset > 0) {
    const rest = startNode.splitText(b.startOffset);
    if (startNode === endNode) endNode = rest;
    startNode = rest;
  }

  const nodes: Text[] = [];
  let n: Node | null = startNode;
  while (n) {
    if (n.nodeType === TEXT_NODE && (n as Text).length > 0) {
      nodes.push(n as Text);
    }
    if (n === endNode) break;
    n = nextInDocOrder(n, doc.body);
  }

  for (const text of nodes) {
    const span = doc.createElement('span');
    span.setAttribute(SPAN_ATTR, String(id));
    text.replaceWith(span);
    span.appendChild(text);
  }
}

function spansOf(doc: Document, id: string): Element[] {
  return Array.from(doc.querySelectorAll(`span[${SPAN_ATTR}="${id}"]`));
}

// nodeType check rather than instanceof: event targets from another realm
// (a manually constructed jsdom document in tests) aren't instances of this
// realm's Element.
function targetSpan(e: Event): Element | null {
  const target = e.target as Node | null;
  if (!target || target.nodeType !== ELEMENT_NODE) return null;
  return (target as Element).closest(`span[${SPAN_ATTR}]`);
}

export function isActive(doc: Document): boolean {
  return doc.querySelector(`style[${STYLE_ATTR}]`) !== null;
}

export interface SetupOptions {
  onClose: () => void;
  /** Share-environment overrides; defaults to the real window/chrome. */
  deps?: ShareDeps;
}

export function setup(doc: Document, opts: SetupOptions): OverlayState {
  if (isActive(doc)) return overlayState.get(doc) ?? { sentences: [] };

  const results = extractSentences(doc.body);

  // Snapshot every boundary before any mutation; ranges.ts always anchors
  // range ends inside text nodes.
  const boundaries: Boundary[] = results.map(({ sentence, range }) => ({
    sentence,
    startNode: range.startContainer as Text,
    startOffset: range.startOffset,
    endNode: range.endContainer as Text,
    endOffset: range.endOffset,
  }));

  // Back to front, so splits never disturb boundaries not yet processed.
  for (let i = boundaries.length - 1; i >= 0; i--) {
    wrapSentence(doc, boundaries[i]!, i);
  }

  const style = doc.createElement('style');
  style.setAttribute(STYLE_ATTR, '');
  style.textContent = PAGE_CSS;
  (doc.head ?? doc.documentElement).appendChild(style);

  const state: OverlayState = { sentences: boundaries.map((b) => b.sentence) };
  overlayState.set(doc, state);

  const deps =
    opts.deps ?? defaultDeps(doc.defaultView as unknown as Window & typeof globalThis);

  // A sentence may span several wrappers (inline markup breaks it up), so
  // hovering any of them lights up the whole sentence.
  const handlers: Handlers = {
    over: (e) => {
      const span = targetSpan(e);
      if (!span) return;
      for (const s of spansOf(doc, span.getAttribute(SPAN_ATTR)!)) {
        s.classList.add(HOVER_CLASS);
      }
    },
    out: (e) => {
      const span = targetSpan(e);
      if (!span) return;
      for (const s of spansOf(doc, span.getAttribute(SPAN_ATTR)!)) {
        s.classList.remove(HOVER_CLASS);
      }
    },
    // Capture phase, so a wrapped sentence inside the page's own <a> shares
    // instead of navigating. Clicks inside our menu/toolbar pass through to
    // their own handlers; clicks anywhere else dismiss the menu.
    click: (e) => {
      const target = e.target as Node | null;
      if (
        target &&
        target.nodeType === ELEMENT_NODE &&
        (target as Element).closest(`[${MENU_ATTR}], [${TOOLBAR_ATTR}]`)
      ) {
        return;
      }
      const span = targetSpan(e);
      if (!span) {
        closeShareMenu(doc);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const id = Number(span.getAttribute(SPAN_ATTR));
      const sentence = state.sentences[id];
      if (sentence === undefined) return;
      const prefix = id > 0 ? lastWords(state.sentences[id - 1]!, 5) : undefined;
      const url = quoteURL(doc, sentence, prefix);
      void shareSentence(doc, { sentence, url, anchor: span, deps });
    },
    key: (e) => {
      if ((e as KeyboardEvent).key === 'Escape') closeShareMenu(doc);
    },
  };
  doc.addEventListener('mouseover', handlers.over);
  doc.addEventListener('mouseout', handlers.out);
  doc.addEventListener('click', handlers.click, true);
  doc.addEventListener('keydown', handlers.key);
  hoverHandlers.set(doc, handlers);

  createToolbar(doc, { count: state.sentences.length, onClose: opts.onClose });
  return state;
}

export function teardown(doc: Document): void {
  closeShareMenu(doc);
  doc.querySelector(`[${TOOLBAR_ATTR}]`)?.remove();
  doc.querySelector(`style[${STYLE_ATTR}]`)?.remove();

  const parents = new Set<Node>();
  for (const span of Array.from(doc.querySelectorAll(`span[${SPAN_ATTR}]`))) {
    const parent = span.parentNode;
    span.replaceWith(...Array.from(span.childNodes));
    if (parent) parents.add(parent);
  }
  // Rejoin the text nodes splitText produced, restoring the original DOM
  // shape (and byte-identical innerHTML).
  for (const parent of parents) parent.normalize();

  const handlers = hoverHandlers.get(doc);
  if (handlers) {
    doc.removeEventListener('mouseover', handlers.over);
    doc.removeEventListener('mouseout', handlers.out);
    doc.removeEventListener('click', handlers.click, true);
    doc.removeEventListener('keydown', handlers.key);
    hoverHandlers.delete(doc);
  }
  overlayState.delete(doc);
}
