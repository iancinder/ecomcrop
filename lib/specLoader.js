import bundledSpecs from "@/data/platform-specs.json";

export const SPEC_SOURCE = {
  REMOTE: "remote",
  BUNDLED: "bundled",
};

// Loads the platform spec for the signed-in user.
//
// The Clerk session cookie rides along automatically on this same-origin
// request, so the /api/specs handler can authenticate the user.
//
// Returns a discriminated result so callers can render the right UX state:
//   { ok: true,  unauthorized: false, specs, source }  → render the tool
//   { ok: false, unauthorized: true,  specs: null }    → show resubscribe prompt (401)
//   { ok: true,  unauthorized: false, specs, source: "bundled" } → offline fallback
export async function loadSpecs() {
  try {
    const res = await fetch("/api/specs", {
      headers: { Accept: "application/json" },
    });

    // Logged in but no active subscription (or it expired/cancelled).
    if (res.status === 401) {
      return { ok: false, unauthorized: true, specs: null, source: null };
    }

    // Any other non-2xx (e.g. a transient 5xx) is treated like being offline:
    // silently fall back to the bundled spec rather than blocking the user.
    if (!res.ok) {
      return {
        ok: true,
        unauthorized: false,
        specs: bundledSpecs,
        source: SPEC_SOURCE.BUNDLED,
      };
    }

    const specs = await res.json();
    return {
      ok: true,
      unauthorized: false,
      specs,
      source: SPEC_SOURCE.REMOTE,
    };
  } catch {
    // Network failure / offline — fall back to the bundled spec, no error shown.
    return {
      ok: true,
      unauthorized: false,
      specs: bundledSpecs,
      source: SPEC_SOURCE.BUNDLED,
    };
  }
}

export { bundledSpecs };
