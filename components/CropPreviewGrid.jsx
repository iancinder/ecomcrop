"use client";

import CropPreviewCell from "@/components/CropPreviewCell";
import { platformRatioLabel } from "@/lib/aspect";

// Photo × platform preview matrix (step 6).
//
// This component owns the *layout* of the matrix: one row per photo, one column
// per selected platform, with sticky row/column headers and horizontal
// scrolling when many platforms are selected. Each combo renders a
// CropPreviewCell — an independent cropperjs instance whose crop changes are
// reported up via onCropChange(photoId, platformId, cropBox).
export default function CropPreviewGrid({ photos, platforms, onCropChange }) {
  const hasPhotos = photos.length > 0;
  const hasPlatforms = platforms.length > 0;

  if (!hasPhotos || !hasPlatforms) {
    return (
      <p className="crop-grid__empty">
        {hasPhotos
          ? "Select at least one platform to preview crops."
          : "Add photos to preview crops."}
      </p>
    );
  }

  // First column sizes to the row headers; each platform gets an equal,
  // min-width column so narrow platforms stay legible and overflow scrolls.
  const templateColumns = `minmax(8rem, 11rem) repeat(${platforms.length}, minmax(12rem, 1fr))`;

  return (
    <div className="crop-grid-wrap">
      <div
        className="crop-grid"
        style={{ gridTemplateColumns: templateColumns }}
        role="grid"
        aria-label="Crop previews by photo and platform"
      >
        <div className="crop-grid__corner" role="columnheader" aria-hidden="true" />
        {platforms.map((platform) => (
          <div key={platform.id} className="crop-grid__col-head" role="columnheader">
            <span className="crop-grid__col-label">{platform.label}</span>
            <span className="crop-grid__col-meta">
              {platformRatioLabel(platform)} · {platform.width}×{platform.height}
            </span>
          </div>
        ))}

        {photos.map((photo) => (
          <div key={photo.id} className="crop-grid__row" role="row">
            <div className="crop-grid__row-head" role="rowheader">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote asset */}
              <img
                className="crop-grid__row-thumb"
                src={photo.url}
                alt={photo.name}
              />
              <span className="crop-grid__row-name" title={photo.name}>
                {photo.name}
              </span>
            </div>

            {platforms.map((platform) => (
              <div
                key={platform.id}
                className="crop-grid__cell"
                role="gridcell"
              >
                <CropPreviewCell
                  photo={photo}
                  platform={platform}
                  onCropChange={onCropChange}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
