// Formats a width × height as a reduced "W:H" ratio string (e.g. 1080×1920 →
// "9:16"). Used for display only.
//
// Built-in platforms carry an `aspect_ratio` string in the spec, but custom
// platforms (step 10) only have width/height — so display code should derive
// the ratio from dimensions and treat the spec string as an optional override.
export function formatAspectRatio(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "";
  }
  const divisor = gcd(Math.round(width), Math.round(height));
  return `${Math.round(width) / divisor}:${Math.round(height) / divisor}`;
}

// Prefers the spec's authored ratio string, falling back to a derived one.
export function platformRatioLabel(platform) {
  return platform.aspect_ratio || formatAspectRatio(platform.width, platform.height);
}

function gcd(a, b) {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}
