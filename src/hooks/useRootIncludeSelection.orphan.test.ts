import { describe, expect, it } from "vitest";

/**
 * Universal regression: breadcrumb bubble can mark child under parent before
 * that child appears in items[parent]. Unwinding must clear the mark via
 * parentOf / mark scan so siblings do not inherit include.
 */

type Store = {
  marks: Record<string, Record<string, boolean>>;
  items: Record<string, { ServiceID: string; type: string }[]>;
  reasons: Record<string, string>;
  prunedContainers: Record<string, boolean>;
  parentOf: Record<string, string>;
};

function hasExplicitIncludedChild(store: Store, parentId: string): boolean {
  return Object.values(store.marks[parentId] ?? {}).some((v) => v === true);
}

function parentsWithIncludeMark(store: Store, id: string): string[] {
  const out: string[] = [];
  for (const [parentId, level] of Object.entries(store.marks)) {
    if (level[id] === true) out.push(parentId);
  }
  return out;
}

function parentIdOf(store: Store, id: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(store.parentOf, id)) {
    return store.parentOf[id];
  }
  return undefined;
}

function clearFalseOnlyMarks(store: Store, parentId: string): Store {
  const level = store.marks[parentId];
  if (!level) return store;
  const nextLevel = { ...level };
  let changed = false;
  for (const id of Object.keys(nextLevel)) {
    if (nextLevel[id] === false && !store.reasons[id]) {
      delete nextLevel[id];
      changed = true;
    }
  }
  if (!changed) return store;
  const marks = { ...store.marks };
  if (Object.keys(nextLevel).length === 0) delete marks[parentId];
  else marks[parentId] = nextLevel;
  return { ...store, marks };
}

function clearIncludeMarksFor(store: Store, id: string): Store {
  const markParents = parentsWithIncludeMark(store, id);
  if (markParents.length === 0) return store;
  const pruned = { ...store.prunedContainers };
  const marks = { ...store.marks };
  for (const parentId of markParents) {
    const level = { ...(marks[parentId] ?? {}) };
    delete level[id];
    const stillHasTrue = Object.values(level).some((v) => v === true);
    if (!stillHasTrue) {
      for (const childId of Object.keys(level)) {
        if (level[childId] === false && !store.reasons[childId]) {
          delete level[childId];
        }
      }
      delete pruned[parentId];
    }
    if (Object.keys(level).length === 0) delete marks[parentId];
    else marks[parentId] = level;
  }
  return { ...store, marks, prunedContainers: pruned };
}

function clearOrphanedPrunedAncestors(store: Store, fromParentId: string): Store {
  let next = store;
  let cursor: string | undefined = fromParentId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    if (hasExplicitIncludedChild(next, cursor)) break;

    const climbTo = parentIdOf(next, cursor);
    const hadIncludeMark = parentsWithIncludeMark(next, cursor).length > 0;
    const wasPruned = !!next.prunedContainers[cursor];
    if (!wasPruned && !hadIncludeMark) {
      cursor = climbTo;
      continue;
    }

    const pruned = { ...next.prunedContainers };
    delete pruned[cursor];
    next = clearFalseOnlyMarks(
      clearIncludeMarksFor({ ...next, prunedContainers: pruned }, cursor),
      cursor
    );
    cursor = climbTo;
  }
  return next;
}

function isExplicitlyIncluded(store: Store, id: string): boolean {
  for (const level of Object.values(store.marks)) {
    if (level[id] === true) return true;
  }
  return false;
}

describe("clearOrphanedPrunedAncestors", () => {
  it("clears bubble marks using parentOf when the child was never listed under that parent", () => {
    const store: Store = {
      marks: {
        grandparent: { parent: true },
        parent: { picked: false, sibling: false },
      },
      items: {
        parent: [
          { ServiceID: "picked", type: "folder" },
          { ServiceID: "sibling", type: "folder" },
        ],
      },
      reasons: {},
      prunedContainers: { parent: true },
      parentOf: {
        parent: "grandparent",
        picked: "parent",
        sibling: "parent",
      },
    };

    const next = clearOrphanedPrunedAncestors(store, "parent");
    expect(isExplicitlyIncluded(next, "parent")).toBe(false);
    expect(next.prunedContainers.parent).toBeFalsy();
    expect(next.marks.parent).toBeUndefined();
    expect(next.marks.grandparent).toBeUndefined();
  });

  it("recovers when pruned was dropped but an include mark remains", () => {
    const store: Store = {
      marks: {
        grandparent: { parent: true },
        parent: {},
      },
      items: {
        parent: [
          { ServiceID: "a", type: "folder" },
          { ServiceID: "b", type: "folder" },
        ],
      },
      reasons: {},
      prunedContainers: {},
      parentOf: { parent: "grandparent", a: "parent", b: "parent" },
    };

    const next = clearOrphanedPrunedAncestors(store, "parent");
    expect(isExplicitlyIncluded(next, "parent")).toBe(false);
    expect(next.marks.grandparent).toBeUndefined();
  });
});
