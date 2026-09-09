import assert from "node:assert/strict";
import test from "node:test";
import { injectResourceHeaderMetadata } from "../worker/resource-metadata.ts";

test("adds an available series title to existing resource metadata", () => {
  const html = '<header class="sm-header"><h1 class="sm-title">Serve Like the King</h1><p class="sm-meta">Matthew 18:1–14</p></header>';
  const result = injectResourceHeaderMetadata(html, {
    sermonTitle: "A Corrected Sermon Title",
    seriesTitle: "The King and His Kingdom",
    scripture: "Matthew 18:1–14",
    speaker: "Jacob Mock",
  }, "2026-09-06");
  assert.match(result, /Series: The King and His Kingdom/);
  assert.match(result, /<h1 class="sm-title">A Corrected Sermon Title<\/h1>/);
  assert.match(result, /Scripture: Matthew 18:1–14/);
  assert.match(result, /Speaker: Jacob Mock/);
  assert.match(result, /September 6, 2026/);
  assert.equal((result.match(/class="sm-meta"/g) || []).length, 1);
});

test("updates a title even when the sermon has no series", () => {
  const html = '<header class="sm-header"><h1 class="sm-title">Old title</h1><p class="sm-meta">Old metadata</p></header>';
  const result = injectResourceHeaderMetadata(html, { sermonTitle: "New title", speaker: "Pastor Name" }, "2026-09-06");

  assert.match(result, /<h1 class="sm-title">New title<\/h1>/);
  assert.doesNotMatch(result, /Old title|Old metadata/);
  assert.match(result, /Speaker: Pastor Name/);
});

test("omits the series label when no series is available", () => {
  const html = '<header class="sm-header"><h1 class="sm-title">A Sermon</h1></header>';
  const result = injectResourceHeaderMetadata(html, { scripture: "John 3:16" }, "2026-09-06");
  assert.doesNotMatch(result, /Series:/);
  assert.match(result, /Scripture: John 3:16/);
});

test("escapes supplied metadata before inserting it into HTML", () => {
  const html = '<header class="sm-header"><h1 class="sm-title">A Sermon</h1></header>';
  const result = injectResourceHeaderMetadata(html, { seriesTitle: 'Kingdom & "Mission"' }, "2026-09-06");
  assert.match(result, /Kingdom &amp; &quot;Mission&quot;/);
});
