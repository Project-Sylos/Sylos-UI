import type { DestDualPresence } from "../../utils/destDualList";

const LABELS: Record<DestDualPresence, string> = {
  both: "On both",
  sourceOnly: "Source only",
  destOnly: "Destination only",
};

/** Compact badge for dest dual-list rows (both / source-only / dest-only). */
export default function DestPresenceBadge({
  presence,
}: {
  presence: DestDualPresence;
}) {
  return (
    <span
      className={`browse-folder__presence browse-folder__presence--${presence}`}
      title={LABELS[presence]}
    >
      {LABELS[presence]}
    </span>
  );
}
