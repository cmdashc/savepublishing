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
const ABBREVIATION_RE =
  /\b(?:Mr|Mrs|Ms|Dr|Prof|Sen|Rep|Gov|Gen|Lt|Col|Sgt|Capt|Rev|Hon|St|No)\.\s*$/;

export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const { segment } of segmenter.segment(text)) {
    const prev = out[out.length - 1];
    if (prev !== undefined && ABBREVIATION_RE.test(prev)) {
      out[out.length - 1] = prev + segment;
    } else if (segment.trim() !== '') {
      out.push(segment);
    }
  }
  return out.map((s) => s.trim().replace(/\s+/g, ' ')).filter((s) => s !== '');
}
