import React from "react";
import "./PathReviewFooterInfo.css";

interface PathReviewFooterInfoProps {
  items: Array<{
    label: string;
    value?: string | React.ReactNode;
    isRatio?: boolean; // Special case for ratio bar
    ratioValues?: {
      folders: number;
      files: number;
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
          return (
            <span key={index} className="path-review-footer-info__stat path-review-footer-info__stat--ratio">
              <span className="path-review-footer-info__stat-label">{item.label}:</span>
              <div className="path-review-footer-info__ratio-bar">
                <div 
                  className="path-review-footer-info__ratio-segment path-review-footer-info__ratio-segment--folders"
                  style={{ width: `${item.ratioValues.folders}%` }}
                />
                <div 
                  className="path-review-footer-info__ratio-segment path-review-footer-info__ratio-segment--files"
                  style={{ width: `${item.ratioValues.files}%` }}
                />
              </div>
              <span className="path-review-footer-info__ratio-labels">
                {item.ratioValues.folders.toFixed(1)}% / {item.ratioValues.files.toFixed(1)}%
              </span>
            </span>
          );
        }

        return (
          <span key={index} className="path-review-footer-info__stat">
            <span className="path-review-footer-info__stat-label">{item.label}:</span>
            <span className="path-review-footer-info__stat-value">{item.value}</span>
          </span>
        );
      })}
    </div>
  );
}

