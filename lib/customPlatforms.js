// Custom platform support (step 10).
//
// Users can define their own export targets (label + dimensions + folder) on top
// of the built-in spec platforms. These live only in the browser: persisted to
// localStorage, never synced to the server. The objects produced here are shaped
// to be indistinguishable from built-in spec platforms to the rest of the app —
// PlatformSelector, CropPreviewCell, and zipBuilder all consume the same fields —
// with a `custom: true` flag so the UI knows which entries are user-owned (and
// therefore removable).

import { slugify } from "@/lib/slugify";

const STORAGE_KEY = "ecomcrop:customPlatforms";

// Guardrails for the dimension inputs. Far larger than any real platform, but
// keeps a stray "100000" from allocating an absurd canvas at export time.
const MIN_DIMENSION = 1;
const MAX_DIMENSION = 20000;

// Built-in platforms omit these; custom platforms inherit sensible defaults so
// zipBuilder's format/quality handling matches the rest of the export pipeline.
const DEFAULT_FORMAT = "jpg";
const DEFAULT_QUALITY = 0.9;

// Reads and sanitizes the stored custom platforms. Returns [] on any problem
// (no storage, malformed JSON, partial corruption) rather than throwing, so a
// bad entry can never block the tool from loading.
export function loadCustomPlatforms() {
  if (typeof window === "undefined") return [];
  let raw;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set();
  const cleaned = [];
  for (const entry of parsed) {
    const platform = sanitizeStored(entry);
    if (platform && !seen.has(platform.id)) {
      seen.add(platform.id);
      cleaned.push(platform);
    }
  }
  return cleaned;
}

// Persists the full list, replacing whatever was there. Silent on failure
// (e.g. storage disabled or over quota) — persistence is a convenience, not a
// requirement for the current session to work.
export function persistCustomPlatforms(platforms) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(platforms));
  } catch {
    // ignore
  }
}

// Validates raw form input and, on success, returns a normalized platform object
// shaped like a spec platform. On failure returns an `error` message suitable
// for display next to the form.
//
//   createCustomPlatform({ label, width, height, folder })
//     → { platform }            (valid)
//     → { error: "message" }    (invalid)
export function createCustomPlatform({ label, width, height, folder } = {}) {
  const cleanLabel = String(label ?? "").trim();
  if (!cleanLabel) {
    return { error: "Enter a name for the platform." };
  }

  const w = parseDimension(width);
  const h = parseDimension(height);
  if (w === null || h === null) {
    return {
      error: `Width and height must be whole numbers between ${MIN_DIMENSION} and ${MAX_DIMENSION}.`,
    };
  }

  // Folder is optional in the form; default it to a slug of the label so exports
  // always land in a sensibly named directory.
  const cleanFolder = sanitizeFolder(folder) || slugify(cleanLabel, "custom");

  return {
    platform: {
      id: makeId(cleanLabel),
      label: cleanLabel,
      width: w,
      height: h,
      folder: cleanFolder,
      filename_suffix: slugify(cleanLabel, "custom"),
      format: DEFAULT_FORMAT,
      quality: DEFAULT_QUALITY,
      custom: true,
    },
  };
}

function parseDimension(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < MIN_DIMENSION || rounded > MAX_DIMENSION) return null;
  return rounded;
}

// Keep folder names to a single path segment: strip slashes and trim. (Nested
// folders are reserved for built-in specs like "Instagram/Feed".)
function sanitizeFolder(folder) {
  return String(folder ?? "")
    .replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeId(label) {
  const base = slugify(label, "custom");
  const suffix =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `custom-${base}-${suffix}`;
}

// Re-validates a single stored entry, rebuilding it through the same normalizer
// so older/hand-edited storage can't introduce malformed platforms.
function sanitizeStored(entry) {
  if (!entry || typeof entry !== "object") return null;
  const result = createCustomPlatform(entry);
  if (result.error) return null;
  // Preserve the original id when it's well-formed so selections/crops keep
  // referencing the same platform across reloads.
  const id =
    typeof entry.id === "string" && entry.id.startsWith("custom-")
      ? entry.id
      : result.platform.id;
  return { ...result.platform, id };
}
