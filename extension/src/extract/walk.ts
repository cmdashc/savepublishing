// Non-destructive replacement for the bookmarklet's Node::unwrap +
// Array::merge (htdocs/coffee/src/node.coffee, array.coffee). Same grouping
// logic — contiguous "textish" siblings form one run, other nodes end the run
// and are recursed into if useful — but nothing in the DOM is emptied or
// rewritten.

import { ELEMENT_NODE, isTextish, isUseful, isWhitespace } from './classify.js';

export interface TextRun {
  /** Flattened, whitespace-collapsed text of the contiguous textish group. */
  text: string;
  /** The source nodes, in document order (for Range-building later). */
  nodes: Node[];
  /** The element whose childNodes produced this run. */
  block: Element;
}

export function* walk(root: Element): Generator<TextRun> {
  let group: Node[] = [];

  function* flush(block: Element): Generator<TextRun> {
    if (group.length === 0) return;
    const nodes = group;
    group = [];
    if (nodes.every(isWhitespace)) return;
    const text = nodes
      .map((n) => n.textContent ?? '')
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    if (text !== '') yield { text, nodes, block };
  }

  function* visit(block: Element): Generator<TextRun> {
    for (const node of Array.from(block.childNodes)) {
      // <br> is textish in the original (its __BR__ marker survived into the
      // tweet text); here it simply terminates the current run.
      if (node.nodeName === 'BR') {
        yield* flush(block);
      } else if (isTextish(node)) {
        group.push(node);
      } else {
        yield* flush(block);
        if (node.nodeType === ELEMENT_NODE && isUseful(node)) {
          yield* visit(node as Element);
        }
      }
    }
    // Trailing group, like the original's final texts.merge().
    yield* flush(block);
  }

  yield* visit(root);
}
