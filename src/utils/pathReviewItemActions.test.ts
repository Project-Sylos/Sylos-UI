import { describe, expect, it } from "vitest";
import type { DiffItem } from "../api/services";
import { getPathReviewItemStatus } from "./pathReviewItemStatus";
import {
  displayPhaseAllowsBulkExclude,
  getPathReviewItemActions,
} from "./pathReviewItemActions";

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

describe("pathReviewItemActions", () => {
  it("discovery: exclude only failed or ack-from-failed", () => {
    const ok = item({
      src: { id: "1", traversalStatus: "successful" } as DiffItem["src"],
    });
    const okStatus = getPathReviewItemStatus(ok, "traversal");
    const okActs = getPathReviewItemActions(ok, okStatus, "traversal");
    expect(okActs.canExclude).toBe(false);
    expect(okActs.excludeDisabledReason).toMatch(/failed/i);

    const failed = item({
      traversalStatus: "failed",
      src: { id: "1", traversalStatus: "failed" } as DiffItem["src"],
    });
    const failedStatus = getPathReviewItemStatus(failed, "traversal");
    const failedActs = getPathReviewItemActions(failed, failedStatus, "traversal");
    expect(failedActs.canExclude).toBe(true);
    expect(failedActs.excludeLabel).toBe("Exclude");
    expect(failedActs.canRetry).toBe(true);
    expect(failedActs.retryLabel).toBe("Mark for retry");
    expect(failedActs.statusTransitions).toEqual(["pending", "excluded"]);

    const ack = item({
      traversalStatus: "excluded",
      src: {
        id: "1",
        traversalStatus: "excluded",
        traversalAckFromFailed: true,
      } as DiffItem["src"],
    });
    const ackStatus = getPathReviewItemStatus(ack, "traversal");
    const ackActs = getPathReviewItemActions(ack, ackStatus, "traversal");
    expect(ackActs.canExclude).toBe(true);
    expect(ackActs.excludeLabel).toBe("Unexclude");
    expect(ackActs.isAcknowledgedExcluded).toBe(true);
    expect(ackActs.canRetry).toBe(true);
    expect(ackActs.retryLabel).toBe("Mark as failed");
    expect(ackActs.statusTransitions).toEqual(["failed", "pending"]);
  });

  it("discovery: root-pick skipped cannot exclude", () => {
    const skipped = item({
      traversalStatus: "excluded",
      src: { id: "1", traversalStatus: "excluded" } as DiffItem["src"],
    });
    const status = getPathReviewItemStatus(skipped, "traversal");
    const acts = getPathReviewItemActions(skipped, status, "traversal");
    expect(acts.canExclude).toBe(false);
    expect(acts.canRetry).toBe(true);
    expect(acts.statusTransitions).toEqual(["pending"]);
  });

  it("copy-plan: pending can exclude; complete cannot", () => {
    const pending = item({
      copyStatus: "pending",
      src: { id: "1", copyStatus: "pending", traversalStatus: "successful" } as DiffItem["src"],
    });
    const pendingStatus = getPathReviewItemStatus(pending, "copy");
    expect(
      getPathReviewItemActions(pending, pendingStatus, "copy-plan").canExclude
    ).toBe(true);

    const done = item({
      copyStatus: "successful",
      src: {
        id: "1",
        copyStatus: "successful",
        traversalStatus: "successful",
      } as DiffItem["src"],
    });
    const doneStatus = getPathReviewItemStatus(done, "copy");
    expect(
      getPathReviewItemActions(done, doneStatus, "copy-plan").canExclude
    ).toBe(false);
  });

  it("copy results: failed can acknowledge; successful cannot", () => {
    const failed = item({
      copyStatus: "failed",
      src: { id: "1", copyStatus: "failed", traversalStatus: "successful" } as DiffItem["src"],
    });
    const failedStatus = getPathReviewItemStatus(failed, "copy");
    const failedActs = getPathReviewItemActions(failed, failedStatus, "copy");
    expect(failedActs.canExclude).toBe(true);
    expect(failedActs.excludeIsAcknowledge).toBe(true);
    expect(failedActs.canRetry).toBe(true);

    const done = item({
      copyStatus: "successful",
      src: {
        id: "1",
        copyStatus: "successful",
        traversalStatus: "successful",
      } as DiffItem["src"],
    });
    const doneStatus = getPathReviewItemStatus(done, "copy");
    expect(getPathReviewItemActions(done, doneStatus, "copy").canExclude).toBe(
      false
    );
  });

  it("delete results: failed can acknowledge as skip", () => {
    const failed = item({
      src: {
        id: "1",
        deleteStatus: "failed",
        copyStatus: "successful",
        traversalStatus: "successful",
      } as DiffItem["src"],
    });
    const status = getPathReviewItemStatus(failed, "delete");
    const acts = getPathReviewItemActions(failed, status, "delete");
    expect(acts.canExclude).toBe(true);
    expect(acts.excludeLabel).toBe("Exclude");
    expect(acts.canRetry).toBe(true);
  });

  it("displayPhaseAllowsBulkExclude covers results and plans", () => {
    expect(displayPhaseAllowsBulkExclude("traversal")).toBe(true);
    expect(displayPhaseAllowsBulkExclude("copy")).toBe(true);
    expect(displayPhaseAllowsBulkExclude("copy-plan")).toBe(true);
    expect(displayPhaseAllowsBulkExclude("delete")).toBe(true);
    expect(displayPhaseAllowsBulkExclude("source-cleanup")).toBe(false);
  });

  it("copy-plan: soft proposal matching DST-only peer offers unique name", () => {
    const srcFolder = item({
      id: "src-cascade",
      name: "cascade*",
      type: "folder",
      proposedPath: "cascade",
      pathIssueStatus: "pending",
      src: {
        id: "src-cascade",
        copyStatus: "pending",
        traversalStatus: "successful",
      } as DiffItem["src"],
    });
    const dstPeer = item({
      id: "dst-cascade",
      name: "cascade",
      type: "folder",
      existsOnlyOnDst: true,
      dst: { id: "dst-cascade", name: "cascade" } as DiffItem["dst"],
    });
    const status = getPathReviewItemStatus(srcFolder, "copy-plan");
    const acts = getPathReviewItemActions(srcFolder, status, "copy-plan", {
      showCompatUI: true,
      folderPeers: [srcFolder, dstPeer],
    });
    expect(acts.canUniqueName).toBe(true);
    expect(acts.uniqueNameSuggestion).toBe("cascade (1)");
  });
});
