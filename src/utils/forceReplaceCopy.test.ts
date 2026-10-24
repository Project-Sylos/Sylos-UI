import { describe, expect, it } from "vitest";
import type { DiffItem } from "../api/services";
import {
  canForceReplaceCopy,
  canUnforceReplaceCopy,
  isForceReplaceReviewView,
} from "./forceReplaceCopy";

function item(partial: Partial<DiffItem>): DiffItem {
  return {
    id: "1",
    name: "item",
    type: "file",
    ...partial,
  } as DiffItem;
}

describe("forceReplaceCopy", () => {
  it("allows force-replace on copy-plan and awaiting-copy-review only", () => {
    expect(isForceReplaceReviewView(true, false, false)).toBe(true);
    expect(isForceReplaceReviewView(false, false, true)).toBe(true);
    expect(isForceReplaceReviewView(false, true, true)).toBe(false);
    expect(isForceReplaceReviewView(false, false, false)).toBe(false);
  });

  it("gates force-replace on already_existed SRC nodes", () => {
    const both = item({
      src: { id: "s1", copyStatus: "already_existed" } as DiffItem["src"],
      copyStatus: "already_existed",
    });
    expect(canForceReplaceCopy(both, true)).toBe(true);
    expect(canForceReplaceCopy(both, false)).toBe(false);
    expect(
      canForceReplaceCopy(
        item({ src: { id: "s1", copyStatus: "pending" } as DiffItem["src"] }),
        true
      )
    ).toBe(false);
  });

  it("gates undo on forced pending or already_existed folders", () => {
    const forced = item({
      src: {
        id: "s1",
        copyStatus: "pending",
        copyForceReplaceMarked: true,
      } as DiffItem["src"],
      copyStatus: "pending",
    });
    expect(canUnforceReplaceCopy(forced, true)).toBe(true);

    const folder = item({
      id: "f1",
      type: "folder",
      src: { id: "f1", copyStatus: "already_existed" } as DiffItem["src"],
      copyStatus: "already_existed",
    });
    expect(canUnforceReplaceCopy(folder, true)).toBe(true);

    const plainPending = item({
      src: { id: "s1", copyStatus: "pending" } as DiffItem["src"],
      copyStatus: "pending",
    });
    expect(canUnforceReplaceCopy(plainPending, true)).toBe(false);
  });
});
