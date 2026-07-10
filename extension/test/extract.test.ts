import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { sentences } from '../src/extract/segment.js';
import { walk, type TextRun } from '../src/extract/walk.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

// Default JSDOM config: scripts are not executed and nothing is fetched, so
// the saved pages' remote script tags are inert.
function loadFixture(name: string): Element {
  const html = readFileSync(join(fixtureDir, name), 'utf8');
  return new JSDOM(html).window.document.body;
}

function runsOf(root: Element): TextRun[] {
  return [...walk(root)];
}

describe('walk on inline snippets', () => {
  function body(html: string): Element {
    return new JSDOM(`<body>${html}</body>`).window.document.body;
  }

  it('groups contiguous text, inline formatting, and good links into one run', () => {
    const runs = runsOf(
      body('<p>Alpha <em>beta</em> <a href="#">gamma</a> delta.</p>'),
    );
    expect(runs.map((r) => r.text)).toEqual(['Alpha beta gamma delta.']);
    // text, em, text, a, text
    expect(runs[0]!.nodes).toHaveLength(5);
    expect(runs[0]!.block.nodeName).toBe('P');
  });

  it('skips link-menu blocks but keeps surrounding prose', () => {
    const runs = runsOf(
      body(
        '<p>Before the menu.</p>' +
          '<div class="nav"><a href="#">Home</a> <a href="#">About</a></div>' +
          '<p>After the menu.</p>',
      ),
    );
    expect(runs.map((r) => r.text)).toEqual([
      'Before the menu.',
      'After the menu.',
    ]);
  });

  it('ends the current run at <br>', () => {
    const runs = runsOf(body('<p>line one<br>line two</p>'));
    expect(runs.map((r) => r.text)).toEqual(['line one', 'line two']);
  });

  it('splits runs around non-textish children and recurses into them', () => {
    const runs = runsOf(
      body('<div>Intro text.<blockquote>Quoted words.</blockquote>Outro text.</div>'),
    );
    expect(runs.map((r) => r.text)).toEqual([
      'Intro text.',
      'Quoted words.',
      'Outro text.',
    ]);
  });

  it('ignores comments, headings, and whitespace-only groups', () => {
    const runs = runsOf(
      body('<h2>Headline</h2>\n<!-- hidden -->\n<p>Only this survives.</p>'),
    );
    expect(runs.map((r) => r.text)).toEqual(['Only this survives.']);
  });

  it('does not mutate the DOM', () => {
    const el = body('<p>Alpha <em>beta</em>.</p><div class="nav"><a href="#">x</a></div>');
    const before = el.innerHTML;
    runsOf(el);
    expect(el.innerHTML).toBe(before);
  });
});

// For each saved page: known narrative sentences must come through, known
// chrome must not, and the total sentence count is pinned within bounds
// recorded from the first green run (regression tripwires, not exact specs).
describe.each([
  {
    fixture: 'links.html',
    present: 'Whales approach the city’s shores on occasion',
    absent: ['Advertisers', 'Technology'],
    bounds: [6, 12],
  },
  {
    fixture: 'nyt.html',
    present: 'Mr. Taylor is 83 now',
    absent: ['MOST E-MAILED', 'RECOMMENDED FOR YOU'],
    bounds: [15, 30],
  },
  {
    fixture: 'mefi.html',
    present: 'Founded 16 years ago by a couple of refugees from Microsoft',
    absent: ['My Profile', 'Recent Activity'],
    bounds: [80, 140],
  },
  {
    fixture: 'tests.html',
    present: 'For Op-Ed, follow @nytopinion',
    absent: ['In Flurry of Activity', 'Enlarge This Image'],
    bounds: [1, 5],
  },
  {
    fixture: 'whitman_leaves_of_grass.html',
    present: 'Come, said my soul',
    // Pure-narrative fixture: the only chrome is its <h1>/<h2> headings,
    // whose text also occurs legitimately inside the CONTENTS list — so
    // assert no run consists of a heading alone.
    absent: [/^LEAVES OF GRASS$/, /^By Walt Whitman$/],
    bounds: [3500, 5000],
  },
] as const)('$fixture', ({ fixture, present, absent, bounds }) => {
  const runs = runsOf(loadFixture(fixture));
  const texts = runs.map((r) => r.text);
  const allSentences = texts.flatMap((t) => sentences(t));

  it('extracts the known narrative sentence', () => {
    expect(texts.some((t) => t.includes(present))).toBe(true);
  });

  it('drops known chrome/boilerplate', () => {
    for (const needle of absent) {
      const hit = texts.some((t) =>
        typeof needle === 'string' ? t.includes(needle) : needle.test(t),
      );
      expect(hit, `found "${needle}"`).toBe(false);
    }
  });

  it('yields a sentence count within the pinned bounds', () => {
    expect(allSentences.length).toBeGreaterThanOrEqual(bounds[0]);
    expect(allSentences.length).toBeLessThanOrEqual(bounds[1]);
  });
});
