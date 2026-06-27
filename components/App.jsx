"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserButton, useUser } from "@clerk/nextjs";
import { loadSpecs } from "@/lib/specLoader";
import DropZone from "@/components/DropZone";
import PlatformSelector from "@/components/PlatformSelector";
import KeywordInput from "@/components/KeywordInput";
import CropPreviewGrid from "@/components/CropPreviewGrid";
import SubscribePrompt from "@/components/SubscribePrompt";
import { generateAndDownloadZip } from "@/lib/zipBuilder";
import {
  loadCustomPlatforms,
  persistCustomPlatforms,
  createCustomPlatform,
} from "@/lib/customPlatforms";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Main tool, rendered only once a user has a valid Clerk session (step 2).
// On mount it loads the platform spec (step 4). A 401 means the session is
// valid but there's no active subscription — shown here as a minimal gate
// until SubscribePrompt lands in step 8. The crop preview grid (step 6) and
// zip generation (step 7) replace the disabled action below.
export default function App() {
  const { user } = useUser();
  const [specState, setSpecState] = useState("loading"); // loading | activating | ready | unauthorized
  const [activated, setActivated] = useState(false);
  const [platforms, setPlatforms] = useState([]);
  // User-defined platforms (step 10), loaded from localStorage. Kept separate
  // from the server specs so we know which entries are removable/persistable.
  const [customPlatforms, setCustomPlatforms] = useState([]);
  const [selectedPlatformIds, setSelectedPlatformIds] = useState(
    () => new Set()
  );
  const [photos, setPhotos] = useState([]);
  const [keyword, setKeyword] = useState("");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [toast, setToast] = useState(null);

  // Crop boxes keyed by `${photoId}:${platformId}`, in natural source pixels.
  // Stored in a ref so dragging a crop box doesn't re-render the whole grid;
  // zip generation (step 7) reads the current combos from here at click time.
  const cropDataRef = useRef(new Map());

  const handleCropChange = useCallback((photoId, platformId, cropBox) => {
    cropDataRef.current.set(`${photoId}:${platformId}`, cropBox);
  }, []);

  // Latest photos for cleanup on unmount, without re-subscribing the effect.
  const photosRef = useRef(photos);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    // Read the param before the activation effect below strips it. When the user
    // just returned from Stripe checkout, the webhook that flips their Clerk
    // metadata to "active" may not have landed yet, so the first /api/specs call
    // can still 401. Retry briefly before showing the pricing page.
    const cameFromCheckout =
      new URLSearchParams(window.location.search).get("activated") === "true";
    const maxAttempts = cameFromCheckout ? 6 : 1;
    let attempts = 0;

    async function attempt() {
      attempts += 1;
      const result = await loadSpecs();
      if (cancelled) return;
      if (result.unauthorized) {
        if (attempts < maxAttempts) {
          setSpecState("activating");
          timer = setTimeout(attempt, 1500);
          return;
        }
        setSpecState("unauthorized");
        return;
      }
      const list = result.specs?.platforms ?? [];
      setPlatforms(list);
      // Default all built-ins to checked. Add (don't replace) so custom
      // platforms loaded from localStorage stay selected regardless of which
      // effect resolves first.
      setSelectedPlatformIds((prev) => {
        const next = new Set(prev);
        list.forEach((p) => next.add(p.id));
        return next;
      });
      setSpecState("ready");
    }

    attempt();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
    };
  }, []);

  // Load saved custom platforms once on mount (client-only — reads localStorage)
  // and default them to checked, alongside the built-in platforms.
  useEffect(() => {
    const saved = loadCustomPlatforms();
    if (saved.length === 0) return;
    setCustomPlatforms(saved);
    setSelectedPlatformIds((prev) => {
      const next = new Set(prev);
      saved.forEach((p) => next.add(p.id));
      return next;
    });
  }, []);

  // Post-Stripe success redirect lands on /?activated=true. Show a welcome
  // banner and strip the param so a refresh doesn't show it again.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("activated") === "true") {
      setActivated(true);
      params.delete("activated");
      const query = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (query ? `?${query}` : "")
      );
    }
  }, []);

  function handleAddFiles(fileList) {
    const incoming = Array.from(fileList).filter((file) =>
      ACCEPTED_TYPES.includes(file.type)
    );
    if (incoming.length === 0) return;
    setPhotos((prev) => [
      ...prev,
      ...incoming.map((file) => ({
        id: crypto.randomUUID(),
        file,
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    ]);
  }

  function handleRemovePhoto(id) {
    setPhotos((prev) => {
      const target = prev.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((photo) => photo.id !== id);
    });
    // Drop any stored crop boxes for this photo so the map can't grow unbounded.
    const prefix = `${id}:`;
    for (const key of cropDataRef.current.keys()) {
      if (key.startsWith(prefix)) cropDataRef.current.delete(key);
    }
  }

  function handleTogglePlatform(id) {
    setSelectedPlatformIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Validate + add a custom platform. Returns the validation result so the form
  // can surface an error; on success the new platform is persisted and checked.
  function handleAddCustomPlatform(input) {
    const result = createCustomPlatform(input);
    if (result.error) return result;
    const { platform } = result;
    setCustomPlatforms((prev) => {
      const next = [...prev, platform];
      persistCustomPlatforms(next);
      return next;
    });
    setSelectedPlatformIds((prev) => new Set(prev).add(platform.id));
    return result;
  }

  function handleRemoveCustomPlatform(id) {
    setCustomPlatforms((prev) => {
      const next = prev.filter((p) => p.id !== id);
      persistCustomPlatforms(next);
      return next;
    });
    setSelectedPlatformIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // Drop any crop boxes stored against this platform so the map can't leak.
    const suffix = `:${id}`;
    for (const key of cropDataRef.current.keys()) {
      if (key.endsWith(suffix)) cropDataRef.current.delete(key);
    }
  }

  const hasPhotos = photos.length > 0;
  const hasPlatforms = selectedPlatformIds.size > 0;
  const canGenerate = hasPhotos && hasPlatforms;

  // Built-in specs followed by user-defined custom platforms — the full set the
  // selector renders and the crop grid can draw from.
  const allPlatforms = [...platforms, ...customPlatforms];

  // Selected platforms in list order — the columns of the crop preview grid.
  const selectedPlatforms = allPlatforms.filter((p) =>
    selectedPlatformIds.has(p.id)
  );

  async function handleGenerate() {
    if (!canGenerate || generating) return;
    setToast(null);
    setGenerating(true);
    setProgress({ done: 0, total: photos.length * selectedPlatforms.length });
    try {
      const { failed, total } = await generateAndDownloadZip({
        photos,
        platforms: selectedPlatforms,
        keyword,
        cropData: cropDataRef.current,
        onProgress: (done, jobTotal) =>
          setProgress({ done, total: jobTotal }),
      });
      if (failed >= total) {
        setToast({ type: "error", text: "Couldn't process any images. Please try again." });
      } else if (failed > 0) {
        setToast({
          type: "error",
          text: `${failed} image${failed > 1 ? "s" : ""} failed to process. The rest are in your zip.`,
        });
      } else {
        setToast({ type: "success", text: "Done! Check your Downloads folder." });
      }
    } catch {
      setToast({ type: "error", text: "Something went wrong generating your zip. Please try again." });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <span className="app__brand">EcomCrop</span>
        <div className="app__header-actions">
          {specState === "ready" && (
            // Plain navigation so the Clerk session cookie rides along to the
            // authenticated portal endpoint (step 9).
            <a className="app__manage-link" href="/api/stripe/portal">
              Manage subscription
            </a>
          )}
          <UserButton />
        </div>
      </header>

      {activated && (
        <div className="app__banner" role="status">
          <span>Welcome! Your account is active.</span>
          <button
            type="button"
            className="app__banner-dismiss"
            aria-label="Dismiss"
            onClick={() => setActivated(false)}
          >
            ×
          </button>
        </div>
      )}

      {(specState === "loading" || specState === "activating") && (
        <main className="app__main">
          <p className="app__hint">
            {specState === "activating"
              ? "Finalizing your subscription…"
              : "Loading your workspace…"}
          </p>
        </main>
      )}

      {specState === "unauthorized" && (
        <SubscribePrompt
          resubscribe={user?.publicMetadata?.subscriptionStatus === "cancelled"}
        />
      )}

      {specState === "ready" && (
        <main className="tool">
          <section className="tool__section">
            <h2 className="tool__heading">1 · Add photos</h2>
            <DropZone
              photos={photos}
              onAddFiles={handleAddFiles}
              onRemove={handleRemovePhoto}
            />
          </section>

          <section className="tool__section">
            <h2 className="tool__heading">2 · Choose platforms</h2>
            <PlatformSelector
              platforms={allPlatforms}
              selectedIds={selectedPlatformIds}
              onToggle={handleTogglePlatform}
              onAddCustom={handleAddCustomPlatform}
              onRemoveCustom={handleRemoveCustomPlatform}
            />
          </section>

          <section className="tool__section">
            <h2 className="tool__heading">3 · Name your files</h2>
            <KeywordInput value={keyword} onChange={setKeyword} />
          </section>

          <section className="tool__section">
            <h2 className="tool__heading">4 · Review crops</h2>
            <CropPreviewGrid
              photos={photos}
              platforms={selectedPlatforms}
              onCropChange={handleCropChange}
            />
          </section>

          <div className="tool__actions">
            {hasPhotos && !hasPlatforms && (
              <p className="tool__warning">Select at least one platform.</p>
            )}
            <button
              type="button"
              className="btn btn--primary"
              disabled={!canGenerate || generating}
              onClick={handleGenerate}
            >
              {generating ? "Generating…" : "Generate zip"}
            </button>

            {generating && (
              <div
                className="progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.done}
              >
                <div
                  className="progress__bar"
                  style={{
                    width: `${
                      progress.total
                        ? Math.round((progress.done / progress.total) * 100)
                        : 0
                    }%`,
                  }}
                />
                <span className="progress__label">
                  {progress.total && progress.done < progress.total
                    ? `Processing ${progress.done} / ${progress.total}…`
                    : "Packaging zip…"}
                </span>
              </div>
            )}

            {toast && !generating && (
              <p
                className={`tool__toast${
                  toast.type === "error" ? " tool__toast--error" : ""
                }`}
              >
                {toast.text}
              </p>
            )}
          </div>
        </main>
      )}
    </div>
  );
}
