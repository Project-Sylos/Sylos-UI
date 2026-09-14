import { describe, expect, it } from "vitest";
import { mapPathReviewStatusFilter } from "./pathReviewStatusFilters";

describe("mapPathReviewStatusFilter", () => {
  it("maps traversal review pending_retry to traversal pending", () => {
    expect(mapPathReviewStatusFilter("traversal", "pending_retry")).toEqual({
      statusSearchType: "traversal",
      traversalStatusFilter: "pending",
    });
  });

  it("maps traversal review failed to traversal failed", () => {
    expect(mapPathReviewStatusFilter("traversal", "failed")).toEqual({
      statusSearchType: "traversal",
      traversalStatusFilter: "failed",
    });
  });

  it("maps traversal review successful to traversal successful", () => {
    expect(mapPathReviewStatusFilter("traversal", "successful")).toEqual({
      statusSearchType: "traversal",
      traversalStatusFilter: "successful",
    });
  });

  it("ignores traversal review pending (hidden in UI)", () => {
    expect(mapPathReviewStatusFilter("traversal", "pending")).toEqual({});
  });

  it("maps copy review pending retry to copy pending", () => {
    expect(mapPathReviewStatusFilter("copy", "pending_retry")).toEqual({
      statusSearchType: "copy",
      copyStatusFilter: "pending",
    });
  });

  it("maps delete review successful to deleted", () => {
    expect(mapPathReviewStatusFilter("delete", "successful")).toEqual({
      statusSearchType: "delete",
      deleteStatusFilter: "deleted",
    });
  });

  it("maps delete review excluded to skipped", () => {
    expect(mapPathReviewStatusFilter("delete", "excluded")).toEqual({
      statusSearchType: "delete",
      deleteStatusFilter: "skipped",
    });
  });

  it("maps source cleanup pending to delete pending", () => {
    expect(mapPathReviewStatusFilter("source-cleanup", "pending")).toEqual({
      statusSearchType: "delete",
      deleteStatusFilter: "pending",
    });
  });

  it("maps source cleanup successful to copy successful", () => {
    expect(mapPathReviewStatusFilter("source-cleanup", "successful")).toEqual({
      statusSearchType: "copy",
      copyStatusFilter: "successful",
    });
  });
});
