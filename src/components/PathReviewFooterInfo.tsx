import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import HelpTooltip from "./HelpTooltip";
import "./PathReviewFooterInfo.css";

const RATIO_TIE_EPS = 1e-9;

/**
 * API ratios are 0–1. Convert to integer % for folders/files; they always sum to 100.
 * Floor the larger side’s percentage, then the other is 100 − that (so we never round both “up”).
 */
export function folderFilePercentInts(foldersRatio: number, filesRatio: number): {
  folders: number;
  files: number;
} {
  const f = foldersRatio * 100;
  const fi = filesRatio * 100;
  if (!Number.isFinite(f) || !Number.isFinite(fi)) {
    return { folders: 0, files: 0 };
  }
  if (Math.abs(f - fi) < RATIO_TIE_EPS) {
    // Both zero (or both equal): show matching percents, not a fake 0/100 split.
    if (f === 0 && fi === 0) {
      return { folders: 0, files: 0 };
    }
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

export type PathReviewSelectedHoverCard = {
  summary: string;
  foldersCount: number;
  filesCount: number;
  foldersRatio: number;
  filesRatio: number;
};

export type PathReviewFooterHighlight = "compat" | "failed";

export type PathReviewFooterItem = {
  label: string;
  value?: string | React.ReactNode;
  isRatio?: boolean; // Special case for ratio bar
  ratioValues?: {
    folders: number;
    files: number;
  };
  /** Soft chip highlight for non-zero attention counts. */
  highlight?: PathReviewFooterHighlight;
  /** Interactive Selected-style hover card (not the help-tip system). */
  selectedHoverCard?: PathReviewSelectedHoverCard;
  tooltip?: {
    tipId: string;
    category: string;
    content: React.ReactNode;
    position?: "above" | "right" | "left" | "below";
  };
};

interface PathReviewFooterInfoProps {
  items: PathReviewFooterItem[];
  className?: string;
}

function SelectedHoverStat({
  label,
  value,
  card,
}: {
  label: string;
  value?: string | React.ReactNode;
  card: PathReviewSelectedHoverCard;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const popoverId = useId();
  const { folders: fp, files: fip } = folderFilePercentInts(
    card.foldersRatio,
    card.filesRatio
  );

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    if (pinned) return;
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 120);
  };

  const show = () => {
    clearCloseTimer();
    setOpen(true);
  };

  useEffect(() => () => clearCloseTimer(), []);

  useEffect(() => {
    if (!open) return;

    const place = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const pad = 8;
      const gap = 8;
      const rect = trigger.getBoundingClientRect();
      const pop = popover.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - pop.width / 2;
      let top = rect.top - pop.height - gap;
      if (top < pad) {
        top = rect.bottom + gap;
      }
      if (left < pad) left = pad;
      if (left + pop.width > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - pop.width - pad);
      }
      if (top + pop.height > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - pop.height - pad);
      }
      setCoords({ top, left });
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, card.foldersCount, card.filesCount, card.foldersRatio, card.filesRatio, value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinned(false);
        setOpen(false);
      }
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) {
        return;
      }
      setPinned(false);
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <span className="path-review-footer-info__stat path-review-footer-info__stat--selected">
      <button
        ref={triggerRef}
        type="button"
        className={`path-review-footer-info__selected-trigger${
          open ? " path-review-footer-info__selected-trigger--open" : ""
        }`}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-haspopup="dialog"
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={show}
        onBlur={scheduleClose}
        onClick={() => {
          clearCloseTimer();
          if (pinned) {
            setPinned(false);
            setOpen(false);
            return;
          }
          setPinned(true);
          setOpen(true);
        }}
      >
        <span className="path-review-footer-info__stat-label">{label}</span>
        <span className="path-review-footer-info__stat-value">{value}</span>
      </button>
      {open
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              role="dialog"
              aria-label={`${label} breakdown`}
              className="path-review-footer-info__selected-card"
              style={
                coords
                  ? { top: coords.top, left: coords.left }
                  : { top: -9999, left: -9999, visibility: "hidden" }
              }
              onMouseEnter={show}
              onMouseLeave={scheduleClose}
            >
              <p className="path-review-footer-info__selected-card-summary">
                {card.summary}
              </p>
              <div className="path-review-footer-info__selected-card-counts">
                <span>
                  Folders{" "}
                  <strong>{card.foldersCount.toLocaleString()}</strong>
                </span>
                <span>
                  Files <strong>{card.filesCount.toLocaleString()}</strong>
                </span>
              </div>
              <div className="path-review-footer-info__selected-card-ratio">
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
                  {fp}% folders / {fip}% files
                </span>
              </div>
            </div>,
            document.body
          )
        : null}
    </span>
  );
}

export default function PathReviewFooterInfo({ items, className = "" }: PathReviewFooterInfoProps) {
  if (items.length === 0) return null;

  return (
    <div className={`path-review-footer-info ${className}`}>
      {items.map((item, index) => {
        if (item.selectedHoverCard) {
          return (
            <SelectedHoverStat
              key={index}
              label={item.label}
              value={item.value}
              card={item.selectedHoverCard}
            />
          );
        }

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

        const highlightClass =
          item.highlight === "compat"
            ? " path-review-footer-info__stat--compat"
            : item.highlight === "failed"
              ? " path-review-footer-info__stat--failed"
              : "";

        return (
          <span key={index} className={`path-review-footer-info__stat${highlightClass}`}>
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
