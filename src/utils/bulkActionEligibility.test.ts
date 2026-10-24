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
    ...partial,
  } as DiffItem;
}

describe("bulkActionEligibility", () => {
  it("blocks exclude for items already on the destination", () => {
    const it1 = item({});
    expect(
      bulkActionInvalidReason("exclude", it1, status({ existsOnBoth: true }), "traversal")
    ).toBe("Already on the destination");
    expect(
      bulkActionInvalidReason("exclude", it1, status({ existsOnlyOnDst: true }), "traversal")
    ).toBe("Destination only");
    expect(
      bulkActionInvalidReason("exclude", it1, status({}), "traversal")
    ).toBeNull();
  });

  it("partitions a mixed selection for exclude", () => {
    const pending = item({ id: "a", name: "pending.txt" });
    const onBoth = item({ id: "b", name: "copied.txt" });
    const statuses = new Map<string, PathReviewItemStatus>([
      ["a", status({})],
      ["b", status({ existsOnBoth: true })],
    ]);
    const { valid, invalid } = partitionBulkAction(
      [pending, onBoth],
      "exclude",
      (i) => statuses.get(i.id)!,
      "traversal"
    );
    expect(valid).toEqual([pending]);
    expect(invalid).toEqual([{ item: onBoth, reason: "Already on the destination" }]);
  });

  it("gates mark for retry on failed state and unmark on marked state", () => {
    const failed = item({ id: "f", src: { traversalStatus: "failed" } as DiffItem["src"] });
    expect(
      bulkActionInvalidReason("mark_retry", failed, status({ isFailed: true }), "traversal")
    ).toBeNull();
    expect(
      bulkActionInvalidReason("mark_retry", failed, status({}), "traversal")
    ).toBe("Not in a failed state");
    expect(
      bulkActionInvalidReason("mark_failed", failed, status({ isFailed: true }), "traversal")
    ).toBe("Not marked for retry");
  });

  it("keeps born-pending copy items out of mark failed and mark for retry", () => {
    const bornPending = item({
      id: "p",
      copyStatus: "pending",
      src: { copyStatus: "pending" } as DiffItem["src"],
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
      src: { copyStatus: "pending", copyRetryMarked: true } as DiffItem["src"],
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
      src: { copyStatus: "failed" } as DiffItem["src"],
    });
    expect(
      bulkActionInvalidReason("mark_retry", failed, status({ isFailed: true }), "copy")
    ).toBeNull();
    expect(
      bulkActionInvalidReason("mark_failed", failed, status({ isFailed: true }), "copy")
    ).toBe("Not marked for retry");
  });
});
