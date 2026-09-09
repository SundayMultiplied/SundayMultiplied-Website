export type ProductionQueueSort = "newest" | "oldest" | "church_asc" | "church_desc" | "series_asc" | "series_desc";
export type ChurchHistorySort = "newest" | "oldest" | "series_asc" | "series_desc";

type ProductionQueueItem = {
  id: string;
  churchSlug: string;
  churchName: string;
  weekOf: string;
  metadata: { seriesTitle?: string | null };
};

type ChurchHistoryItem = {
  id: string;
  weekOf: string;
  seriesTitle?: string | null;
};

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export function filterAndSortProductionJobs<T extends ProductionQueueItem>(
  jobs: T[],
  churchSlug: string,
  seriesTitle: string,
  sort: ProductionQueueSort,
) {
  return jobs
    .filter((job) => !churchSlug || job.churchSlug === churchSlug)
    .filter((job) => seriesMatches(job.metadata.seriesTitle, seriesTitle))
    .slice()
    .sort((a, b) => productionComparison(a, b, sort));
}

export function sortChurchHistory<T extends ChurchHistoryItem>(packages: T[], sort: ChurchHistorySort) {
  return packages.slice().sort((a, b) => {
    if (sort === "newest") return compareDates(b.weekOf, a.weekOf, a.id, b.id);
    if (sort === "oldest") return compareDates(a.weekOf, b.weekOf, a.id, b.id);
    const series = compareOptionalText(a.seriesTitle, b.seriesTitle, sort === "series_desc");
    return series || compareDates(b.weekOf, a.weekOf, a.id, b.id);
  });
}

export function productionSeriesOptions(jobs: ProductionQueueItem[], churchSlug = "") {
  return [...new Set(jobs
    .filter((job) => !churchSlug || job.churchSlug === churchSlug)
    .map((job) => cleanText(job.metadata.seriesTitle))
    .filter(Boolean))].sort(collator.compare);
}

export function hasUnassignedProductionSeries(jobs: ProductionQueueItem[], churchSlug = "") {
  return jobs.some((job) => (!churchSlug || job.churchSlug === churchSlug) && !cleanText(job.metadata.seriesTitle));
}

function productionComparison(a: ProductionQueueItem, b: ProductionQueueItem, sort: ProductionQueueSort) {
  if (sort === "newest") return compareDates(b.weekOf, a.weekOf, a.id, b.id);
  if (sort === "oldest") return compareDates(a.weekOf, b.weekOf, a.id, b.id);
  if (sort === "church_asc" || sort === "church_desc") {
    const church = compareText(a.churchName, b.churchName, sort === "church_desc");
    return church || compareDates(b.weekOf, a.weekOf, a.id, b.id);
  }
  const series = compareOptionalText(a.metadata.seriesTitle, b.metadata.seriesTitle, sort === "series_desc");
  return series || compareDates(b.weekOf, a.weekOf, a.id, b.id);
}

function seriesMatches(value: string | null | undefined, filter: string) {
  if (!filter) return true;
  if (filter === "__none") return !cleanText(value);
  return cleanText(value) === filter;
}

function compareOptionalText(a: string | null | undefined, b: string | null | undefined, descending: boolean) {
  const left = cleanText(a);
  const right = cleanText(b);
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return compareText(left, right, descending);
}

function compareText(a: string, b: string, descending: boolean) {
  const result = collator.compare(a, b);
  return descending ? -result : result;
}

function compareDates(a: string, b: string, aId: string, bId: string) {
  return a.localeCompare(b) || aId.localeCompare(bId);
}

function cleanText(value: string | null | undefined) {
  return String(value || "").trim();
}
