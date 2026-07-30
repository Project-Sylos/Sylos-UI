import type { ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Check,
  Clock,
  Info,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import { PATH_REVIEW_COPY } from "../utils/pathReviewCopy";
import "./PathReviewLegend.css";

export interface PathReviewLegendProps {
  zoomLevel?: number;
  className?: string;
  phase?: "traversal" | "copy" | "source-cleanup" | "delete";
  /** When false, hide the destination-only legend entry (cleanup/delete default). */
  showDestinationOnly?: boolean;
  /** Show destination naming compatibility legend entry. */
  showCompatibility?: boolean;
}

type LegendRow = {
  key: string;
  icon: ReactNode;
  label: string;
  tip: string;
};

/**
 * Full-width status-icon legend band. Toggleable statuses include tooltip copy
 * that explains clicking the row icon switches between related states.
 */
export default function PathReviewLegend({
  zoomLevel = 1,
  className = "",
  phase = "traversal",
  showDestinationOnly = true,
  showCompatibility = false,
}: PathReviewLegendProps) {
  const isCopyPhase = phase === "copy";
  const isSourceCleanup = phase === "source-cleanup";
  const isDeleteReview = phase === "delete";
  const iconSize = 14 * zoomLevel;

  const rows: LegendRow[] = (() => {
    if (isDeleteReview) {
      const out: LegendRow[] = [
        {
          key: "removed",
          icon: (
            <Check
              size={iconSize}
              className="path-review__legend-icon path-review__legend-icon--deleted"
            />
          ),
          label: "Removed",
          tip: "Removed from the source successfully.",
        },
        {
          key: "failed",
          icon: (
            <AlertCircle
              size={iconSize}
              className="path-review__legend-icon path-review__legend-icon--failed"
            />
          ),
          label: "Failed",
          tip: "Removal failed. Click the icon to mark for retry; click again to undo.",
        },
        {
          key: "retry",
          icon: (
            <RotateCw
              size={iconSize}
              className="path-review__legend-icon path-review__legend-icon--retry"
            />
          ),
          label: "Retry",
          tip: "Marked for removal retry. Click the icon to switch back to failed.",
        },
      ];
      if (showDestinationOnly) {
        out.push({
          key: "dst-only",
          icon: (
            <Check
              size={iconSize}
              className="path-review__legend-icon path-review__legend-icon--exists-only-dst"
            />
          ),
          label: "Destination only",
          tip: "Shown for awareness; not part of the removal plan.",
        });
      }
      return out;
    }

    if (isSourceCleanup) {
      const out: LegendRow[] = [
        {
          key: "pending-removal",
          icon: (
            <Trash2
              size={iconSize}
              className="path-review__legend-icon path-review__legend-icon--pending"
            />
          ),
          label: "Pending removal",
          tip: "Scheduled for source removal. Click the icon to keep it on the source; click again to include removal.",
        },
        {
          key: "excluded-removal",
          icon: (
            <X
              size={iconSize}
              className="path-review__legend-icon path-review__legend-icon--excluded"
            />
          ),
          label: "Keep on source",
          tip: "Excluded from removal. Click the icon to schedule removal again.",
        },
      ];
      if (showDestinationOnly) {
        out.push({
          key: "dst-only",
          icon: (
            <Check
              size={iconSize}
              className="path-review__legend-icon path-review__legend-icon--exists-only-dst"
            />
          ),
          label: "Destination only",
          tip: "Shown for awareness; not part of the removal plan.",
        });
      }
      return out;
    }

    const out: LegendRow[] = [];
    if (!isCopyPhase) {
      out.push(
        {
          key: "pending",
          icon: (
            <Clock
              size={iconSize}
              className="path-review__legend-icon path-review__legend-icon--pending"
            />
          ),
          label: "Pending",
          tip: "Included for copy. Click the icon to exclude; click the excluded icon to include again.",
        },
        {
          key: "skipped",
          icon: (
            <Ban
              size={iconSize}
              className="path-review__legend-icon path-review__legend-icon--skipped-skipped"
            />
          ),
          label: "Skipped discovery",
          tip: "Skipped at root pick (subtree not explored). Click the icon to mark for discovery retry; click again to skip again.",
        }
      );
    }
    out.push(
      {
        key: "excluded",
        icon: (
          <X
            size={iconSize}
            className="path-review__legend-icon path-review__legend-icon--excluded"
          />
        ),
        label: "Excluded",
        tip: isCopyPhase
          ? "Excluded from copy during discovery review (read-only here)."
          : "Excluded from copy. Click the icon to include again (pending); click pending to exclude.",
      },
      {
        key: "both",
        icon: (
          <Check
            size={iconSize}
            className="path-review__legend-icon path-review__legend-icon--exists"
          />
        ),
        label: "Exists (both)",
        tip: "Already present on source and destination.",
      }
    );
    if (showDestinationOnly) {
      out.push({
        key: "dst-only",
        icon: (
          <Check
            size={iconSize}
            className="path-review__legend-icon path-review__legend-icon--exists-only-dst"
          />
        ),
        label: "Destination only",
        tip: "Exists only on destination. Folders with this status are not explored during discovery.",
      });
    }
    if (showCompatibility) {
      out.push(
        {
          key: "compat-auto",
          icon: (
            <Info
              size={iconSize}
              className="path-review__legend-icon path-review__legend-icon--compat-info"
            />
          ),
          label: "Will be renamed",
          tip: PATH_REVIEW_COPY.compatibilityLegendAutoTip,
        },
        {
          key: "compat-manual",
          icon: (
            <AlertTriangle
              size={iconSize}
              className="path-review__legend-icon path-review__legend-icon--compatibility"
            />
          ),
          label: PATH_REVIEW_COPY.compatibilityFilterManual,
          tip: PATH_REVIEW_COPY.compatibilityLegendManualTip,
        }
      );
    }
    out.push(
      {
        key: "failed",
        icon: (
          <AlertCircle
            size={iconSize}
            className="path-review__legend-icon path-review__legend-icon--failed"
          />
        ),
        label: "Failed",
        tip: `Failed to ${
          isCopyPhase ? "copy" : "explore"
        }. Click the icon to mark for retry; click the retry icon to switch back to failed.`,
      },
      {
        key: "retry",
        icon: (
          <RotateCw
            size={iconSize}
            className="path-review__legend-icon path-review__legend-icon--retry"
          />
        ),
        label: "Retry",
        tip: "Marked for retry. Click the icon to unmark (back to failed, or back to skipped discovery when that was the prior state).",
      }
    );
    return out;
  })();

  return (
    <div
      className={`path-review__legend path-review__legend--compact ${className}`.trim()}
      role="list"
      aria-label="Status icon legend"
    >
      {rows.map((row) => (
        <div
          key={row.key}
          className="path-review__legend-item"
          role="listitem"
          title={row.tip}
        >
          <span className="path-review__legend-icon-wrap" aria-hidden="true">
            {row.icon}
          </span>
          <span className="path-review__legend-label">{row.label}</span>
        </div>
      ))}
    </div>
  );
}
