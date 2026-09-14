import { Info, Lightbulb, X } from "lucide-react";

import { isParentPathExclusionReason } from "../../utils/browseFilterPreview";

type BrowseIncludeControlProps = {
  included: boolean;
  filterReason?: string;
  onToggle: () => void;
};

/** Checkbox, or red X with reason when a filter preview marked the item skipped. */
export default function BrowseIncludeControl({
  included,
  filterReason,
  onToggle,
}: BrowseIncludeControlProps) {
  if (filterReason && !included) {
    const parentCascade = isParentPathExclusionReason(filterReason);
    return (
      <button
        type="button"
        className={`browse-folder__filter-x${
          parentCascade ? " browse-folder__filter-x--cascade" : ""
        }`}
        title={filterReason}
        aria-label={filterReason}
        onClick={(e) => {
          e.stopPropagation();
          if (!parentCascade) {
            onToggle();
          }
        }}
      >
        <X size={14} strokeWidth={3} aria-hidden />
      </button>
    );
  }

  return (
    <input
      type="checkbox"
      className="browse-folder__include-checkbox"
      checked={included}
      title={included ? "Included" : "Skipped"}
      aria-label={included ? "Included" : "Skipped"}
      onChange={onToggle}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

type BrowseParentExclusionBannerProps = {
  visible: boolean;
};

/** Explains why every row under this folder is marked skipped in the preview. */
export function BrowseParentExclusionBanner({
  visible,
}: BrowseParentExclusionBannerProps) {
  if (!visible) return null;
  return (
    <div className="browse-folder__parent-exclusion" role="status">
      <Lightbulb size={16} aria-hidden className="browse-folder__parent-exclusion-icon" />
      <p>
        A parent folder on this path is not included, so everything under it is
        skipped too. Go back up and check that folder if you want these items.
      </p>
      <span
        className="browse-folder__parent-exclusion-info"
        title="Traversal works the same way during the real migration: once a folder is not included, its children are never visited."
      >
        <Info size={15} aria-hidden />
      </span>
    </div>
  );
}
