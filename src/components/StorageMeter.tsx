import { formatBytes } from "../utils/formatBytes";
import "./StorageMeter.css";

export type StorageMeterInfo = {
  available?: boolean;
  unlimited?: boolean;
  totalBytes?: number | null;
  usedBytes?: number | null;
  freeBytes?: number | null;
};

export type StorageMeterProps = StorageMeterInfo & {
  /** When false, show total capacity text only (local unmounted drives). Default true. */
  mounted?: boolean;
  className?: string;
  /** Optional note under the meter (e.g. low free-space warning). */
  note?: string | null;
};

/**
 * Drive/FS-level used/free/total capacity meter (same look as local drive rows).
 * Renders nothing when capacity is unavailable or unknown.
 */
export default function StorageMeter({
  available = true,
  unlimited = false,
  totalBytes,
  usedBytes,
  freeBytes,
  mounted = true,
  className,
  note,
}: StorageMeterProps) {
  if (available === false) {
    return null;
  }

  const rootClass = ["storage-meter", className].filter(Boolean).join(" ");

  if (unlimited) {
    return (
      <div className={rootClass} aria-live="polite">
        <div className="storage-meter__stats">Unlimited storage</div>
        {note ? <div className="storage-meter__note">{note}</div> : null}
      </div>
    );
  }

  const total = totalBytes ?? 0;
  if (total <= 0) {
    return null;
  }

  if (!mounted) {
    return (
      <div className={rootClass} aria-live="polite">
        <div className="storage-meter__stats">{formatBytes(total)} total capacity</div>
        {note ? <div className="storage-meter__note">{note}</div> : null}
      </div>
    );
  }

  const free = freeBytes ?? 0;
  const used = usedBytes ?? Math.max(0, total - free);
  const usedPct = Math.min(100, Math.max(0, (used / total) * 100));

  return (
    <div className={rootClass} aria-live="polite">
      <div className="storage-meter__track" role="presentation" aria-hidden="true">
        <div className="storage-meter__fill" style={{ width: `${usedPct}%` }} />
      </div>
      <div className="storage-meter__stats">
        <span>{formatBytes(free)} free</span>
        <span className="storage-meter__sep" aria-hidden="true">
          ·
        </span>
        <span>{formatBytes(used)} used</span>
        <span className="storage-meter__sep" aria-hidden="true">
          ·
        </span>
        <span>{formatBytes(total)} total</span>
      </div>
      {note ? <div className="storage-meter__note">{note}</div> : null}
    </div>
  );
}
