import { describe, expect, it } from "vitest";
import {
  destinationRootChildrenPayload,
  includedSourceChildNames,
} from "./useRootIncludeSelection";
import { Folder } from "../types/services";
import { MigrationRootChild } from "../types/migrations";

function child(name: string, type: "file" | "folder", id = name): Folder {
  return {
    ServiceID: id,
    Id: id,
    name,
    locationPath: `/${name}`,
    type,
  };
}

describe("includedSourceChildNames", () => {
  it("returns only non-excluded names", () => {
    const tree: MigrationRootChild[] = [
      { id: "b", name: "b", type: "folder", excluded: false },
      { id: "c", name: "c", type: "folder", excluded: false },
      { id: "d", name: "d", type: "folder", excluded: true },
    ];
    expect(includedSourceChildNames(tree)).toEqual(["b", "c"]);
  });
});

/** Mirrors IncludeStore shape for cascade-inherit regression tests. */
type TestStore = {
  marks: Record<string, Record<string, boolean>>;
  items: Record<string, { ServiceID: string; Id?: string; name: string; type: string }[]>;
  reasons: Record<string, string>;
};

function testFolderId(item: { ServiceID: string; Id?: string }) {
  return item.ServiceID || item.Id || "";
}

function testListedParentId(store: TestStore, id: string): string | undefined {
  for (const [parentId, kids] of Object.entries(store.items)) {
    for (const child of kids) {
      if (testFolderId(child) === id) return parentId;
    }
  }
  return undefined;
}

function testIsExplicitlyExcluded(store: TestStore, id: string): boolean {
  if (store.reasons[id]) return true;
  for (const level of Object.values(store.marks)) {
    if (level[id] === false) return true;
  }
  return false;
}

function testIsExplicitlyIncluded(store: TestStore, id: string): boolean {
  for (const level of Object.values(store.marks)) {
    if (level[id] === true) return true;
  }
  return false;
}

function testIsEffectivelyIncluded(
  store: TestStore,
  id: string,
  seen = new Set<string>()
): boolean {
  if (!id || seen.has(id)) return false;
  seen.add(id);
  if (testIsExplicitlyExcluded(store, id)) return false;
  if (testIsExplicitlyIncluded(store, id)) return true;
  const parentId = testListedParentId(store, id);
  if (parentId === undefined) return false;
  return testIsEffectivelyIncluded(store, parentId, seen);
}

function testReadIncluded(
  store: TestStore,
  parentId: string,
  childId: string
): boolean {
  const level = store.marks[parentId] ?? {};
  if (Object.prototype.hasOwnProperty.call(level, childId)) {
    return level[childId] === true;
  }
  if (testIsEffectivelyIncluded(store, parentId)) return true;
  return false;
}

describe("cascade include inheritance", () => {
  it("inherits include into nested folder when only siblings were unchecked", () => {
    const store: TestStore = {
      marks: {
        root: { mnt: true, other: false },
        mnt: { sibling: false },
      },
      items: {
        root: [
          { ServiceID: "mnt", name: "mnt", type: "folder" },
          { ServiceID: "other", name: "other", type: "folder" },
        ],
        mnt: [
          { ServiceID: "media", name: "media", type: "folder" },
          { ServiceID: "sibling", name: "sibling", type: "folder" },
        ],
      },
      reasons: {},
    };
    expect(testIsEffectivelyIncluded(store, "media")).toBe(true);
    expect(testReadIncluded(store, "media", "child-a")).toBe(true);
  });
});

describe("destinationRootChildrenPayload", () => {
  it("marks non-overlapping names as dstOnly", () => {
    const payload = destinationRootChildrenPayload(
      [
        child("b", "folder"),
        child("c", "folder"),
        child("e", "folder"),
      ],
      ["b", "c"]
    );
    expect(payload).toEqual([
      expect.objectContaining({ name: "b", dstOnly: false }),
      expect.objectContaining({ name: "c", dstOnly: false }),
      expect.objectContaining({ name: "e", dstOnly: true }),
    ]);
  });

  it("marks non-overlapping names as dstOnly for files too", () => {
    const payload = destinationRootChildrenPayload(
      [child("only-here.txt", "file"), child("Reports", "file")],
      ["Reports"]
    );
    expect(payload).toEqual([
      expect.objectContaining({ name: "only-here.txt", dstOnly: true }),
      expect.objectContaining({ name: "Reports", dstOnly: false }),
    ]);
  });

  it("preserves trailing spaces in basenames for GPL", () => {
    const payload = destinationRootChildrenPayload(
      [child("Extra Space ", "folder")],
      ["Extra Space "]
    );
    expect(payload[0]?.name).toBe("Extra Space ");
    expect(payload[0]?.dstOnly).toBe(false);
  });

  it("does not mark dstOnly when source names are empty", () => {
    const payload = destinationRootChildrenPayload(
      [child("e", "folder")],
      []
    );
    expect(payload[0]?.dstOnly).toBe(false);
  });
});
