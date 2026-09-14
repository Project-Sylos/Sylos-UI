import { describe, expect, it } from "vitest";
import {
  allMatchingSelectedLabel,
  excludeApplyLabel,
  showSelectAllMatchingEscalate,
  unexcludeApplyLabel,
} from "./pathReviewSelectMatching";

describe("pathReviewSelectMatching", () => {
  it("shows escalate only after all visible selected with active predicate", () => {
    expect(
      showSelectAllMatchingEscalate({
        searchPredicateActive: true,
        allMatchingSelected: false,
        visibleCount: 50,
        allVisibleSelected: true,
      })
    ).toBe(true);
    expect(
      showSelectAllMatchingEscalate({
        searchPredicateActive: true,
        allMatchingSelected: false,
        visibleCount: 50,
        allVisibleSelected: false,
      })
    ).toBe(false);
    expect(
      showSelectAllMatchingEscalate({
        searchPredicateActive: true,
        allMatchingSelected: true,
        visibleCount: 50,
        allVisibleSelected: true,
      })
    ).toBe(false);
    expect(
      showSelectAllMatchingEscalate({
        searchPredicateActive: false,
        allMatchingSelected: false,
        visibleCount: 50,
        allVisibleSelected: true,
      })
    ).toBe(false);
  });

  it("relabels exclude/unexclude when all matching selected", () => {
    expect(excludeApplyLabel(false)).toBe("Exclude");
    expect(excludeApplyLabel(true)).toBe("Exclude all matching");
    expect(unexcludeApplyLabel(false)).toBe("Unexclude");
    expect(unexcludeApplyLabel(true)).toBe("Unexclude all matching");
  });

  it("marks truncated totals with +", () => {
    expect(allMatchingSelectedLabel(100000, true)).toBe(
      "All 100,000+ matching selected"
    );
    expect(allMatchingSelectedLabel(42, false)).toBe(
      "All 42 matching selected"
    );
    expect(allMatchingSelectedLabel(null, false)).toBe("All matching selected");
  });
});
