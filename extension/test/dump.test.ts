// Eyeball pass, the successor to loading htdocs/test/tests.html in a browser:
//
//   DUMP=1 npx vitest run test/dump.test.ts
//   DUMP=1 DUMP_FIXTURE=mefi.html npx vitest run test/dump.test.ts
//
// Prints every extracted run and its sentences so a human can confirm the
// output reads like the article, not the chrome around it. Skipped in normal
// test runs.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { it } from 'vitest';
import { sentences } from '../src/extract/segment.js';
import { walk } from '../src/extract/walk.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

it.runIf(process.env.DUMP)('dumps extracted sentences from a fixture', () => {
  const fixture = process.env.DUMP_FIXTURE ?? 'nyt.html';
  const html = readFileSync(join(fixtureDir, fixture), 'utf8');
  const body = new JSDOM(html).window.document.body;

  let runCount = 0;
  let sentenceCount = 0;
  for (const run of walk(body)) {
    runCount += 1;
    console.log(`\n— run ${runCount} <${run.block.nodeName.toLowerCase()}>`);
    for (const s of sentences(run.text)) {
      sentenceCount += 1;
      console.log(`  • ${s}`);
    }
  }
  console.log(`\n${fixture}: ${runCount} runs, ${sentenceCount} sentences`);
});
