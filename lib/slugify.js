// Turns a free-text value into a filename-safe slug:
// lowercase, accents stripped, runs of non-alphanumerics collapsed to single
// hyphens, leading/trailing hyphens trimmed. Returns `fallback` when the input
// slugifies to nothing (e.g. empty keyword → "product").
export function slugify(value, fallback = "product") {
  const slug = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}
