/** Bulk-bar copy for path-review list select-all-matching escalate. */

export function showSelectAllMatchingEscalate(opts: {
  searchPredicateActive: boolean;
  allMatchingSelected: boolean;
  visibleCount: number;
  allVisibleSelected: boolean;
}): boolean {
  return (
    opts.searchPredicateActive &&
    !opts.allMatchingSelected &&
    opts.visibleCount > 0 &&
    opts.allVisibleSelected
  );
}

export function excludeApplyLabel(allMatchingSelected: boolean): string {
  return allMatchingSelected ? "Exclude all matching" : "Exclude";
}

export function unexcludeApplyLabel(allMatchingSelected: boolean): string {
  return allMatchingSelected ? "Unexclude all matching" : "Unexclude";
}

export function allMatchingSelectedLabel(
  total: number | null | undefined,
  truncated: boolean
): string {
  if (total == null) {
    return "All matching selected";
  }
  return `All ${total.toLocaleString()}${truncated ? "+" : ""} matching selected`;
}
