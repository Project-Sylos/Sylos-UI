import { CSSProperties } from "react";

export const LIST_DENSITY_MIN = 0;
export const LIST_DENSITY_MAX = 100;

export const LIST_ROWS_MAX = 20;
export const LIST_ROWS_MIN = 5;
export const LIST_ROWS_DEFAULT = 10;

/** Slider value (0–100) that yields {@link LIST_ROWS_DEFAULT} visible rows. */
export const LIST_DENSITY_DEFAULT = Math.round(
  ((LIST_ROWS_MAX - LIST_ROWS_DEFAULT) / (LIST_ROWS_MAX - LIST_ROWS_MIN)) *
    LIST_DENSITY_MAX
);

export const BROWSE_DENSITY_STORAGE_KEY = "sylos_browse_density";
export const PATH_REVIEW_DENSITY_STORAGE_KEY = "sylos_path_review_density";

const FALLBACK_VIEWPORT_PX = 360;

export function loadListDensity(storageKey: string): number {
  const saved = localStorage.getItem(storageKey);
  if (saved == null) {
    return LIST_DENSITY_DEFAULT;
  }
  const parsed = Number.parseInt(saved, 10);
  if (Number.isNaN(parsed)) {
    return LIST_DENSITY_DEFAULT;
  }
  return Math.max(LIST_DENSITY_MIN, Math.min(LIST_DENSITY_MAX, parsed));
}

export function saveListDensity(storageKey: string, value: number) {
  localStorage.setItem(storageKey, String(value));
}

export function densityToTargetRows(density: number): number {
  const t = density / LIST_DENSITY_MAX;
  return LIST_ROWS_MAX - t * (LIST_ROWS_MAX - LIST_ROWS_MIN);
}

export function listDensityToStyle(
  density: number,
  viewportHeightPx: number
): CSSProperties {
  const t = density / LIST_DENSITY_MAX;
  const targetRows = densityToTargetRows(density);
  const viewport = viewportHeightPx > 0 ? viewportHeightPx : FALLBACK_VIEWPORT_PX;

  const listGapPx = t * 8;
  const rowHeightPx = (viewport - (targetRows - 1) * listGapPx) / targetRows;
  const rowHeight = Math.max(14, rowHeightPx);

  const innerHeight = rowHeight - 2;
  const iconBox = Math.max(10, Math.min(innerHeight - 2, 10 + t * 34));
  const iconSize = Math.max(8, iconBox * 0.62);
  const padY = Math.max(0, (innerHeight - iconBox) / 2);
  const padX = 0.12 + t * 0.55;
  const rowGap = 0.12 + t * 0.4;
  const arrowSize = Math.max(10, Math.min(iconBox * 0.75, 10 + t * 12));
  const rowRadius = 3 + t * 9;

  return {
    "--browse-density": t,
    "--browse-target-rows": targetRows,
    "--browse-row-height": `${rowHeight}px`,
    "--browse-row-pad-y": `${padY}px`,
    "--browse-row-pad-x": `${padX}rem`,
    "--browse-row-gap": `${rowGap}rem`,
    "--browse-list-gap": `${listGapPx}px`,
    "--browse-icon-box": `${iconBox}px`,
    "--browse-icon-size": `${iconSize}px`,
    "--browse-arrow-size": `${arrowSize}px`,
    "--browse-row-radius": `${rowRadius}px`,
  } as CSSProperties;
}
