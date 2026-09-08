import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildWorshipSongUrl,
  injectWorshipSongUrl,
  resolveFamilyWorshipPreferences,
  validateFamilyV3Html,
} from "../worker/family-resource.ts";

const jacobSong = {
  title: "Yet Not I But Through Christ in Me",
  artist: "CityAlight",
  connection: "Reinforces the sermon’s call to cling to the gospel instead of complaining.",
};

test("resolves church family worship defaults and weekly overrides", () => {
  assert.deepEqual(resolveFamilyWorshipPreferences({ style: "contemporary", platform: "youtube" }), { style: "contemporary", platform: "youtube" });
  assert.deepEqual(resolveFamilyWorshipPreferences({ style: "contemporary", platform: "youtube" }, "hymn", "spotify"), { style: "hymn", platform: "spotify" });
  assert.deepEqual(resolveFamilyWorshipPreferences(undefined, "invalid", "invalid"), { style: "blended", platform: "youtube" });
});

test("builds encoded, platform-controlled song discovery links", () => {
  assert.equal(buildWorshipSongUrl(jacobSong, "youtube"), "https://www.youtube.com/results?search_query=Yet%20Not%20I%20But%20Through%20Christ%20in%20Me%20CityAlight");
  assert.equal(buildWorshipSongUrl(jacobSong, "spotify"), "https://open.spotify.com/search/Yet%20Not%20I%20But%20Through%20Christ%20in%20Me%20CityAlight");
  assert.equal(buildWorshipSongUrl(jacobSong, "apple_music"), "https://music.apple.com/us/search?term=Yet%20Not%20I%20But%20Through%20Christ%20in%20Me%20CityAlight");
});

test("injects the controlled link or removes worship when disabled", () => {
  const html = '<section class="sm-section sm-section--worship"><a class="sm-worship-link" href="{{SM_WORSHIP_SONG_URL}}">Play</a></section><section class="sm-section sm-section--prayer">Pray</section>';
  assert.match(injectWorshipSongUrl(html, jacobSong, { style: "contemporary", platform: "youtube" }), /youtube\.com\/results\?search_query=/);
  const disabled = injectWorshipSongUrl(html, jacobSong, { style: "none", platform: "youtube" });
  assert.doesNotMatch(disabled, /sm-section--worship/);
  assert.match(disabled, /sm-section--prayer/);
});

test("validates the four age groups and controlled worship link", () => {
  const groups = ["Pre-K & Kindergarten", "Elementary", "Middle School", "High School"].map((label) => `<article class="sm-family-age-group"><h3>${label}</h3><ol><li>A sermon-tied question</li></ol></article>`).join("");
  const html = `<section class="sm-section sm-section--parent-note">Parent setup</section><section class="sm-section sm-section--family-questions">${groups}</section><section class="sm-section sm-section--worship"><a href="{{SM_WORSHIP_SONG_URL}}">Play</a></section>`;
  assert.doesNotThrow(() => validateFamilyV3Html(html, { style: "contemporary", platform: "youtube" }));
  assert.throws(() => validateFamilyV3Html(html.replace("Middle School", "Older Kids"), { style: "contemporary", platform: "youtube" }), /Middle School/);
});

test("V3 family contract assumes younger children did not hear the sermon", async () => {
  const production = await readFile(new URL("../worker/production-api.ts", import.meta.url), "utf8");
  for (const label of ["Pre-K & Kindergarten", "Elementary", "Middle School", "High School"]) assert.match(production, new RegExp(label.replace("&", "\\&")));
  assert.match(production, /did not attend or hear the Sunday sermon/);
  assert.match(production, /Never ask them to remember what the pastor said/);
  assert.match(production, /strong, explicit connection to the sermon's supported big idea/);
  assert.match(production, /\{\{SM_WORSHIP_SONG_URL\}\}/);
});
