import React from "react";
import { Clock, X, Check, AlertCircle, RotateCw } from "lucide-react";
import HelpTooltip from "./HelpTooltip";

export interface PathReviewLegendProps {
  zoomLevel?: number;
  className?: string;
  phase?: "traversal" | "copy";
}

export default function PathReviewLegend({
  zoomLevel = 1,
  className = "",
  phase = "traversal",
}: PathReviewLegendProps) {
  const isCopyPhase = phase === "copy";

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

