import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CircleHelp,
  Clock,
  Info,
  RotateCw,
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
 * Compact status-icon help control. Opens a popover instead of a full-width legend strip.
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

  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);

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
          tip: "These items were removed from the source successfully.",
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
          tip: "Removal failed for these items. Click to mark them for retry.",
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
          tip: "Items marked for removal retry. Click again to undo.",
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
          label: "Exists (destination only)",
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
            <Clock
              size={iconSize}
              className="path-review__legend-icon path-review__legend-icon--pending"
            />
          ),
          label: "Pending removal",
          tip: "Copied successfully and scheduled for removal from the source. Click to exclude from removal.",
        },
        {
          key: "excluded-removal",
          icon: (
            <X
              size={iconSize}
              className="path-review__legend-icon path-review__legend-icon--excluded"
            />
          ),
          label: "Excluded from removal",
          tip: "These items will be kept on the source. Click to include them again.",
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
          label: "Exists (destination only)",
          tip: "Shown for awareness; not part of the removal plan.",
        });
      }
      return out;
    }

    const out: LegendRow[] = [];
    if (!isCopyPhase) {
      out.push({
        key: "pending",
        icon: (
          <Clock
            size={iconSize}
            className="path-review__legend-icon path-review__legend-icon--pending"
          />
        ),
        label: "Pending",
        tip: "Will be copied. Click the icon to exclude from copy.",
      });
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
          ? "Explicitly excluded from copy during discovery review."
          : "Will not be copied. Click again to include.",
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
        label: "Exists (destination only)",
        tip: "Already on destination. Folders with this status are not explored during discovery.",
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
          label: PATH_REVIEW_COPY.compatibilityFilterIssues,
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
        tip: `Failed items can be marked for retry to be ${
          isCopyPhase ? "copied" : "explored"
        } again.`,
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
        tip: "Marked for retry. Click again to unmark.",
      }
    );
    return out;
  })();

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      setCoords(null);
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ left: rect.left, top: rect.bottom + 6 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  const panel =
    open && coords
      ? createPortal(
          <div
            ref={panelRef}
            className="path-review-legend-popover"
            style={{ left: coords.left, top: coords.top }}
            role="dialog"
            aria-label="Status icon legend"
          >
            <p className="path-review-legend-popover__title">Status icons</p>
            <ul className="path-review-legend-popover__list">
              {rows.map((row) => (
                <li key={row.key} className="path-review-legend-popover__row">
                  <span className="path-review-legend-popover__icon">{row.icon}</span>
                  <span className="path-review-legend-popover__text">
                    <span className="path-review-legend-popover__label">{row.label}</span>
                    <span className="path-review-legend-popover__tip">{row.tip}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`path-review-legend-trigger ${className}`.trim()}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Status icon help"
        onClick={() => setOpen((v) => !v)}
      >
        <CircleHelp size={15} aria-hidden />
        <span>Icons</span>
      </button>
      {panel}
    </>
  );
}
