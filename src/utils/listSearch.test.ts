import { describe, expect, it } from "vitest";
import {
  canGoToNextPage,
  formatListShowingRange,
  hasListSearchPredicate,
  parseOptionalTotal,
} from "./listSearch";

describe("hasListSearchPredicate", () => {
  it("rejects empty / default filters", () => {
    expect(hasListSearchPredicate({})).toBe(false);
    expect(hasListSearchPredicate({ query: "  ", typeFilter: "both" })).toBe(false);
    expect(
      hasListSearchPredicate({
        depthFilter: "",
        sizeFilter: "",
        traversalStatusFilter: "",
      })
    ).toBe(false);
  });

  it("accepts text query or any active filter", () => {
    expect(hasListSearchPredicate({ query: "foo" })).toBe(true);
    expect(hasListSearchPredicate({ underPath: "/reports" })).toBe(true);
    expect(hasListSearchPredicate({ underPath: "/" })).toBe(false);
    expect(hasListSearchPredicate({ pathSegments: ["Reports", "Q1"] })).toBe(true);
    expect(hasListSearchPredicate({ pathSegments: ["", "  "] })).toBe(false);
    expect(hasListSearchPredicate({ typeFilter: "file" })).toBe(true);
    expect(hasListSearchPredicate({ depthFilter: "2" })).toBe(true);
    expect(hasListSearchPredicate({ sizeFilter: 1024 })).toBe(true);
    expect(hasListSearchPredicate({ traversalStatusFilter: "failed" })).toBe(true);
    expect(hasListSearchPredicate({ pathIssueStatusFilter: "issues" })).toBe(true);
    expect(hasListSearchPredicate({ pathIssueCategoryFilter: "EmptyPart" })).toBe(true);
    expect(hasListSearchPredicate({ hasAdvancedRules: true })).toBe(true);
  });
});

describe("parseOptionalTotal", () => {
  it("distinguishes known zero from unknown", () => {
    expect(parseOptionalTotal(0)).toBe(0);
    expect(parseOptionalTotal(undefined)).toBeUndefined();
    expect(parseOptionalTotal(null)).toBeUndefined();
    expect(parseOptionalTotal(42)).toBe(42);
    expect(parseOptionalTotal("7")).toBe(7);
  });
});

describe("canGoToNextPage", () => {
  it("uses hasMore when total is unknown", () => {
    expect(
      canGoToNextPage({ offset: 0, limit: 100, hasMore: true }, 0, 100)
    ).toBe(true);
    expect(
      canGoToNextPage({ offset: 0, limit: 100, hasMore: false }, 0, 100)
    ).toBe(false);
  });

  it("does not confuse known total=0 with unknown", () => {
    expect(
      canGoToNextPage({ offset: 0, limit: 100, total: 0, hasMore: true }, 0, 100)
    ).toBe(false);
  });

  it("uses total pages when total is known", () => {
    expect(
      canGoToNextPage({ offset: 0, limit: 100, total: 250, hasMore: true }, 0, 100)
    ).toBe(true);
    expect(
      canGoToNextPage({ offset: 200, limit: 100, total: 250, hasMore: false }, 2, 100)
    ).toBe(false);
  });
});

describe("formatListShowingRange", () => {
  it("formats known and unknown totals", () => {
    expect(
      formatListShowingRange({ offset: 0, limit: 100, total: 250, hasMore: true }, 100)
    ).toBe("1 to 100 of 250 items");
    expect(
      formatListShowingRange({ offset: 0, limit: 100, hasMore: true }, 100)
    ).toBe("1 to 100+ of ?");
    expect(
      formatListShowingRange({ offset: 0, limit: 100, hasMore: false }, 100)
    ).toBe("1 to 100 of ?");
    expect(
      formatListShowingRange({ offset: 0, limit: 100, total: 0, hasMore: false }, 100)
    ).toBe("0 items");
  });
});
