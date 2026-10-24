/**
 * Pure helpers for Path Review list search: predicate gating, optional totals,
 * and hasMore-based pagination.
 */

export interface ListSearchPredicateInput {
  query?: string | null;
  pathSegments?: string[] | null;
  /** Folder + descendants scope (id_path). Root "/" does not count. */
  underPath?: string | null;
  typeFilter?: "both" | "folder" | "file" | null;
  depthFilter?: string | number | null;
  sizeFilter?: string | number | null;
  traversalStatusFilter?: string | null;
  copyStatusFilter?: string | null;
  deleteStatusFilter?: string | null;
  pathIssueStatusFilter?: string | null;
  pathIssueCategoryFilter?: string | null;
  /** True when an advanced filter-rules draft is non-empty. */
  hasAdvancedRules?: boolean;
}

/** True when the request would include at least one search condition. */
export function hasListSearchPredicate(input: ListSearchPredicateInput): boolean {
  if (input.hasAdvancedRules) {
    return true;
  }
  const under = typeof input.underPath === "string" ? input.underPath.trim() : "";
  if (under !== "" && under !== "/") {
    return true;
  }
  if (typeof input.query === "string" && input.query.trim() !== "") {
    return true;
  }
  if (
    Array.isArray(input.pathSegments) &&
    input.pathSegments.some((s) => typeof s === "string" && s.trim() !== "")
  ) {
    return true;
  }
  if (input.typeFilter && input.typeFilter !== "both") {
    return true;
  }
  if (hasNumericFilterValue(input.depthFilter)) {
    return true;
  }
  if (hasNumericFilterValue(input.sizeFilter)) {
    return true;
  }
  if (nonEmpty(input.traversalStatusFilter)) {
    return true;
  }
  if (nonEmpty(input.copyStatusFilter)) {
    return true;
  }
  if (nonEmpty(input.deleteStatusFilter)) {
    return true;
  }
  if (nonEmpty(input.pathIssueStatusFilter)) {
    return true;
  }
  if (nonEmpty(input.pathIssueCategoryFilter)) {
    return true;
  }
  return false;
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim() !== "";
}

function hasNumericFilterValue(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return !Number.isNaN(value);
  return value.trim() !== "";
}

export interface OptionalTotalPagination {
  offset: number;
  limit: number;
  /** Present when known; omit/undefined when the server did not count. */
  total?: number;
  hasMore: boolean;
}

/**
 * Parse a raw pagination total from API JSON.
 * Distinguishes known 0 from unknown/omitted (never coerce missing → 0).
 */
export function parseOptionalTotal(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return undefined;
}

/** Whether Next should be enabled given optional total vs hasMore. */
export function canGoToNextPage(
  pagination: OptionalTotalPagination,
  currentPage: number,
  itemsPerPage: number
): boolean {
  if (pagination.total !== undefined) {
    if (pagination.total <= 0) return false;
    const totalPages = Math.max(1, Math.ceil(pagination.total / itemsPerPage));
    return currentPage < totalPages - 1;
  }
  return Boolean(pagination.hasMore);
}

/**
 * Infer an exact total when the page is short or the server said hasMore=false.
 * Avoids an expensive count query for last/partial pages.
 */
export function inferExactTotalFromPage(input: {
  offset: number;
  limit: number;
  returnedCount: number;
  hasMore: boolean;
  total?: number;
}): number | undefined {
  if (input.total !== undefined) return input.total;
  const limit = input.limit > 0 ? input.limit : input.returnedCount;
  if (!input.hasMore || (limit > 0 && input.returnedCount < limit)) {
    return Math.max(0, input.offset + input.returnedCount);
  }
  return undefined;
}

/** Footer / range label for list search results. */
export function formatListShowingRange(
  pagination: OptionalTotalPagination,
  itemsPerPage: number,
  returnedCount?: number
): string {
  const inferred =
    pagination.total !== undefined
      ? pagination.total
      : returnedCount !== undefined
        ? inferExactTotalFromPage({
            offset: pagination.offset,
            limit: pagination.limit || itemsPerPage,
            returnedCount,
            hasMore: pagination.hasMore,
          })
        : undefined;

  const start = pagination.offset + 1;
  if (inferred !== undefined) {
    if (inferred <= 0) {
      return "0 items";
    }
    const end = Math.min(
      pagination.offset + (returnedCount ?? itemsPerPage),
      inferred
    );
    const noun = inferred === 1 ? "item" : "items";
    return `${start} to ${end} of ${inferred.toLocaleString()} ${noun}`;
  }
  const end = pagination.offset + itemsPerPage;
  if (pagination.hasMore) {
    return `${start} to ${end}+ of ?`;
  }
  return `${start} to ${end} of ?`;
}
