import React from "react";
import HelpTooltip from "./HelpTooltip";
import "./PathReviewFooterInfo.css";

const RATIO_TIE_EPS = 1e-9;

/**
 * API ratios are 0–1. Convert to integer % for folders/files; they always sum to 100.
 * Floor the larger side’s percentage, then the other is 100 − that (so we never round both “up”).
 */
function folderFilePercentInts(foldersRatio: number, filesRatio: number): {
  folders: number;
  files: number;
} {
  const f = foldersRatio * 100;
  const fi = filesRatio * 100;
  if (!Number.isFinite(f) || !Number.isFinite(fi)) {
    return { folders: 0, files: 0 };
  }
  if (Math.abs(f - fi) < RATIO_TIE_EPS) {
    const x = Math.round(f);
    const clamped = Math.min(100, Math.max(0, x));
    return { folders: clamped, files: 100 - clamped };
  }
  if (f > fi) {
    const foldersInt = Math.min(100, Math.max(0, Math.floor(f)));
    return { folders: foldersInt, files: 100 - foldersInt };
  }
  const filesInt = Math.min(100, Math.max(0, Math.floor(fi)));
  return { folders: 100 - filesInt, files: filesInt };
}

interface PathReviewFooterInfoProps {
  items: Array<{
    label: string;
    value?: string | React.ReactNode;
    isRatio?: boolean; // Special case for ratio bar
    ratioValues?: {
      folders: number;
      files: number;
    };
    tooltip?: {
      tipId: string;
      category: string;
      content: React.ReactNode;
      position?: "above" | "right" | "left" | "below";
    };
  }>;
  className?: string;
}

export default function PathReviewFooterInfo({ items, className = "" }: PathReviewFooterInfoProps) {
  if (items.length === 0) return null;

  return (
    <div className={`path-review-footer-info ${className}`}>
      {items.map((item, index) => {
        if (item.isRatio && item.ratioValues) {
          const f = item.ratioValues.folders;
          const fi = item.ratioValues.files;
          const { folders: fp, files: fip } = folderFilePercentInts(f, fi);
          return (
            <span key={index} className="path-review-footer-info__stat path-review-footer-info__stat--ratio">
              <span className="path-review-footer-info__stat-label">{item.label}:</span>
              <div className="path-review-footer-info__ratio-bar">
                <div 
                  className="path-review-footer-info__ratio-segment path-review-footer-info__ratio-segment--folders"
                  style={{ width: `${fp}%` }}
                />
                <div 
                  className="path-review-footer-info__ratio-segment path-review-footer-info__ratio-segment--files"
                  style={{ width: `${fip}%` }}
                />
              </div>
              <span className="path-review-footer-info__ratio-labels">
                {fp}% / {fip}%
              </span>
            </span>
          );
        }

        return (
          <span key={index} className="path-review-footer-info__stat">
            <span className="path-review-footer-info__stat-label">
              {item.label}:
              {item.tooltip && (
                <HelpTooltip
                  tipId={item.tooltip.tipId}
                  category={item.tooltip.category}
                  position={item.tooltip.position || "above"}
                  content={item.tooltip.content}
                />
              )}
            </span>
            <span className="path-review-footer-info__stat-value">{item.value}</span>
          </span>
        );
      })}
    </div>
  );
}

