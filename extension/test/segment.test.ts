import { describe, expect, it } from 'vitest';
import { sentences } from '../src/extract/segment.js';

// The tricky cases below are lifted verbatim from the comments in the old
// String::getStatements (htdocs/coffee/src/string.coffee) — they were the
// hand-rolled scanner's reasons to exist.
describe('sentences', () => {
  it('keeps an abbreviation-heavy sentence whole', () => {
    expect(sentences('I am calling you from the U.S.A.')).toEqual([
      'I am calling you from the U.S.A.',
    ]);
  });

  it('does not split at "p.m." mid-sentence', () => {
    expect(
      sentences('The time is 10 p.m., so there are two hours to go.'),
    ).toEqual(['The time is 10 p.m., so there are two hours to go.']);
  });

  it('keeps quoted dialogue with its attribution', () => {
    expect(sentences('“I have to be very honest,” he said.')).toEqual([
      '“I have to be very honest,” he said.',
    ]);
  });

  it('yields very short sentences', () => {
    expect(sentences('I cried.')).toEqual(['I cried.']);
  });

  it('does not split after a title abbreviation', () => {
    // V8's Intl.Segmenter splits "Mr. Taylor" without the suppression pass;
    // seen in the nyt.html fixture.
    expect(
      sentences('The performance was physical. Mr. Taylor is 83 now.'),
    ).toEqual(['The performance was physical.', 'Mr. Taylor is 83 now.']);
    expect(sentences('Sen. Reid spoke. Dr. K. listened.')).toEqual([
      'Sen. Reid spoke.',
      'Dr. K. listened.',
    ]);
  });

  it('splits a multi-sentence paragraph at the boundaries', () => {
    expect(
      sentences('It was cold. The harbor was empty! Would the ship return?'),
    ).toEqual([
      'It was cold.',
      'The harbor was empty!',
      'Would the ship return?',
    ]);
  });

  it('returns nothing for empty or whitespace-only input', () => {
    expect(sentences('')).toEqual([]);
    expect(sentences('  \n\t ')).toEqual([]);
  });
});
