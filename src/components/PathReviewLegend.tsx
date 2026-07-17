import React from "react";
import { Clock, X, Check, AlertCircle, RotateCw } from "lucide-react";
import HelpTooltip from "./HelpTooltip";

export interface PathReviewLegendProps {
  zoomLevel?: number;
  className?: string;
  phase?: "traversal" | "copy" | "source-cleanup" | "delete";
  /** When false, hide the destination-only legend entry (cleanup/delete default). */
  showDestinationOnly?: boolean;
}

export default function PathReviewLegend({
  zoomLevel = 1,
  className = "",
  phase = "traversal",
  showDestinationOnly = true,
}: PathReviewLegendProps) {
  const isCopyPhase = phase === "copy";
  const isSourceCleanup = phase === "source-cleanup";
  const isDeleteReview = phase === "delete";

  if (isDeleteReview) {
    return (
      <div className={`path-review__legend ${className}`}>
        <div className="path-review__legend-item">
          <Check size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--deleted" />
          <span className="path-review__legend-label">Removed</span>
          <HelpTooltip
            tipId="delete-removed-icon-tip"
            category="path-review-delete-removed"
            position="above"
            content={
              <p>These items were removed from the source successfully.</p>
            }
          />
        </div>
        <div className="path-review__legend-item">
          <AlertCircle size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--failed" />
          <span className="path-review__legend-label">Failed</span>
          <HelpTooltip
            tipId="delete-failed-icon-tip"
            category="path-review-delete-failed"
            position="above"
            content={
              <p>Removal failed for these items. Click to mark them for retry.</p>
            }
          />
        </div>
        <div className="path-review__legend-item">
          <RotateCw size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--retry" />
          <span className="path-review__legend-label">Retry</span>
          <HelpTooltip
            tipId="delete-retry-icon-tip"
            category="path-review-delete-retry"
            position="above"
            content={
              <p>Items marked for removal retry. Click again to undo.</p>
            }
          />
        </div>
        {showDestinationOnly && (
          <div className="path-review__legend-item">
            <Check size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--exists-only-dst" />
            <span className="path-review__legend-label">Exists (Destination Only)</span>
          </div>
        )}
      </div>
    );
  }

  if (isSourceCleanup) {
    return (
      <div className={`path-review__legend ${className}`}>
        <div className="path-review__legend-item">
          <Clock size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--pending" />
          <span className="path-review__legend-label">Pending Removal</span>
          <HelpTooltip
            tipId="delete-pending-icon-tip"
            category="path-review-delete-pending"
            position="above"
            content={
              <p>These items were copied successfully and are scheduled for removal from the source. Click to exclude an item from removal.</p>
            }
          />
        </div>
        <div className="path-review__legend-item">
          <X size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--excluded" />
          <span className="path-review__legend-label">Excluded from Removal</span>
          <HelpTooltip
            tipId="delete-skipped-icon-tip"
            category="path-review-delete-skipped"
            position="above"
            content={
              <p>These items will be kept on the source. Click to include them in the removal plan again.</p>
            }
          />
        </div>
        {showDestinationOnly && (
          <div className="path-review__legend-item">
            <Check size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--exists-only-dst" />
            <span className="path-review__legend-label">Exists (Destination Only)</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`path-review__legend ${className}`}>
      {!isCopyPhase && (
        <div className="path-review__legend-item">
          <Clock size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--pending" />
          <span className="path-review__legend-label">Pending</span>
          <HelpTooltip
            tipId="pending-icon-tip"
            category="path-review-pending"
            position="above"
            content={
              <p>Click these icons on the items to mark them to be excluded from copying over.</p>
            }
          />
        </div>
      )}
      <div className="path-review__legend-item">
        <X size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--excluded" />
        <span className="path-review__legend-label">Excluded</span>
        <HelpTooltip
          tipId="excluded-icon-tip"
          category="path-review-excluded"
          position="above"
          content={
            isCopyPhase ? (
              <p>These items were explicitly excluded from being copied over as per your request in the discovery path review section.</p>
            ) : (
              <p>Pending items can be marked as excluded from the copy operation.</p>
            )
          }
        />
      </div>
      <div className="path-review__legend-item">
        <Check size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--exists" />
        <span className="path-review__legend-label">Exists (Both)</span>
      </div>
      {showDestinationOnly && (
        <div className="path-review__legend-item">
          <Check size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--exists-only-dst" />
          <span className="path-review__legend-label">Exists (Destination Only)</span>
          <HelpTooltip
            tipId="exists-dst-only-icon-tip"
            category="path-review-destination-only"
            position="above"
            content={
              <p>Folders with this status are shown for awareness and are not explored during discovery to save on performance and time. Already exists so no need to copy over.</p>
            }
          />
        </div>
      )}
      <div className="path-review__legend-item">
        <AlertCircle size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--failed" />
        <span className="path-review__legend-label">Failed</span>
        <HelpTooltip
          tipId="failed-icon-tip"
          category="path-review-failed"
          position="above"
          content={
            <p>Failed items can be marked for retry to be {isCopyPhase ? "copied" : "explored"} again.</p>
          }
        />
      </div>
      <div className="path-review__legend-item">
        <RotateCw size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--retry" />
        <span className="path-review__legend-label">Retry</span>
        <HelpTooltip
          tipId="retry-icon-tip"
          category="path-review-retry"
          position="above"
          content={
            <p>Items marked for retry can be marked again to undo queueing them to be retried.</p>
          }
        />
      </div>
    </div>
  );
}
