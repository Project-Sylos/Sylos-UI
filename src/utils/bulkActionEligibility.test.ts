import { describe, expect, it } from "vitest";
import type { DiffItem } from "../api/services";
import {
  bulkActionInvalidReason,
  partitionBulkAction,
} from "./bulkActionEligibility";
import type { PathReviewItemStatus } from "./pathReviewItemStatus";

function status(partial: Partial<PathReviewItemStatus>): PathReviewItemStatus {
  return {
    isExcluded: false,
    isTraversalSkipped: false,
    isPending: false,
    isSuccessful: false,
    existsOnBoth: false,
    existsOnlyOnDst: false,
    isFailed: false,
    ...partial,
  };
}

function item(partial: Partial<DiffItem>): DiffItem {
  return {
    id: "1",
    name: "item",
    type: "file",
    locationPath: "/1",
    depthLevel: 1,
    traversalStatus: "successful",
    ...partial,
  } as DiffItem;
}

describe("bulkActionEligibility", () => {
  it("discovery exclude only allows failed items", () => {
    const ok = item({
      src: { id: "a", traversalStatus: "successful" } as DiffItem["src"],
    });
    expect(
      bulkActionInvalidReason("exclude", ok, status({ isSuccessful: true }), "traversal")
    ).toMatch(/failed/i);

    const failed = item({
      traversalStatus: "failed",
      src: { id: "b", traversalStatus: "failed" } as DiffItem["src"],
    });
    expect(
      bulkActionInvalidReason("exclude", failed, status({ isFailed: true }), "traversal")
    ).toBeNull();
  });

  it("copy-plan exclude allows pending, blocks already excluded", () => {
    const pending = item({
      copyStatus: "pending",
      src: { id: "a", copyStatus: "pending" } as DiffItem["src"],
    });
    expect(
      bulkActionInvalidReason("exclude", pending, status({ isPending: true }), "copy-plan")
    ).toBeNull();
    const excluded = item({
      copyStatus: "exclusion_explicit",
      src: { id: "a", copyStatus: "exclusion_explicit" } as DiffItem["src"],
    });
    expect(
      bulkActionInvalidReason(
        "exclude",
        excluded,
        status({ isExcluded: true }),
        "copy-plan"
      )
    ).toBe("Already excluded");
  });

  it("partitions a mixed discovery selection for exclude", () => {
    const failed = item({
      id: "a",
      name: "failed.txt",
      traversalStatus: "failed",
      src: { id: "a", traversalStatus: "failed" } as DiffItem["src"],
    });
    const ok = item({
      id: "b",
      name: "ok.txt",
      src: { id: "b", traversalStatus: "successful" } as DiffItem["src"],
    });
    const statuses = new Map<string, PathReviewItemStatus>([
      ["a", status({ isFailed: true })],
      ["b", status({ isSuccessful: true })],
    ]);
    const { valid, invalid } = partitionBulkAction(
      [failed, ok],
      "exclude",
      (i) => statuses.get(i.id)!,
      "traversal"
    );
    expect(valid).toEqual([failed]);
    expect(invalid[0]?.item).toEqual(ok);
  });

  it("gates mark for retry on failed state and unmark on marked state", () => {
    const failed = item({
      id: "f",
      src: { id: "f", traversalStatus: "failed" } as DiffItem["src"],
    });
    expect(
      bulkActionInvalidReason("mark_retry", failed, status({ isFailed: true }), "traversal")
    ).toBeNull();
    const ok = item({
      id: "o",
      src: { id: "o", traversalStatus: "successful" } as DiffItem["src"],
    });
    expect(
      bulkActionInvalidReason("mark_retry", ok, status({ isSuccessful: true }), "traversal")
    ).toBe("Not in a failed state");
    expect(
      bulkActionInvalidReason("mark_failed", failed, status({ isFailed: true }), "traversal")
    ).toBe("Not marked for retry");
  });

  it("keeps born-pending copy items out of mark failed and mark for retry", () => {
    const bornPending = item({
      id: "p",
      copyStatus: "pending",
      src: { id: "p", copyStatus: "pending" } as DiffItem["src"],
    });
    expect(
      bulkActionInvalidReason("mark_failed", bornPending, status({ isPending: true }), "copy")
    ).toBe("Not marked for retry");
    expect(
      bulkActionInvalidReason("mark_retry", bornPending, status({ isPending: true }), "copy")
    ).toBe("Not in a failed state");
  });

  it("allows mark failed only for retry-marked copy pending items", () => {
    const marked = item({
      id: "m",
      copyStatus: "pending",
      src: { id: "m", copyStatus: "pending", copyRetryMarked: true } as DiffItem["src"],
    });
    expect(
      bulkActionInvalidReason("mark_failed", marked, status({ isPending: true }), "copy")
    ).toBeNull();
    expect(
      bulkActionInvalidReason("mark_retry", marked, status({ isPending: true }), "copy")
    ).toBe("Already marked for retry");

    const failed = item({
      id: "f",
      copyStatus: "failed",
      src: { id: "f", copyStatus: "failed" } as DiffItem["src"],
    });
    expect(
      bulkActionInvalidReason("mark_retry", failed, status({ isFailed: true }), "copy")
    ).toBeNull();
    expect(
      bulkActionInvalidReason("mark_failed", failed, status({ isFailed: true }), "copy")
    ).toBe("Not marked for retry");
  });

  it("copy results allow acknowledge exclude on failed", () => {
    const failed = item({
      copyStatus: "failed",
      src: { id: "f", copyStatus: "failed" } as DiffItem["src"],
    });
    expect(
      bulkActionInvalidReason("exclude", failed, status({ isFailed: true }), "copy")
    ).toBeNull();
  });
});
