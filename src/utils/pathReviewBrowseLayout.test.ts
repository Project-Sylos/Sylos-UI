import { describe, expect, it } from "vitest";
import {
  browseLayoutPhaseKey,
  defaultBrowseLayoutForPhase,
  effectiveBrowseLayout,
  searchSideAllowsCopyFilters,
  searchSideAllowsPathIssueFilters,
} from "./pathReviewBrowseLayout";

describe("pathReviewBrowseLayout", () => {
  it("defaults dual for discovery and merged for copy/delete", () => {
    expect(defaultBrowseLayoutForPhase("traversal")).toBe("dual");
    expect(defaultBrowseLayoutForPhase("copy")).toBe("merged");
    expect(defaultBrowseLayoutForPhase("delete")).toBe("merged");
  });

  it("maps display phases onto preference buckets", () => {
    expect(browseLayoutPhaseKey("traversal")).toBe("traversal");
    expect(browseLayoutPhaseKey("copy")).toBe("copy");
    expect(browseLayoutPhaseKey("copy-plan")).toBe("copy");
    expect(browseLayoutPhaseKey("delete")).toBe("delete");
    expect(browseLayoutPhaseKey("source-cleanup")).toBe("delete");
  });

  it("forces dual on traversal and merged on delete/cleanup", () => {
    expect(effectiveBrowseLayout("merged", false, "traversal")).toBe("dual");
    expect(effectiveBrowseLayout("dual", true, "delete")).toBe("merged");
    expect(effectiveBrowseLayout("dual", false, "copy")).toBe("dual");
    expect(effectiveBrowseLayout("merged", false, "copy")).toBe("merged");
  });

  it("gates copy and path-issue filters by search side", () => {
    expect(searchSideAllowsCopyFilters("dst")).toBe(false);
    expect(searchSideAllowsCopyFilters("src")).toBe(true);
    expect(searchSideAllowsCopyFilters("both")).toBe(true);
    expect(searchSideAllowsPathIssueFilters("dst")).toBe(false);
    expect(searchSideAllowsPathIssueFilters("both")).toBe(true);
  });
});
