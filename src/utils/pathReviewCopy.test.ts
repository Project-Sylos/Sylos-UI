import { describe, expect, it } from "vitest";
import {
  canIgnorePathIssue,
  canRenameDestinationItem,
  collisionSiblingFromFolderPeers,
  hasDestinationRename,
  unpairedSide,
} from "./pathReviewCopy";

describe("unpairedSide", () => {
  it("classifies SRC-only and DST-only rows without renaming", () => {
    expect(unpairedSide({ src: { id: "s" }, dst: null })).toBe("src");
    expect(unpairedSide({ src: null, dst: { id: "d" } })).toBe("dst");
    expect(
      unpairedSide({
        src: null,
        dst: { id: "d" },
        existsOnlyOnDst: true,
      })
    ).toBe("dst");
    expect(unpairedSide({ src: { id: "s" }, dst: { id: "d" } })).toBe("");
  });
});

describe("canIgnorePathIssue", () => {
  it("allows soft suggestions and blocks manual_review", () => {
    expect(
      canIgnorePathIssue({
        pathIssueStatus: "pending",
        proposedPath: "clean",
      })
    ).toBe(true);
    expect(
      canIgnorePathIssue({
        pathIssueStatus: "manual_review",
      })
    ).toBe(false);
    expect(
      canIgnorePathIssue({
        pathIssueStatus: "manual_review",
        pathIssueIgnored: true,
      })
    ).toBe(true);
  });
});

describe("canRenameDestinationItem", () => {
  it("allows pending SRC copy items without a path issue", () => {
    expect(
      canRenameDestinationItem({
        name: "Reports",
        src: { copyStatus: "pending" },
        copyStatus: "pending",
      })
    ).toBe(true);
  });

  it("allows items that already have a path issue or proposal", () => {
    expect(
      canRenameDestinationItem({
        name: "bad*",
        src: { copyStatus: "already_existed" },
        copyStatus: "already_existed",
        pathIssueStatus: "pending",
      })
    ).toBe(true);
    expect(
      canRenameDestinationItem({
        name: "a",
        src: { copyStatus: "already_existed" },
        proposedPath: "a_clean",
      })
    ).toBe(true);
  });

  it("allows remapped names even without a live issue", () => {
    expect(
      canRenameDestinationItem({
        name: "Old",
        src: { copyStatus: "pending" },
        resolvedDstName: "New",
      })
    ).toBe(true);
  });

  it("rejects already_existed without issue or remap", () => {
    expect(
      canRenameDestinationItem({
        name: "Shared",
        src: { copyStatus: "already_existed" },
        dst: { name: "Shared" },
        copyStatus: "already_existed",
      })
    ).toBe(false);
  });

  it("rejects successful copy", () => {
    expect(
      canRenameDestinationItem({
        name: "done.txt",
        src: { copyStatus: "successful" },
        copyStatus: "successful",
      })
    ).toBe(false);
  });

  it("rejects destination-only rows", () => {
    expect(
      canRenameDestinationItem({
        name: "only-dst",
        dst: { name: "only-dst" },
        copyStatus: "pending",
      })
    ).toBe(false);
  });
});

describe("collisionSiblingFromFolderPeers / hasDestinationRename", () => {
  it("detects soft proposal colliding with DST-only sibling", () => {
    const src = {
      name: "cascade*",
      proposedPath: "cascade",
      src: { id: "s" },
    };
    const peers = [
      src,
      {
        name: "cascade",
        existsOnlyOnDst: true,
        dst: { id: "d" },
      },
    ];
    expect(collisionSiblingFromFolderPeers(src, peers)).toBe("cascade");
    expect(hasDestinationRename(src, peers)).toBe(false);
  });

  it("keeps soft rename when no DST sibling matches", () => {
    const src = {
      name: "bad*",
      proposedPath: "bad",
      src: { id: "s" },
    };
    expect(hasDestinationRename(src, [])).toBe(true);
  });
});
