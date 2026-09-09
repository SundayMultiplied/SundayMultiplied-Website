import assert from "node:assert/strict";
import test from "node:test";

import {
  filterAndSortProductionJobs,
  hasUnassignedProductionSeries,
  productionSeriesOptions,
  sortChurchHistory,
} from "../components/dashboard-sorting.ts";

const jobs = [
  { id: "3", churchSlug: "compass", churchName: "Compass", weekOf: "2026-09-08", metadata: { seriesTitle: "The King and His Kingdom" } },
  { id: "2", churchSlug: "sample", churchName: "Sample Church", weekOf: "2026-09-07", metadata: { seriesTitle: "Beginnings" } },
  { id: "1", churchSlug: "compass", churchName: "Compass", weekOf: "2026-09-06", metadata: { seriesTitle: "" } },
];

test("production queue filters by church and series", () => {
  assert.deepEqual(filterAndSortProductionJobs(jobs, "compass", "The King and His Kingdom", "newest").map((job) => job.id), ["3"]);
  assert.deepEqual(filterAndSortProductionJobs(jobs, "compass", "__none", "newest").map((job) => job.id), ["1"]);
});

test("production queue sorts by church and series with unnamed series last", () => {
  assert.deepEqual(filterAndSortProductionJobs(jobs, "", "", "church_desc").map((job) => job.id), ["2", "3", "1"]);
  assert.deepEqual(filterAndSortProductionJobs(jobs, "", "", "series_asc").map((job) => job.id), ["2", "3", "1"]);
});

test("series filter options are unique and alphabetized", () => {
  assert.deepEqual(productionSeriesOptions([...jobs, { ...jobs[0], id: "4" }]), ["Beginnings", "The King and His Kingdom"]);
  assert.deepEqual(productionSeriesOptions(jobs, "compass"), ["The King and His Kingdom"]);
  assert.deepEqual(productionSeriesOptions(jobs, "sample"), ["Beginnings"]);
  assert.equal(hasUnassignedProductionSeries(jobs, "compass"), true);
  assert.equal(hasUnassignedProductionSeries(jobs, "sample"), false);
});

test("church history can be sorted by series while preserving newest-first within a series", () => {
  const packages = [
    { id: "a", weekOf: "2026-09-01", seriesTitle: "Romans" },
    { id: "b", weekOf: "2026-09-08", seriesTitle: "Acts" },
    { id: "c", weekOf: "2026-09-09", seriesTitle: "Romans" },
    { id: "d", weekOf: "2026-09-10", seriesTitle: null },
  ];
  assert.deepEqual(sortChurchHistory(packages, "series_asc").map((item) => item.id), ["b", "c", "a", "d"]);
});
