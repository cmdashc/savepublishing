import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { extractSentences, sentenceRanges } from '../src/extract/ranges.js';
import { sentenceSpans, sentences } from '../src/extract/segment.js';
import { walk } from '../src/extract/walk.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

function body(html: string): Element {
  return new JSDOM(`<body>${html}</body>`).window.document.body;
}

function collapsed(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

describe('sentenceSpans', () => {
  it('returns spans that slice back out of the input', () => {
    const text = 'One thing here. Two continues here. Three more words.';
    for (const span of sentenceSpans(text)) {
      expect(text.slice(span.start, span.end)).toBe(span.text);
    }
    expect(sentenceSpans(text).map((s) => s.text.trim())).toEqual([
      'One thing here.',
      'Two continues here.',
      'Three more words.',
    ]);
  });

  it('merges title abbreviations into one span', () => {
    const text = 'Mr. Taylor is 83 now. He remembers.';
    const spans = sentenceSpans(text);
    expect(spans.map((s) => s.text.trim())).toEqual([
      'Mr. Taylor is 83 now.',
      'He remembers.',
    ]);
  });

  it('keeps sentences() behavior unchanged', () => {
    expect(sentences('  He said "stop."   Then quiet.  ')).toEqual([
      'He said "stop."',
      'Then quiet.',
    ]);
  });
});

describe('sentenceRanges', () => {
  it('maps each sentence of a plain run to a Range covering exactly its text', () => {
    const root = body('<p>One thing here. Two continues here. Three more words.</p>');
    const [run] = [...walk(root)];
    const results = sentenceRanges(run!);
    expect(results.map((r) => r.sentence)).toEqual([
      'One thing here.',
      'Two continues here.',
      'Three more words.',
    ]);
    for (const { sentence, range } of results) {
      expect(collapsed(range.toString())).toBe(sentence);
    }
  });

  it('builds ranges across inline-element boundaries', () => {
    const root = body(
      '<p>One thing here. <em>Two</em> continues <a href="#">here</a> now. Three more words.</p>',
    );
    const [run] = [...walk(root)];
    const results = sentenceRanges(run!);
    expect(results.map((r) => r.sentence)).toEqual([
      'One thing here.',
      'Two continues here now.',
      'Three more words.',
    ]);
    for (const { sentence, range } of results) {
      expect(collapsed(range.toString())).toBe(sentence);
    }
  });

  it('survives messy whitespace between and inside nodes', () => {
    const root = body('<p>\n  Spaced   out.\n\n  <em> Very </em>\t spaced.  </p>');
    const [run] = [...walk(root)];
    const results = sentenceRanges(run!);
    expect(results.map((r) => r.sentence)).toEqual(['Spaced out.', 'Very spaced.']);
    for (const { sentence, range } of results) {
      expect(collapsed(range.toString())).toBe(sentence);
    }
  });

  it('does not mutate the DOM', () => {
    const root = body('<p>Alpha beta. Gamma <em>delta</em>.</p>');
    const before = root.innerHTML;
    for (const run of walk(root)) sentenceRanges(run);
    expect(root.innerHTML).toBe(before);
  });
});

describe('extractSentences on fixtures', () => {
  it.each(['nyt.html', 'mefi.html', 'links.html'])(
    '%s: every range round-trips its sentence text',
    (fixture) => {
      const html = readFileSync(join(fixtureDir, fixture), 'utf8');
      const root = new JSDOM(html).window.document.body;
      const results = extractSentences(root);
      expect(results.length).toBeGreaterThan(0);
      for (const { sentence, range } of results) {
        expect(collapsed(range.toString())).toBe(sentence);
      }
    },
  );

  it('yields the same sentences the segmenter finds in each run', () => {
    const html = readFileSync(join(fixtureDir, 'nyt.html'), 'utf8');
    const root = new JSDOM(html).window.document.body;
    const fromRuns = [...walk(root)].flatMap((run) => sentences(run.text));
    const fromRanges = extractSentences(root).map((r) => r.sentence);
    expect(fromRanges).toEqual(fromRuns);
  });
});
