// Web Worker: crops + resizes a single image off the main thread (step 7).
//
// Each message is one job; the worker replies with a processed Blob (or an
// error), tagged with the job `id` so the orchestrator can route results.
//
// Decoding uses `imageOrientation: "from-image"` so EXIF-rotated photos are
// oriented exactly like the <img>/cropperjs preview the crop box was authored
// against. Without this, rotated phone photos would crop the wrong region.

// Largest rectangle of the given aspect ratio, centered — fallback when a combo
// has no stored crop box (e.g. the user generated before smartcrop finished).
function centerCropBox(width, height, aspectRatio) {
  let w = width;
  let h = w / aspectRatio;
  if (h > height) {
    h = height;
    w = h * aspectRatio;
  }
  return { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h };
}

// Keeps the crop box inside the decoded image, guarding against rounding drift.
function clampBox(box, maxWidth, maxHeight) {
  const x = Math.min(Math.max(box.x, 0), maxWidth);
  const y = Math.min(Math.max(box.y, 0), maxHeight);
  return {
    x,
    y,
    width: Math.max(1, Math.min(box.width, maxWidth - x)),
    height: Math.max(1, Math.min(box.height, maxHeight - y)),
  };
}

self.onmessage = async (event) => {
  const { id, file, cropBox, targetWidth, targetHeight, quality, mimeType } =
    event.data;

  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });

    const box = clampBox(
      cropBox || centerCropBox(bitmap.width, bitmap.height, targetWidth / targetHeight),
      bitmap.width,
      bitmap.height
    );

    const canvas = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      bitmap,
      box.x,
      box.y,
      box.width,
      box.height,
      0,
      0,
      targetWidth,
      targetHeight
    );
    if (typeof bitmap.close === "function") bitmap.close();

    // `quality` is honored for image/jpeg and image/webp; ignored for png.
    const blob = await canvas.convertToBlob({ type: mimeType, quality });
    self.postMessage({ id, blob });
  } catch (error) {
    self.postMessage({
      id,
      error: (error && error.message) || "Processing failed",
    });
  }
};
