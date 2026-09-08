export type WorshipStylePreference = "contemporary" | "hymn" | "blended" | "none";
export type WorshipPlatformPreference = "youtube" | "spotify" | "apple_music";

export type FamilyWorshipPreferences = {
  style: WorshipStylePreference;
  platform: WorshipPlatformPreference;
};

export type FamilyWorshipSong = {
  title: string;
  artist: string;
  connection: string;
};

export const DEFAULT_FAMILY_WORSHIP_PREFERENCES: FamilyWorshipPreferences = {
  style: "blended",
  platform: "youtube",
};

export function resolveFamilyWorshipPreferences(
  churchDefault?: Partial<FamilyWorshipPreferences>,
  requestedStyle?: string,
  requestedPlatform?: string,
): FamilyWorshipPreferences {
  const fallback = { ...DEFAULT_FAMILY_WORSHIP_PREFERENCES, ...churchDefault };
  const styles: WorshipStylePreference[] = ["contemporary", "hymn", "blended", "none"];
  const platforms: WorshipPlatformPreference[] = ["youtube", "spotify", "apple_music"];
  return {
    style: styles.includes(requestedStyle as WorshipStylePreference) ? requestedStyle as WorshipStylePreference : fallback.style,
    platform: platforms.includes(requestedPlatform as WorshipPlatformPreference) ? requestedPlatform as WorshipPlatformPreference : fallback.platform,
  };
}

export function buildWorshipSongUrl(song: FamilyWorshipSong, platform: WorshipPlatformPreference): string {
  const query = encodeURIComponent(`${song.title} ${song.artist}`.trim());
  if (platform === "spotify") return `https://open.spotify.com/search/${query}`;
  if (platform === "apple_music") return `https://music.apple.com/us/search?term=${query}`;
  return `https://www.youtube.com/results?search_query=${query}`;
}

export function injectWorshipSongUrl(html: string, song: FamilyWorshipSong, preferences: FamilyWorshipPreferences): string {
  if (preferences.style === "none") return html.replace(/<section\b[^>]*class=(['"])[^'"]*sm-section--worship[^'"]*\1[^>]*>[\s\S]*?<\/section>/gi, "");
  const url = buildWorshipSongUrl(song, preferences.platform);
  return html.replaceAll("{{SM_WORSHIP_SONG_URL}}", url);
}

export function validateFamilyV3Html(html: string, preferences: FamilyWorshipPreferences): void {
  if (!/sm-section--parent-note/.test(html)) throw new Error("Family V3 is missing the parent sermon setup.");
  const ageLabels = ["Pre-K & Kindergarten", "Elementary", "Middle School", "High School"];
  const groups = html.match(/<article\b[^>]*class=["'][^"']*sm-family-age-group[^"']*["'][^>]*>[\s\S]*?<\/article>/gi) || [];
  for (const label of ageLabels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const group = groups.find((item) => new RegExp(`<h3[^>]*>\\s*${escaped}\\s*<\\/h3>`, "i").test(item));
    if (!group) throw new Error(`Family V3 is missing the ${label} question group.`);
    const questions = group.match(/<li\b/gi)?.length || 0;
    if (questions < 1 || questions > 2) throw new Error(`Family V3 must include 1-2 questions for ${label}.`);
  }
  if (groups.length !== 4) throw new Error("Family V3 must include exactly four age groups.");
  if (preferences.style !== "none") {
    if (!/sm-section--worship/.test(html)) throw new Error("Family V3 is missing the worship recommendation.");
    if (!html.includes("{{SM_WORSHIP_SONG_URL}}")) throw new Error("Family V3 is missing the controlled worship-song link.");
  }
}

export function worshipPlatformLabel(platform: WorshipPlatformPreference): string {
  if (platform === "spotify") return "Spotify";
  if (platform === "apple_music") return "Apple Music";
  return "YouTube";
}
