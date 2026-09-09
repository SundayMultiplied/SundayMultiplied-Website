import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTOMATIC_SCRIPTURE_CHARACTER_LIMIT,
  AUTOMATIC_SCRIPTURE_VERSE_LIMIT,
  bibleGatewayPassageUrl,
  injectBsbScripture,
  scriptureHtml,
  shouldDisplayFullScripture,
} from "../worker/scripture-service.ts";

const preferences = (displayMode = "automatic", translation = "ESV") => ({
  translation,
  displayMode,
  provider: "bible_gateway",
});

const passage = (verseCount, text = "A short verse.") => ({
  reference: `John 1:1-${verseCount}`,
  translation: "BSB",
  verses: Array.from({ length: verseCount }, (_, index) => ({
    chapter: 1,
    verse: index + 1,
    text,
    paragraphBreakBefore: false,
  })),
});

test("automatic mode includes a complete passage at the 12-verse limit", () => {
  const input = passage(AUTOMATIC_SCRIPTURE_VERSE_LIMIT);
  const html = scriptureHtml(input, preferences());

  assert.equal(shouldDisplayFullScripture(input, preferences()), true);
  assert.match(html, /class="sm-scripture-text"/);
  assert.match(html, /Berean Standard Bible \(BSB\)/);
  assert.match(html, /Read John 1:1-12 in ESV on Bible Gateway/);
});

test("automatic mode uses only a reference and preferred-translation link above 12 verses", () => {
  const html = scriptureHtml(passage(AUTOMATIC_SCRIPTURE_VERSE_LIMIT + 1), preferences("automatic", "NIV"));

  assert.doesNotMatch(html, /class="sm-scripture-text"/);
  assert.match(html, /John 1:1-13 · NIV/);
  assert.match(html, /search=John\+1%3A1-13&amp;version=NIV/);
});

test("automatic mode applies the 3,000-character safety limit", () => {
  const input = passage(1, "x".repeat(AUTOMATIC_SCRIPTURE_CHARACTER_LIMIT + 1));

  assert.equal(shouldDisplayFullScripture(input, preferences()), false);
  assert.doesNotMatch(scriptureHtml(input, preferences()), /class="sm-scripture-text"/);
});

test("church display overrides remain authoritative", () => {
  assert.equal(shouldDisplayFullScripture(passage(13), preferences("full_text")), true);
  assert.equal(shouldDisplayFullScripture(passage(1), preferences("reference_link")), false);
});

test("Scripture injection replaces generated copy with the deterministic policy", () => {
  const source = '<main class="sm-document"><section class="sm-section sm-section--scripture"><p>Generated copy</p></section></main>';
  const html = injectBsbScripture(source, passage(13), preferences());

  assert.doesNotMatch(html, /Generated copy/);
  assert.doesNotMatch(html, /class="sm-scripture-text"/);
  assert.match(html, /class="sm-scripture-link"/);
});

test("Bible Gateway URLs preserve the full reference and selected translation", () => {
  assert.equal(
    bibleGatewayPassageUrl("Philippians 2:14-16", "NKJV"),
    "https://www.biblegateway.com/passage/?search=Philippians+2%3A14-16&version=NKJV",
  );
});
