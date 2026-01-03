import React from "react";
import { Clock, X, Check, AlertCircle, RotateCw } from "lucide-react";

export interface PathReviewLegendProps {
  zoomLevel?: number;
  className?: string;
}

export default function PathReviewLegend({
  zoomLevel = 1,
  className = "",
}: PathReviewLegendProps) {
  return (
    <div className={`path-review__legend ${className}`}>
      <div className="path-review__legend-item">
        <Clock size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--pending" />
        <span className="path-review__legend-label">Pending</span>
      </div>
      <div className="path-review__legend-item">
        <X size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--excluded" />
        <span className="path-review__legend-label">Excluded</span>
      </div>
      <div className="path-review__legend-item">
        <Check size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--exists" />
        <span className="path-review__legend-label">Exists (Both)</span>
      </div>
      <div className="path-review__legend-item">
        <Check size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--exists-only-dst" />
        <span className="path-review__legend-label">Exists (Destination Only)</span>
      </div>
      <div className="path-review__legend-item">
        <AlertCircle size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--failed" />
        <span className="path-review__legend-label">Failed</span>
      </div>
      <div className="path-review__legend-item">
        <RotateCw size={14 * zoomLevel} className="path-review__legend-icon path-review__legend-icon--retry" />
        <span className="path-review__legend-label">Retry</span>
      </div>
    </div>
  );
}

