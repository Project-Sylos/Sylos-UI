/** Human-readable byte size (1024-based, B through PB). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    sizes.length - 1
  );
  const value = bytes / Math.pow(k, i);
  const decimals =
    i === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;

  return `${value.toFixed(decimals)} ${sizes[i]}`;
}

/** Coerce to a finite number ≥ 0 (NaN / Infinity / negatives → fallback). */
export function finiteNonNeg(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/** Format remaining duration for ETA display. */
export function formatEtaSeconds(secs: number | null): string {
  if (secs == null || !Number.isFinite(secs) || secs < 0) return "-";
  if (secs < 1) return "<1s";
  if (secs < 60) return `~${Math.ceil(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.ceil(secs % 60);
  if (m < 60) return `~${m}m ${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `~${h}h ${rm}m`;
}
