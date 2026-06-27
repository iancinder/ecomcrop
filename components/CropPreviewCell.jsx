"use client";

import { useEffect, useRef, useState } from "react";
import { getSmartCrop } from "@/lib/smartCropAdapter";
import { platformRatioLabel } from "@/lib/aspect";

// One interactive crop box for a single photo × platform combo (step 6).
//
// Uses Cropper.js v2 (web-component based). The source image is locked (no
// pan/zoom/rotate) and only the selection moves/resizes, with its aspect ratio
// pinned to the platform's. The initial selection comes from smartcrop.js.
//
// Cropper works in canvas-local pixels; the rest of the app (and the export
// worker in step 7) needs the crop in the source image's natural pixels. We
// convert between the two using the on-screen rects of the image and canvas —
// the image only ever has a uniform scale + translate, so this is exact.
//
// `onCropChange(photoId, platformId, cropBox)` reports the crop in natural
// source pixels: { x, y, width, height }.
export default function CropPreviewCell({ photo, platform, onCropChange }) {
  const stageRef = useRef(null);
  const cropperRef = useRef(null);
  const sourceImageRef = useRef(null);
  const onCropChangeRef = useRef(onCropChange);
  const [status, setStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    onCropChangeRef.current = onCropChange;
  }, [onCropChange]);

  const aspectRatio = platform.width / platform.height;

  useEffect(() => {
    let cancelled = false;
    let cropper = null;
    let img = null;
    let selectionEl = null;
    let handleChange = null;

    const stage = stageRef.current;
    if (!stage) return undefined;

    async function setup() {
      const [{ default: Cropper }, sourceImage] = await Promise.all([
        import("cropperjs"),
        loadImage(photo.url),
      ]);
      if (cancelled) return;
      sourceImageRef.current = sourceImage;

      img = document.createElement("img");
      img.src = photo.url;
      img.alt = photo.name;
      stage.appendChild(img);

      cropper = new Cropper(img, { template: buildTemplate(aspectRatio) });
      cropperRef.current = cropper;

      const cropperImage = cropper.getCropperImage();
      const cropperCanvas = cropper.getCropperCanvas();
      selectionEl = cropper.getCropperSelection();
      if (!cropperImage || !cropperCanvas || !selectionEl) {
        throw new Error("Cropper failed to initialize");
      }

      // Wait for the image to load AND for the cropper to center/lay it out,
      // so the on-screen rects we measure are final.
      await cropperImage.$ready();
      if (cancelled) return;
      await nextFrame();
      await nextFrame();
      if (cancelled) return;

      const crop = await getSmartCrop(
        sourceImage,
        platform.width,
        platform.height
      );
      if (cancelled) return;

      applyNaturalCrop(selectionEl, cropperImage, cropperCanvas, sourceImage, crop);

      handleChange = () => {
        const box = selectionToNatural(
          selectionEl,
          cropperImage,
          cropperCanvas,
          sourceImage
        );
        if (box) onCropChangeRef.current?.(photo.id, platform.id, box);
      };
      selectionEl.addEventListener("change", handleChange);
      handleChange(); // report the initial smartcrop region

      setStatus("ready");
    }

    setup().catch(() => {
      if (!cancelled) setStatus("error");
    });

    return () => {
      cancelled = true;
      if (selectionEl && handleChange) {
        selectionEl.removeEventListener("change", handleChange);
      }
      if (cropper) cropper.destroy();
      if (img) img.remove();
      cropperRef.current = null;
      sourceImageRef.current = null;
    };
    // Re-create the cropper if the photo or the target aspect ratio changes.
  }, [photo.id, photo.url, photo.name, platform.id, platform.width, platform.height, aspectRatio]);

  function handleReset() {
    const cropper = cropperRef.current;
    const sourceImage = sourceImageRef.current;
    if (!cropper || !sourceImage) return;
    const selectionEl = cropper.getCropperSelection();
    const cropperImage = cropper.getCropperImage();
    const cropperCanvas = cropper.getCropperCanvas();
    if (!selectionEl || !cropperImage || !cropperCanvas) return;

    getSmartCrop(sourceImage, platform.width, platform.height).then((crop) => {
      applyNaturalCrop(selectionEl, cropperImage, cropperCanvas, sourceImage, crop);
      const box = selectionToNatural(
        selectionEl,
        cropperImage,
        cropperCanvas,
        sourceImage
      );
      if (box) onCropChangeRef.current?.(photo.id, platform.id, box);
    });
  }

  return (
    <div className="crop-cell">
      <div className="crop-cell__stage" ref={stageRef} aria-busy={status === "loading"} />
      {status === "loading" && (
        <span className="crop-cell__overlay">Analyzing…</span>
      )}
      {status === "error" && (
        <span className="crop-cell__overlay crop-cell__overlay--error">
          Couldn&apos;t load preview
        </span>
      )}
      <div className="crop-cell__bar">
        <span className="crop-cell__meta">
          {platformRatioLabel(platform)} · {platform.width}×{platform.height}
        </span>
        <button
          type="button"
          className="crop-cell__reset"
          onClick={handleReset}
          disabled={status !== "ready"}
        >
          Reset crop
        </button>
      </div>
    </div>
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

// Builds a Cropper template with the image fully locked (the defaults already
// disable rotate/scale/skew/translate) and the selection pinned to the target
// aspect ratio.
function buildTemplate(aspectRatio) {
  return (
    '<cropper-canvas background style="width:100%;height:100%">' +
    "<cropper-image></cropper-image>" +
    "<cropper-shade hidden></cropper-shade>" +
    '<cropper-handle action="select" plain></cropper-handle>' +
    `<cropper-selection aspect-ratio="${aspectRatio}" initial-coverage="0.85" movable resizable outlined>` +
    '<cropper-grid role="grid" covered></cropper-grid>' +
    "<cropper-crosshair centered></cropper-crosshair>" +
    '<cropper-handle action="move" theme-color="rgba(255, 255, 255, 0.35)"></cropper-handle>' +
    '<cropper-handle action="n-resize"></cropper-handle>' +
    '<cropper-handle action="e-resize"></cropper-handle>' +
    '<cropper-handle action="s-resize"></cropper-handle>' +
    '<cropper-handle action="w-resize"></cropper-handle>' +
    '<cropper-handle action="ne-resize"></cropper-handle>' +
    '<cropper-handle action="nw-resize"></cropper-handle>' +
    '<cropper-handle action="se-resize"></cropper-handle>' +
    '<cropper-handle action="sw-resize"></cropper-handle>' +
    "</cropper-selection>" +
    "</cropper-canvas>"
  );
}

// Where the displayed (contain-scaled) image sits within the canvas, plus the
// scale between displayed pixels and the source image's natural pixels.
function getImageMetrics(cropperImage, cropperCanvas, sourceImage) {
  const canvasRect = cropperCanvas.getBoundingClientRect();
  const imageRect = cropperImage.getBoundingClientRect();
  if (!imageRect.width || !imageRect.height) return null;
  return {
    offsetX: imageRect.left - canvasRect.left,
    offsetY: imageRect.top - canvasRect.top,
    displayedWidth: imageRect.width,
    displayedHeight: imageRect.height,
    naturalWidth: sourceImage.naturalWidth,
    naturalHeight: sourceImage.naturalHeight,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// Selection (canvas-local px) → crop box in natural source px.
function selectionToNatural(selectionEl, cropperImage, cropperCanvas, sourceImage) {
  const m = getImageMetrics(cropperImage, cropperCanvas, sourceImage);
  if (!m) return null;
  const sx = m.naturalWidth / m.displayedWidth;
  const sy = m.naturalHeight / m.displayedHeight;

  let x = (selectionEl.x - m.offsetX) * sx;
  let y = (selectionEl.y - m.offsetY) * sy;
  let width = selectionEl.width * sx;
  let height = selectionEl.height * sy;

  x = clamp(x, 0, m.naturalWidth);
  y = clamp(y, 0, m.naturalHeight);
  width = clamp(width, 1, m.naturalWidth - x);
  height = clamp(height, 1, m.naturalHeight - y);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

// Crop box in natural source px → selection (canvas-local px), then apply it.
function applyNaturalCrop(selectionEl, cropperImage, cropperCanvas, sourceImage, crop) {
  const m = getImageMetrics(cropperImage, cropperCanvas, sourceImage);
  if (!m) return;
  const sx = m.displayedWidth / m.naturalWidth;
  const sy = m.displayedHeight / m.naturalHeight;

  selectionEl.$change(
    m.offsetX + crop.x * sx,
    m.offsetY + crop.y * sy,
    crop.width * sx,
    crop.height * sy
  );
}
