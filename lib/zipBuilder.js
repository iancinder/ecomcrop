// Orchestrates step 7: spreads crop+resize jobs across a small Web Worker pool,
// packs the results into a single zip, and triggers the download.
//
// JSZip and file-saver are imported dynamically so they only load on the client
// at generate time (and never during SSR).

import { slugify } from "@/lib/slugify";

// Maps a spec `format` to a file extension + MIME type. The PRD's spec uses
// "jpg"; custom platforms (step 10) may omit format, so we default to jpg.
const FORMATS = {
  jpg: { ext: "jpg", mime: "image/jpeg" },
  jpeg: { ext: "jpg", mime: "image/jpeg" },
  png: { ext: "png", mime: "image/png" },
  webp: { ext: "webp", mime: "image/webp" },
};

function formatFor(format) {
  return FORMATS[String(format || "jpg").toLowerCase()] || FORMATS.jpg;
}

// Built-in platforms carry `filename_suffix`; custom platforms don't, so fall
// back to a slug of the label.
function suffixFor(platform) {
  return platform.filename_suffix || slugify(platform.label, "platform");
}

// Builds the full list of jobs (one per photo × platform), each with its final
// zip path. Filenames: `{keyword}-{suffix}-{index}.{ext}`, index reset and
// zero-padded per platform folder.
function buildJobs({ photos, platforms, keyword, cropData }) {
  const baseSlug = slugify(keyword, "product");
  const padWidth = Math.max(2, String(photos.length).length);
  const jobs = [];

  for (const platform of platforms) {
    const { ext, mime } = formatFor(platform.format);
    const suffix = suffixFor(platform);

    photos.forEach((photo, i) => {
      const index = String(i + 1).padStart(padWidth, "0");
      jobs.push({
        path: `${platform.folder}/${baseSlug}-${suffix}-${index}.${ext}`,
        file: photo.file,
        cropBox: cropData.get(`${photo.id}:${platform.id}`) || null,
        targetWidth: platform.width,
        targetHeight: platform.height,
        quality: typeof platform.quality === "number" ? platform.quality : 0.9,
        mimeType: mime,
      });
    });
  }

  return jobs;
}

// Runs jobs across a capped pool of workers, pulling the next job as each
// worker frees up. Resolves to an array of outcomes ({ blob } | { error })
// indexed to match `jobs`.
function processJobs(jobs, onProgress) {
  const total = jobs.length;
  if (total === 0) return Promise.resolve([]);

  const poolSize = Math.min(
    total,
    4,
    Math.max(1, navigator.hardwareConcurrency || 2)
  );
  const outcomes = new Array(total);
  let cursor = 0;
  let completed = 0;

  return new Promise((resolve) => {
    let live = 0;

    const retire = (worker) => {
      worker.terminate();
      live -= 1;
      if (live === 0) resolve(outcomes);
    };

    const assign = (worker) => {
      if (cursor >= total) {
        retire(worker);
        return;
      }
      const id = cursor;
      cursor += 1;
      const job = jobs[id];
      worker.postMessage({
        id,
        file: job.file,
        cropBox: job.cropBox,
        targetWidth: job.targetWidth,
        targetHeight: job.targetHeight,
        quality: job.quality,
        mimeType: job.mimeType,
      });
    };

    const workers = [];
    for (let i = 0; i < poolSize; i += 1) {
      const worker = new Worker(
        new URL("../workers/cropWorker.js", import.meta.url),
        { type: "module" }
      );
      live += 1;
      worker.onmessage = (event) => {
        const { id, blob, error } = event.data;
        outcomes[id] = error ? { error } : { blob };
        completed += 1;
        onProgress?.(completed, total);
        assign(worker);
      };
      worker.onerror = () => {
        // The worker self-catches, so this is a last resort; don't stall.
        retire(worker);
      };
      workers.push(worker);
    }

    workers.forEach(assign);
  });
}

// Public entry point. Returns { total, failed } so the UI can report partial
// failures. Skips the download entirely only if every job failed.
export async function generateAndDownloadZip({
  photos,
  platforms,
  keyword,
  cropData,
  onProgress,
}) {
  const jobs = buildJobs({ photos, platforms, keyword, cropData });
  if (jobs.length === 0) return { total: 0, failed: 0 };

  const outcomes = await processJobs(jobs, onProgress);

  const [jszipMod, fileSaverMod] = await Promise.all([
    import("jszip"),
    import("file-saver"),
  ]);
  const JSZip = jszipMod.default || jszipMod;
  // file-saver is UMD; the named export may sit on the module or on .default.
  const saveAs =
    fileSaverMod.saveAs || fileSaverMod.default?.saveAs || fileSaverMod.default;

  const zip = new JSZip();
  let failed = 0;

  outcomes.forEach((outcome, i) => {
    if (outcome && outcome.blob) {
      zip.file(jobs[i].path, outcome.blob);
    } else {
      failed += 1;
    }
  });

  if (failed < jobs.length) {
    const zipBlob = await zip.generateAsync({ type: "blob" });
    saveAs(zipBlob, "ecomcrop-export.zip");
  }

  return { total: jobs.length, failed };
}
