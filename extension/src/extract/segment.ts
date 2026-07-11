// Sentence splitting. Replaces the bookmarklet's String::getStatements
// (htdocs/coffee/src/string.coffee), a hand-rolled character scanner, with
// Intl.Segmenter — which already handles most of the cases the old code
// special-cased (abbreviations like "U.S.A.", "10 p.m.", quoted dialogue).

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

// V8's Intl.Segmenter does not apply CLDR sentence-break suppressions, so
// "Mr. Taylor" splits after "Mr." (the old scanner's capital-near-the-period
// rule got this right). Segments ending in one of these title/style
// abbreviations are rejoined with the segment that follows. Titles only —
// they essentially never end a real sentence.
//
// "No" is deliberately excluded: unlike the others, it's a common
// standalone sentence in dialogue/narrative ("Was he home? No. He'd already
// left."), so suppressing the break after it would wrongly glue two
// sentences together.
const ABBREVIATION_RE =
  /\b(?:Mr|Mrs|Ms|Dr|Prof|Sen|Rep|Gov|Gen|Lt|Col|Sgt|Capt|Rev|Hon|St)\.\s*$/;

export interface SentenceSpan {
  /** Start index into the input text (inclusive). */
  start: number;
  /** End index into the input text (exclusive). */
  end: number;
  /** Raw slice of the input: text.slice(start, end). */
  text: string;
}

// Index spans of the sentences within `text`, abbreviation-merged but
// otherwise untrimmed, so callers can map them back onto their source
// (ranges.ts maps them onto DOM text nodes).
export function sentenceSpans(text: string): SentenceSpan[] {
  const out: { start: number; end: number }[] = [];
  for (const { segment, index } of segmenter.segment(text)) {
    const prev = out[out.length - 1];
    if (prev !== undefined && ABBREVIATION_RE.test(text.slice(prev.start, prev.end))) {
      prev.end = index + segment.length;
    } else if (segment.trim() !== '') {
      out.push({ start: index, end: index + segment.length });
    }
  }
  return out.map(({ start, end }) => ({ start, end, text: text.slice(start, end) }));
}

export function sentences(text: string): string[] {
  return sentenceSpans(text)
    .map((s) => s.text.trim().replace(/\s+/g, ' '))
    .filter((s) => s !== '');
}
