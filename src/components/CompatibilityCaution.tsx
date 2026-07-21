import { AlertTriangle, Info } from "lucide-react";
import { DiffItem } from "../api/services";
import {
  PATH_REVIEW_COPY,
  destinationDisplayName,
  isAutoHandledCompat,
  needsManualCompatAction,
  pathIssueShortLabel,
} from "../utils/pathReviewCopy";
import "./CompatibilityCaution.css";

type CompatibilityCautionProps = {
  item: DiffItem;
  /** Compact name-adjacent badge (icon only); details live in the inspector. */
  compact?: boolean;
};

/**
 * Decorative name-adjacent badge.
 * Auto-suggested renames use an info icon (heads-up). Manual rename uses caution.
 * Clicks fall through so the row selects and opens the inspector.
 */
export default function CompatibilityCaution({
  item,
  compact = true,
}: CompatibilityCautionProps) {
  const hasIssue = Boolean(item.pathIssueStatus || item.proposedPath);
  if (!hasIssue) return null;

  const auto = isAutoHandledCompat(item);
  const needsAction = needsManualCompatAction(item);
  const shortLabel = pathIssueShortLabel(item.pathIssueMessages);
  const resolution = destinationDisplayName(item);
  const tip = auto
    ? PATH_REVIEW_COPY.compatAutoHandledSummary(
        Math.max(1, item.pathIssueMessages?.length || 1),
        resolution
      )
    : shortLabel;
  const aria = auto
    ? `${PATH_REVIEW_COPY.compatibilityWarningLabel}: ${tip}`
    : `${PATH_REVIEW_COPY.compatibilityNeedsActionLabel}: ${shortLabel}`;

  return (
    <span
      className={`compatibility-caution${
        compact ? " compatibility-caution--compact" : ""
      }${auto ? " compatibility-caution--info" : ""}${
        needsAction ? " compatibility-caution--action" : ""
      }`}
      aria-label={aria}
      title={tip}
    >
      {auto ? (
        <Info size={14} aria-hidden />
      ) : (
        <AlertTriangle size={14} aria-hidden />
      )}
      {!compact ? (
        <span className="compatibility-caution__label-text">{shortLabel}</span>
      ) : null}
    </span>
  );
}
