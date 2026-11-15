import { describe, expect, it } from "vitest";
import type { DiffItem } from "../api/services";
import {
  canForceReplaceCopy,
  canUnforceReplaceCopy,
  isExistsOnBothFile,
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

  it("requires a paired file for exists-on-both", () => {
    expect(
      isExistsOnBothFile(
        item({
          src: { id: "s1" } as DiffItem["src"],
          dst: { id: "d1" } as DiffItem["dst"],
        })
      )
    ).toBe(true);
    expect(
      isExistsOnBothFile(
        item({
          type: "folder",
          src: { id: "s1" } as DiffItem["src"],
          dst: { id: "d1" } as DiffItem["dst"],
        })
      )
    ).toBe(false);
    expect(
      isExistsOnBothFile(
        item({ src: { id: "s1" } as DiffItem["src"], dst: null })
      )
    ).toBe(false);
  });

  it("shows Replace with source only for already_existed paired files", () => {
    const both = item({
      src: { id: "s1", copyStatus: "already_existed" } as DiffItem["src"],
      dst: { id: "d1" } as DiffItem["dst"],
      copyStatus: "already_existed",
    });
    expect(canForceReplaceCopy(both, true)).toBe(true);
    expect(canForceReplaceCopy(both, false)).toBe(false);
    expect(
      canForceReplaceCopy(
        item({
          src: { id: "s1", copyStatus: "already_existed" } as DiffItem["src"],
          copyStatus: "already_existed",
        }),
        true
      )
    ).toBe(false);
    expect(
      canForceReplaceCopy(
        item({
          type: "folder",
          src: { id: "f1", copyStatus: "already_existed" } as DiffItem["src"],
          dst: { id: "d1" } as DiffItem["dst"],
          copyStatus: "already_existed",
        }),
        true
      )
    ).toBe(false);
  });

  it("shows Keep destination only for pending paired files", () => {
    const pendingBoth = item({
      src: { id: "s1", copyStatus: "pending" } as DiffItem["src"],
      dst: { id: "d1" } as DiffItem["dst"],
      copyStatus: "pending",
    });
    expect(canUnforceReplaceCopy(pendingBoth, true)).toBe(true);

    const forced = item({
      src: {
        id: "s1",
        copyStatus: "pending",
        copyForceReplaceMarked: true,
      } as DiffItem["src"],
      dst: { id: "d1" } as DiffItem["dst"],
      copyStatus: "pending",
    });
    expect(canUnforceReplaceCopy(forced, true)).toBe(true);

    const folder = item({
      type: "folder",
      src: { id: "f1", copyStatus: "already_existed" } as DiffItem["src"],
      dst: { id: "d1" } as DiffItem["dst"],
      copyStatus: "already_existed",
    });
    expect(canUnforceReplaceCopy(folder, true)).toBe(false);

    const srcOnlyPending = item({
      src: { id: "s1", copyStatus: "pending" } as DiffItem["src"],
      copyStatus: "pending",
    });
    expect(canUnforceReplaceCopy(srcOnlyPending, true)).toBe(false);
  });
});
