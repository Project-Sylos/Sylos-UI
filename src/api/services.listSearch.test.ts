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

  it("emits ordered path conditions for each in-path segment", () => {
    const body = buildSearchRequest({
      searchField: "path",
      pathSegments: ["Reports", "Q1", "summ"],
    });
    expect((body.conditions ?? []).filter((c) => c.field === "path").map((c) => c.value)).toEqual([
      "Reports",
      "Q1",
      "summ",
    ]);
  });

  it("falls back to single query as one path condition", () => {
    const body = buildSearchRequest({
      searchField: "path",
      query: "Reports",
    });
    expect(body.conditions ?? []).toEqual([{ field: "path", value: "Reports" }]);
  });

  it("skips blank path segments and ignores them in name mode", () => {
    const pathBody = buildSearchRequest({
      searchField: "path",
      pathSegments: ["  ", "Reports", "", "Q1"],
    });
    expect((pathBody.conditions ?? []).filter((c) => c.field === "path").map((c) => c.value)).toEqual([
      "Reports",
      "Q1",
    ]);
    const nameBody = buildSearchRequest({
      searchField: "name",
      query: "summary.txt",
      pathSegments: ["ignored"],
    });
    expect((nameBody.conditions ?? []).filter((c) => c.field === "path")).toEqual([]);
    expect((nameBody.conditions ?? []).filter((c) => c.field === "name")).toEqual([
      { field: "name", value: "summary.txt" },
    ]);
  });
});
