// Wraps smartcrop.js into a single call that always resolves to a crop box in
// the source image's natural pixel coordinates: { x, y, width, height }.
//
// smartcrop is imported dynamically so it never evaluates during server
// rendering — it's only pulled in on the client when a cell needs a crop.

// smartcrop scores candidate crops on a downscaled copy of the image, so the
// absolute size passed in only needs to encode the target aspect ratio. We
// normalize to a small box (max side ~100) to keep scoring fast and stable.
function ratioBox(targetWidth, targetHeight) {
  const scale = 100 / Math.max(targetWidth, targetHeight);
  return {
    width: Math.max(1, Math.round(targetWidth * scale)),
    height: Math.max(1, Math.round(targetHeight * scale)),
  };
}

// Largest rectangle of the given aspect ratio, centered in the image. Used as a
// fallback when smartcrop can't run (e.g. tiny or failed images).
export function centerCrop(naturalWidth, naturalHeight, aspectRatio) {
  let width = naturalWidth;
  let height = width / aspectRatio;
  if (height > naturalHeight) {
    height = naturalHeight;
    width = height * aspectRatio;
  }
  return {
    x: (naturalWidth - width) / 2,
    y: (naturalHeight - height) / 2,
    width,
    height,
  };
}

// Runs content-aware cropping for a single image × target-size combo.
// `image` must be a fully loaded HTMLImageElement (naturalWidth/Height set).
export async function getSmartCrop(image, targetWidth, targetHeight) {
  const aspectRatio = targetWidth / targetHeight;

  try {
    const { default: smartcrop } = await import("smartcrop");
    const { width, height } = ratioBox(targetWidth, targetHeight);
    const result = await smartcrop.crop(image, { width, height });
    const crop = result?.topCrop;
    if (
      crop &&
      Number.isFinite(crop.width) &&
      Number.isFinite(crop.height) &&
      crop.width > 0 &&
      crop.height > 0
    ) {
      return { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
    }
  } catch {
    // Fall through to the centered crop below.
  }

  return centerCrop(image.naturalWidth, image.naturalHeight, aspectRatio);
}
