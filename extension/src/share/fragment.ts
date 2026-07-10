// Where a shared quote points: the page's best URL (canonical when it says
// so — port of getBestURL, htdocs/coffee/src/init.coffee) plus a #:~:text=
// text fragment so the link lands with the exact sentence highlighted.

export function getBestURL(doc: Document): string {
  const base = doc.location?.href ?? '';
  const href = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  let url: URL;
  try {
    // Relative canonical hrefs resolve against the page, as the old code did
    // with string concatenation.
    url = new URL(href || base, base);
  } catch {
    url = new URL(base);
  }
  url.hash = '';
  return url.toString();
}

// Text-fragment encoding: encodeURIComponent already covers `,` and `&`;
// `-` is a fragment-directive delimiter and must be escaped by hand.
export function encodeFragmentText(s: string): string {
  return encodeURIComponent(s).replace(/-/g, '%2D');
}

export function lastWords(s: string, n: number): string {
  return s.split(' ').slice(-n).join(' ');
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    count++;
    i = haystack.indexOf(needle, i + 1);
  }
  return count;
}

// Best URL + #:~:text= for one sentence. When the sentence occurs more than
// once in the page text, `prefix` (the few words preceding it — the caller
// knows the neighboring sentence) disambiguates via the prefix-,text syntax.
export function quoteURL(doc: Document, sentence: string, prefix?: string): string {
  const url = getBestURL(doc);
  const bodyText = (doc.body?.textContent ?? '').replace(/\s+/g, ' ');
  const ambiguous = countOccurrences(bodyText, sentence) > 1;
  let fragment = encodeFragmentText(sentence);
  if (ambiguous && prefix) {
    fragment = `${encodeFragmentText(prefix)}-,${fragment}`;
  }
  return `${url}#:~:text=${fragment}`;
}
