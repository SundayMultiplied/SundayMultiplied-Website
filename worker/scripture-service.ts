export type BsbPassage = {
  reference: string;
  translation: "BSB";
  verses: Array<{ chapter: number; verse: number; text: string }>;
};

const BOOK_IDS: Record<string, string> = {
  genesis: "GEN", gen: "GEN", exodus: "EXO", exod: "EXO", ex: "EXO", leviticus: "LEV", lev: "LEV",
  numbers: "NUM", num: "NUM", deuteronomy: "DEU", deut: "DEU", dt: "DEU", joshua: "JOS", josh: "JOS",
  judges: "JDG", judg: "JDG", ruth: "RUT", "1 samuel": "1SA", "1 sam": "1SA", "2 samuel": "2SA", "2 sam": "2SA",
  "1 kings": "1KI", "1 kgs": "1KI", "2 kings": "2KI", "2 kgs": "2KI", "1 chronicles": "1CH", "1 chron": "1CH", "1 chr": "1CH",
  "2 chronicles": "2CH", "2 chron": "2CH", "2 chr": "2CH", ezra: "EZR", nehemiah: "NEH", neh: "NEH", esther: "EST", esth: "EST",
  job: "JOB", psalms: "PSA", psalm: "PSA", ps: "PSA", proverbs: "PRO", prov: "PRO", ecclesiastes: "ECC", eccl: "ECC",
  "song of solomon": "SNG", "song of songs": "SNG", song: "SNG", isaiah: "ISA", isa: "ISA", jeremiah: "JER", jer: "JER",
  lamentations: "LAM", lam: "LAM", ezekiel: "EZK", ezek: "EZK", daniel: "DAN", dan: "DAN", hosea: "HOS", hos: "HOS",
  joel: "JOL", amos: "AMO", obadiah: "OBA", obad: "OBA", jonah: "JON", micah: "MIC", mic: "MIC", nahum: "NAM", nah: "NAM",
  habakkuk: "HAB", hab: "HAB", zephaniah: "ZEP", zeph: "ZEP", haggai: "HAG", hag: "HAG", zechariah: "ZEC", zech: "ZEC",
  malachi: "MAL", mal: "MAL", matthew: "MAT", matt: "MAT", mt: "MAT", mark: "MRK", mk: "MRK", luke: "LUK", lk: "LUK",
  john: "JHN", jn: "JHN", acts: "ACT", romans: "ROM", rom: "ROM", "1 corinthians": "1CO", "1 cor": "1CO", "2 corinthians": "2CO", "2 cor": "2CO",
  galatians: "GAL", gal: "GAL", ephesians: "EPH", eph: "EPH", philippians: "PHP", phil: "PHP", colossians: "COL", col: "COL",
  "1 thessalonians": "1TH", "1 thess": "1TH", "2 thessalonians": "2TH", "2 thess": "2TH", "1 timothy": "1TI", "1 tim": "1TI",
  "2 timothy": "2TI", "2 tim": "2TI", titus: "TIT", philemon: "PHM", phlm: "PHM", hebrews: "HEB", heb: "HEB",
  james: "JAS", jas: "JAS", "1 peter": "1PE", "1 pet": "1PE", "2 peter": "2PE", "2 pet": "2PE", "1 john": "1JN", "1 jn": "1JN",
  "2 john": "2JN", "2 jn": "2JN", "3 john": "3JN", "3 jn": "3JN", jude: "JUD", revelation: "REV", rev: "REV",
};

type ParsedReference = {
  reference: string;
  bookId: string;
  startChapter: number;
  startVerse?: number;
  endChapter: number;
  endVerse?: number;
};

export async function resolveBsbPassage(reference: string): Promise<BsbPassage> {
  const parsed = parseReference(reference);
  if (!parsed) throw new Error(`Unable to resolve Scripture reference “${reference}”.`);
  if (parsed.endChapter - parsed.startChapter > 8) throw new Error("Primary Scripture passage is too large to include automatically.");

  const verses: BsbPassage["verses"] = [];
  for (let chapter = parsed.startChapter; chapter <= parsed.endChapter; chapter += 1) {
    const response = await fetch(`https://bible.helloao.org/api/BSB/${parsed.bookId}/${chapter}.json`, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`BSB Scripture lookup failed for ${reference} (HTTP ${response.status}).`);
    const data = await response.json() as {
      chapter?: { content?: Array<{ type?: string; number?: number; content?: unknown[] }> };
    };
    const chapterVerses = (data.chapter?.content || []).filter((item) => item.type === "verse" && Number.isInteger(item.number));
    for (const item of chapterVerses) {
      const verse = Number(item.number);
      if (chapter === parsed.startChapter && parsed.startVerse && verse < parsed.startVerse) continue;
      if (chapter === parsed.endChapter && parsed.endVerse && verse > parsed.endVerse) continue;
      verses.push({ chapter, verse, text: flattenVerseContent(item.content || []) });
    }
  }

  if (!verses.length) throw new Error(`No BSB verses were returned for ${reference}.`);
  return { reference: parsed.reference, translation: "BSB", verses };
}

export function injectBsbScripture(html: string, passage: BsbPassage) {
  const section = `<section class="sm-section sm-section--scripture" data-sm-scripture="primary">\n<h2>Scripture</h2>\n${scriptureHtml(passage)}\n</section>`;
  const existing = /<section\b[^>]*class=["'][^"']*sm-section--scripture[^"']*["'][^>]*>[\s\S]*?<\/section>/i;
  if (existing.test(html)) return html.replace(existing, section);

  const headerEnd = /<\/header>/i;
  if (headerEnd.test(html)) return html.replace(headerEnd, (match) => `${match}\n${section}`);

  const mainStart = /<main\b[^>]*class=["'][^"']*sm-document[^"']*["'][^>]*>/i;
  if (mainStart.test(html)) return html.replace(mainStart, (match) => `${match}\n${section}`);

  throw new Error("Generated resource is missing the Sunday Multiplied document structure required for Scripture injection.");
}

export function scriptureHtml(passage: BsbPassage) {
  const spansChapters = passage.verses.some((verse) => verse.chapter !== passage.verses[0]?.chapter);
  const body = passage.verses.map((item) => {
    const label = spansChapters ? `${item.chapter}:${item.verse}` : String(item.verse);
    return `<p class="sm-scripture-verse"><sup class="sm-verse-number">${label}</sup> ${escapeHtml(item.text)}</p>`;
  }).join("\n");
  return `<p class="sm-scripture-reference">${escapeHtml(passage.reference)} · Berean Standard Bible (BSB)</p>\n<div class="sm-scripture-text">\n${body}\n</div>\n<p class="sm-scripture-attribution">Scripture quotations are from the Berean Standard Bible (BSB), dedicated to the public domain.</p>`;
}

function parseReference(input: string): ParsedReference | null {
  const reference = input.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
  const match = reference.match(/^(.+?)\s+(\d+)(?::(\d+))?(?:\s*-\s*(?:(\d+):)?(\d+))?$/i);
  if (!match) return null;
  const bookKey = normalizeBook(match[1]);
  const bookId = BOOK_IDS[bookKey];
  if (!bookId) return null;

  const startChapter = Number(match[2]);
  const startVerse = match[3] ? Number(match[3]) : undefined;
  let endChapter = startChapter;
  let endVerse: number | undefined;

  if (match[5]) {
    if (match[4]) {
      endChapter = Number(match[4]);
      endVerse = Number(match[5]);
    } else if (startVerse) {
      endVerse = Number(match[5]);
    } else {
      endChapter = Number(match[5]);
    }
  } else if (startVerse) {
    endVerse = startVerse;
  }

  if (startChapter < 1 || endChapter < startChapter) return null;
  if (startVerse && startVerse < 1) return null;
  if (endVerse && endVerse < 1) return null;

  return { reference, bookId, startChapter, startVerse, endChapter, endVerse };
}

function normalizeBook(value: string) {
  return value.toLowerCase().replace(/\./g, "").replace(/^first\s+/, "1 ").replace(/^second\s+/, "2 ").replace(/^third\s+/, "3 ").trim();
}

function flattenVerseContent(content: unknown[]): string {
  return content.map((item) => {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return "";
    const value = item as Record<string, unknown>;
    if (typeof value.text === "string") return value.text;
    if (value.lineBreak === true) return " ";
    return "";
  }).join("").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
