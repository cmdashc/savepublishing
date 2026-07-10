// Maps the sentences of a TextRun back onto the DOM as Ranges, so the
// content script can highlight and share exact sentences without the
// extraction layer ever mutating the page.
//
// walk.ts builds a run's text as
//   nodes.map(textContent).join('').replace(/\s+/g, ' ').trim()
// This module rebuilds that string character by character, keeping a map
// from every collapsed-text position to its source (text node, offset), then
// converts each sentence span from segment.ts into a DOM Range.

import { TEXT_NODE } from './classify.js';
import { sentenceSpans } from './segment.js';
import type { TextRun } from './walk.js';
import { walk } from './walk.js';

export interface SentenceRange {
  /** The sentence, trimmed and whitespace-collapsed. */
  sentence: string;
  /** DOM range covering exactly the sentence's characters. */
  range: Range;
}

interface CharSource {
  node: Text;
  offset: number;
}

function collectTextNodes(node: Node, out: Text[]): void {
  if (node.nodeType === TEXT_NODE) {
    out.push(node as Text);
    return;
  }
  for (const child of Array.from(node.childNodes)) collectTextNodes(child, out);
}

// Rebuild the whitespace-collapsed text of the run with one CharSource per
// emitted character. Collapsing mirrors walk.ts exactly: runs of \s become a
// single space (sourced from their first character), leading and trailing
// whitespace disappears.
function collapse(nodes: Node[]): { text: string; map: CharSource[] } {
  const textNodes: Text[] = [];
  for (const node of nodes) collectTextNodes(node, textNodes);

  let text = '';
  const map: CharSource[] = [];
  for (const node of textNodes) {
    const data = node.data;
    for (let offset = 0; offset < data.length; offset++) {
      const ch = data[offset]!;
      if (/\s/.test(ch)) {
        if (text === '' || text.endsWith(' ')) continue;
        text += ' ';
      } else {
        text += ch;
      }
      map.push({ node, offset });
    }
  }
  if (text.endsWith(' ')) {
    text = text.slice(0, -1);
    map.pop();
  }
  return { text, map };
}

export function sentenceRanges(run: TextRun): SentenceRange[] {
  const { text, map } = collapse(run.nodes);
  // If the rebuild ever diverges from walk.ts (it shouldn't — both apply the
  // same collapse), sentence offsets would point at the wrong characters;
  // returning nothing beats highlighting garbage.
  if (text !== run.text) return [];

  const doc = map[0]?.node.ownerDocument;
  if (!doc) return [];

  const out: SentenceRange[] = [];
  for (const span of sentenceSpans(text)) {
    let { start, end } = span;
    while (start < end && text[start] === ' ') start++;
    while (end > start && text[end - 1] === ' ') end--;
    if (start >= end) continue;

    const first = map[start]!;
    const last = map[end - 1]!;
    const range = doc.createRange();
    range.setStart(first.node, first.offset);
    range.setEnd(last.node, last.offset + 1);
    out.push({ sentence: text.slice(start, end), range });
  }
  return out;
}

// The full extraction pipeline: narrative runs → per-sentence DOM ranges.
export function extractSentences(root: Element): SentenceRange[] {
  const out: SentenceRange[] = [];
  for (const run of walk(root)) out.push(...sentenceRanges(run));
  return out;
}
