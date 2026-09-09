export type ResourceHeaderMetadata = {
  sermonTitle?: string | null;
  seriesTitle?: string | null;
  scripture?: string | null;
  speaker?: string | null;
};

export function injectResourceHeaderMetadata(html: string, metadata: ResourceHeaderMetadata, weekOf: string) {
  const parts = [
    metadata.seriesTitle ? `Series: ${metadata.seriesTitle}` : "",
    metadata.scripture ? `Scripture: ${metadata.scripture}` : "",
    metadata.speaker ? `Speaker: ${metadata.speaker}` : "",
    formatSermonDate(weekOf),
  ].filter(Boolean);
  if (!parts.length) return html;

  const meta = `<p class="sm-meta">${parts.map(escapeHtml).join(" · ")}</p>`;
  const existing = /<p\b[^>]*class=["'][^"']*\bsm-meta\b[^"']*["'][^>]*>[\s\S]*?<\/p>/i;
  if (existing.test(html)) return html.replace(existing, meta);

  const headerEnd = /<\/header>/i;
  return headerEnd.test(html) ? html.replace(headerEnd, `${meta}\n</header>`) : html;
}

function formatSermonDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] || character);
}
