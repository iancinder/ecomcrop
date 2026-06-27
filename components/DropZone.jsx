"use client";

import { useRef, useState } from "react";

// Drag-and-drop / click-to-browse intake for product photos. Accepted files
// are lifted to the parent (App), which owns the photo list and object URLs.
export default function DropZone({ photos, onAddFiles, onRemove }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function openPicker() {
    inputRef.current?.click();
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer?.files?.length) {
      onAddFiles(event.dataTransfer.files);
    }
  }

  return (
    <div className="dropzone-wrap">
      <div
        className={`dropzone${dragging ? " dropzone--active" : ""}`}
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files?.length) onAddFiles(event.target.files);
            // Reset so re-selecting the same file fires onChange again.
            event.target.value = "";
          }}
        />
        <p className="dropzone__title">Drag &amp; drop product photos</p>
        <p className="dropzone__hint">or click to browse — JPG, PNG, or WebP</p>
      </div>

      {photos.length > 0 && (
        <ul className="thumbs">
          {photos.map((photo) => (
            <li key={photo.id} className="thumb">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote asset */}
              <img className="thumb__img" src={photo.url} alt={photo.name} />
              <button
                type="button"
                className="thumb__remove"
                aria-label={`Remove ${photo.name}`}
                onClick={() => onRemove(photo.id)}
              >
                ×
              </button>
              <span className="thumb__name" title={photo.name}>
                {photo.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
