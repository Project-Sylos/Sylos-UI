import { describe, expect, it } from "vitest";
import type { DiffItem } from "../api/services";
import {
  applyReviewStatusOptimistic,
  applyReviewStatusOptimisticToList,
  availableReviewStatusTransitions,
  currentReviewCycleStatus,
  nextReviewCycleStatus,
  reviewCycleClickTarget,
  reviewPeerMatchKey,
} from "./reviewStatusCycle";

function item(partial: Partial<DiffItem>): DiffItem {
  return {
    id: "1",
    name: "item",
    type: "file",
    ...partial,
  } as DiffItem;
}

describe("reviewStatusCycle", () => {
  it("orders failed → pending → excluded → failed", () => {
    expect(nextReviewCycleStatus("failed")).toBe("pending");
    expect(nextReviewCycleStatus("pending")).toBe("excluded");
    expect(nextReviewCycleStatus("excluded")).toBe("failed");
  });

  it("discovery cycles failed through retry and excluded", () => {
    const failed = item({
      traversalStatus: "failed",
      src: { id: "s1", traversalStatus: "failed" } as DiffItem["src"],
    });
    expect(currentReviewCycleStatus(failed, "discovery")).toBe("failed");
    expect(reviewCycleClickTarget(failed, "discovery")).toBe("pending");
    expect(availableReviewStatusTransitions(failed, "discovery")).toEqual([
      "pending",
      "excluded",
    ]);

    const pending = item({
      traversalStatus: "pending",
      src: { id: "s1", traversalStatus: "pending" } as DiffItem["src"],
    });
    expect(currentReviewCycleStatus(pending, "discovery")).toBe("pending");
    expect(reviewCycleClickTarget(pending, "discovery")).toBe("excluded");
    expect(availableReviewStatusTransitions(pending, "discovery")).toEqual([
      "failed",
      "excluded",
    ]);

    const excluded = item({
      traversalStatus: "excluded",
      src: {
        id: "s1",
        traversalStatus: "excluded",
        traversalAckFromFailed: true,
      } as DiffItem["src"],
    });
    expect(currentReviewCycleStatus(excluded, "discovery")).toBe("excluded");
    expect(reviewCycleClickTarget(excluded, "discovery")).toBe("failed");
    expect(availableReviewStatusTransitions(excluded, "discovery")).toEqual([
      "failed",
      "pending",
    ]);
  });

  it("copy and delete share the same failure-axis cycle", () => {
    const copyFailed = item({
      copyStatus: "failed",
      src: { id: "s1", copyStatus: "failed" } as DiffItem["src"],
    });
    expect(reviewCycleClickTarget(copyFailed, "copy")).toBe("pending");
    expect(availableReviewStatusTransitions(copyFailed, "copy")).toEqual([
      "pending",
      "excluded",
    ]);

    const deleteFailed = item({
      src: { id: "s1", deleteStatus: "failed" } as DiffItem["src"],
    });
    expect(reviewCycleClickTarget(deleteFailed, "delete")).toBe("pending");
    expect(availableReviewStatusTransitions(deleteFailed, "delete")).toEqual([
      "pending",
      "excluded",
    ]);
  });

  it("omits current status from context transitions", () => {
    const pending = item({
      src: {
        id: "s1",
        deleteStatus: "pending_explicit",
      } as DiffItem["src"],
    });
    expect(availableReviewStatusTransitions(pending, "delete")).not.toContain(
      "pending"
    );
  });

  it("discovery exclude syncs both failed sides and leaves a successful peer", () => {
    const dualFailed = item({
      traversalStatus: "failed",
      src: { id: "s1", traversalStatus: "failed" } as DiffItem["src"],
      dst: { id: "d1", traversalStatus: "failed" } as DiffItem["dst"],
    });
    const dualAcked = applyReviewStatusOptimistic(
      dualFailed,
      "discovery",
      "excluded"
    );
    expect(dualAcked.src?.traversalStatus).toBe("excluded");
    expect(dualAcked.src?.traversalAckFromFailed).toBe(true);
    expect(dualAcked.dst?.traversalStatus).toBe("excluded");
    expect(dualAcked.dst?.traversalAckFromFailed).toBe(true);

    const srcOnlyFailed = item({
      traversalStatus: "failed",
      src: { id: "s1", traversalStatus: "failed" } as DiffItem["src"],
      dst: { id: "d1", traversalStatus: "successful" } as DiffItem["dst"],
    });
    const srcAcked = applyReviewStatusOptimistic(
      srcOnlyFailed,
      "discovery",
      "excluded"
    );
    expect(srcAcked.src?.traversalStatus).toBe("excluded");
    expect(srcAcked.dst?.traversalStatus).toBe("successful");
  });

  it("discovery pending → excluded updates the retry icon to ack-excluded", () => {
    const pending = item({
      traversalStatus: "pending",
      src: { id: "s1", traversalStatus: "pending" } as DiffItem["src"],
      dst: { id: "d1", traversalStatus: "pending" } as DiffItem["dst"],
    });
    const excluded = applyReviewStatusOptimistic(
      pending,
      "discovery",
      "excluded"
    );
    expect(excluded.src?.traversalStatus).toBe("excluded");
    expect(excluded.src?.traversalAckFromFailed).toBe(true);
    expect(excluded.dst?.traversalStatus).toBe("excluded");
    expect(excluded.dst?.traversalAckFromFailed).toBe(true);
  });

  it("patches dual-pane peer rows that share name", () => {
    const srcRow = item({
      id: "s1",
      name: "a.txt",
      traversalStatus: "failed",
      src: { id: "s1", traversalStatus: "failed" } as DiffItem["src"],
    });
    const dstRow = item({
      id: "d1",
      name: "a.txt",
      traversalStatus: "failed",
      dst: { id: "d1", traversalStatus: "failed" } as DiffItem["dst"],
    });
    expect(reviewPeerMatchKey(srcRow)).toBe(reviewPeerMatchKey(dstRow));
    const patched = applyReviewStatusOptimisticToList(
      [srcRow, dstRow],
      srcRow,
      "discovery",
      "pending"
    );
    expect(patched[0].src?.traversalStatus).toBe("pending");
    expect(patched[1].dst?.traversalStatus).toBe("pending");
  });
});
