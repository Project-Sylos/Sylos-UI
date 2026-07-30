import { describe, expect, it } from "vitest";
import { buildSearchRequest } from "../api/services";

describe("buildSearchRequest", () => {
  it("omits conditions when no filters are set", () => {
    const body = buildSearchRequest({ typeFilter: "both" });
    expect(body.conditions).toBeUndefined();
  });

  it("includes query and status filters as conditions", () => {
    const body = buildSearchRequest({
      query: "report",
      searchField: "name",
      traversalStatusFilter: "failed",
      pathIssueStatusFilter: "issues",
    });
    expect(body.conditions).toEqual(
      expect.arrayContaining([
        { field: "name", value: "report" },
        { field: "traversalStatus", value: "failed" },
        { field: "pathIssueStatus", value: "issues" },
      ])
    );
  });
});
