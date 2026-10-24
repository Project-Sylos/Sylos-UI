/** Shared first-run tip ids for status-icon toggles (any review phase). */
export const STATUS_HINT = {
  exclude: "path-review-status-exclude",
  include: "path-review-status-include",
  markRetry: "path-review-status-mark-retry",
  undoRetry: "path-review-status-undo-retry",
} as const;

export const STATUS_HINT_COPY = {
  exclude:
    "Click this icon to leave the item out of the plan. You can click again later to put it back.",
  include:
    "This item is left out. Click the icon to put it back in the plan.",
  markRetry:
    "Click this icon to mark the item for retry. Click again to undo.",
  undoRetry:
    "Marked for retry. Click to undo and leave it as it was.",
} as const;
