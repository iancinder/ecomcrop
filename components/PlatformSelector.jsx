"use client";

import { useState } from "react";
import { platformRatioLabel } from "@/lib/aspect";

// One checkbox per platform (built-in spec + user-defined custom platforms).
// Each row shows the platform label and its aspect ratio; custom rows also get a
// remove button. Below the list, an inline form adds custom platforms (step 10).
//
// Selection state and the custom-platform list are owned by App; this component
// just reports add/remove/toggle intents.
export default function PlatformSelector({
  platforms,
  selectedIds,
  onToggle,
  onAddCustom,
  onRemoveCustom,
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: "", width: "", height: "", folder: "" });
  const [error, setError] = useState(null);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function resetForm() {
    setForm({ label: "", width: "", height: "", folder: "" });
    setError(null);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const result = onAddCustom?.(form);
    if (result?.error) {
      setError(result.error);
      return;
    }
    resetForm();
    setShowForm(false);
  }

  function handleCancel() {
    resetForm();
    setShowForm(false);
  }

  return (
    <fieldset className="platforms">
      <legend className="platforms__legend">Export for</legend>
      <ul className="platforms__list">
        {platforms.map((platform) => {
          const inputId = `platform-${platform.id}`;
          return (
            <li key={platform.id} className="platforms__item">
              <label className="platform" htmlFor={inputId}>
                <input
                  id={inputId}
                  type="checkbox"
                  className="platform__checkbox"
                  checked={selectedIds.has(platform.id)}
                  onChange={() => onToggle(platform.id)}
                />
                <span className="platform__label">{platform.label}</span>
                <span className="platform__ratio">
                  {platformRatioLabel(platform)}
                </span>
              </label>
              {platform.custom && (
                <button
                  type="button"
                  className="platform__remove"
                  aria-label={`Remove ${platform.label}`}
                  title="Remove custom platform"
                  onClick={() => onRemoveCustom?.(platform.id)}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {showForm ? (
        <form className="custom-platform" onSubmit={handleSubmit}>
          <div className="custom-platform__fields">
            <label className="custom-platform__field">
              <span className="custom-platform__field-label">Label</span>
              <input
                type="text"
                className="custom-platform__input"
                placeholder="e.g. Shopify hero"
                value={form.label}
                onChange={(e) => updateField("label", e.target.value)}
                autoFocus
              />
            </label>
            <label className="custom-platform__field custom-platform__field--num">
              <span className="custom-platform__field-label">Width (px)</span>
              <input
                type="number"
                min="1"
                inputMode="numeric"
                className="custom-platform__input"
                placeholder="1200"
                value={form.width}
                onChange={(e) => updateField("width", e.target.value)}
              />
            </label>
            <label className="custom-platform__field custom-platform__field--num">
              <span className="custom-platform__field-label">Height (px)</span>
              <input
                type="number"
                min="1"
                inputMode="numeric"
                className="custom-platform__input"
                placeholder="1200"
                value={form.height}
                onChange={(e) => updateField("height", e.target.value)}
              />
            </label>
            <label className="custom-platform__field">
              <span className="custom-platform__field-label">Folder name</span>
              <input
                type="text"
                className="custom-platform__input"
                placeholder="Defaults to the label"
                value={form.folder}
                onChange={(e) => updateField("folder", e.target.value)}
              />
            </label>
          </div>

          {error && <p className="custom-platform__error">{error}</p>}

          <div className="custom-platform__actions">
            <button type="submit" className="btn btn--primary btn--sm">
              Add platform
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="platforms__add"
          onClick={() => setShowForm(true)}
        >
          + Add custom platform
        </button>
      )}
    </fieldset>
  );
}
