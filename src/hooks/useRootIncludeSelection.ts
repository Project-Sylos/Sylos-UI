import { useCallback, useRef, useState } from "react";
import { Folder } from "../types/services";
import { MigrationRootChild } from "../types/migrations";
import {
  PARENT_PATH_EXCLUSION_REASON,
  isParentPathExclusionReason,
} from "../utils/browseFilterPreview";

/** Synthetic parent key reserved for destination root listings (immediate commit). */
export const ROOT_INCLUDE_PARENT = "";

/** Case-fold only. Do not trim: trailing spaces are real basename characters for GPL. */
function sourceChildNameSet(sourceChildNames?: string[]): Set<string> {
  return new Set(
    (sourceChildNames ?? [])
      .filter((n): n is string => typeof n === "string" && n !== "")
      .map((n) => n.toLowerCase())
  );
}

/** Display names of included (non-excluded) source root children for dest matching. */
export function includedSourceChildNames(
  children: MigrationRootChild[]
): string[] {
  return children.filter((c) => !c.excluded).map((c) => c.name);
}

function childBasename(item: Folder): string {
  if (typeof item.name === "string" && item.name !== "") {
    return item.name;
  }
  return "Untitled";
}

function folderId(item: Folder): string {
  return item.ServiceID || item.Id || "";
}

/**
 * Destination root children: name-match against intentionally included source
 * children. Non-matches are dstOnly (not traversed). Matching names are kept.
 */
export function destinationRootChildrenPayload(
  children: Folder[],
  sourceChildNames?: string[]
): MigrationRootChild[] {
  const sourceNames = sourceChildNameSet(sourceChildNames);
  return children.map((item) => {
    const id = folderId(item);
    const name = childBasename(item);
    const type = item.type === "file" ? "file" : "folder";
    const dstOnly =
      sourceNames.size > 0 && !sourceNames.has(name.toLowerCase());
    return {
      id,
      name,
      type,
      size: item.size,
      mtime: item.lastUpdated,
      excluded: false,
      dstOnly,
    };
  });
}

function folderToChild(
  item: Folder,
  included: boolean,
  nested?: MigrationRootChild[]
): MigrationRootChild {
  return {
    id: folderId(item),
    name: childBasename(item),
    type: item.type === "file" ? "file" : "folder",
    size: item.size,
    mtime: item.lastUpdated,
    excluded: !included,
    dstOnly: false,
    children: nested,
  };
}

function mergeListing(previous: Folder[] | undefined, next: Folder[]): Folder[] {
  if (!previous || previous.length === 0) {
    return next;
  }
  const byId = new Map(previous.map((item) => [folderId(item), item]));
  for (const item of next) {
    byId.set(folderId(item), item);
  }
  return [...byId.values()];
}

type IncludeStore = {
  /**
   * parentId -> childId -> include mark.
   * true = included, false = excluded.
   * Missing: opt-in at root-candidate folders; cascade-include under a checked folder.
   */
  marks: Record<string, Record<string, boolean>>;
  /** parentId -> children listed so far. */
  items: Record<string, Folder[]>;
  /** Parents whose complete listing (all pages) is known. */
  complete: Record<string, boolean>;
  /** childId -> filter rule skip reason, for the red-X preview. */
  reasons: Record<string, string>;
  /**
   * Folder ids included only as containers for selected descendants.
   * Known siblings under these parents default to excluded (not cascade-include).
   */
  prunedContainers: Record<string, boolean>;
  /**
   * childId -> parentId for every known containment edge (directory listings and
   * breadcrumb bubbles). Marks alone are not enough: a bubble can write
   * marks[parent][child] before that child appears in items[parent].
   */
  parentOf: Record<string, string>;
};

function emptyStore(): IncludeStore {
  return {
    marks: {},
    items: {},
    complete: {},
    reasons: {},
    prunedContainers: {},
    parentOf: {},
  };
}

/** Count of explicit true marks across all parent levels. */
function countExplicitIncludes(store: IncludeStore): number {
  let total = 0;
  for (const level of Object.values(store.marks)) {
    for (const value of Object.values(level)) {
      if (value) total++;
    }
  }
  return total;
}

/** True when parentId has at least one explicitly checked (true) child mark. */
function hasExplicitIncludedChild(store: IncludeStore, parentId: string): boolean {
  return Object.values(store.marks[parentId] ?? {}).some((v) => v === true);
}

/** Record child→parent for listings and breadcrumb bubbles. */
function rememberParent(
  store: IncludeStore,
  childId: string,
  parentId: string
): IncludeStore {
  if (!childId || store.parentOf[childId] === parentId) return store;
  return {
    ...store,
    parentOf: { ...store.parentOf, [childId]: parentId },
  };
}

function rememberParentsFromListing(
  store: IncludeStore,
  parentId: string,
  children: Folder[]
): IncludeStore {
  let next = store;
  for (const child of children) {
    const id = folderId(child);
    if (!id) continue;
    next = rememberParent(next, id, parentId);
  }
  return next;
}

/** Parent of id from the containment map, else from a listing scan. */
function parentIdOf(store: IncludeStore, id: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(store.parentOf, id)) {
    return store.parentOf[id];
  }
  return listedParentId(store, id);
}

/** Every parent level that currently has an explicit true mark for id. */
function parentsWithIncludeMark(store: IncludeStore, id: string): string[] {
  const out: string[] = [];
  for (const [parentId, level] of Object.entries(store.marks)) {
    if (level[id] === true) out.push(parentId);
  }
  return out;
}

/** Drop false-only marks under parentId (keep filter reasons and true marks). */
function clearFalseOnlyMarks(store: IncludeStore, parentId: string): IncludeStore {
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
  if (Object.keys(nextLevel).length === 0) {
    delete marks[parentId];
  } else {
    marks[parentId] = nextLevel;
  }
  return { ...store, marks };
}

/**
 * Remove every explicit true mark for id under any parent. If a parent level
 * then has no remaining trues, also drop its false-only sibling marks and its
 * pruned-container flag.
 */
function clearIncludeMarksFor(
  store: IncludeStore,
  id: string
): IncludeStore {
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
    if (Object.keys(level).length === 0) {
      delete marks[parentId];
    } else {
      marks[parentId] = level;
    }
  }
  return { ...store, marks, prunedContainers: pruned };
}

/**
 * After the last explicit include under a folder is cleared, unwind that folder
 * (and empty pruned ancestors) so siblings stop inheriting include. Works for
 * any path: containment comes from parentOf / mark parents, not a specific root.
 */
function clearOrphanedPrunedAncestors(
  store: IncludeStore,
  fromParentId: string
): IncludeStore {
  let next = store;
  let cursor: string | undefined = fromParentId;
  const seen = new Set<string>();
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    if (hasExplicitIncludedChild(next, cursor)) {
      break;
    }

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

/** Mark known siblings under parentId excluded except keepId. */
function pruneSiblingsExcept(
  store: IncludeStore,
  parentId: string,
  keepId: string
): IncludeStore {
  const kids = store.items[parentId] ?? [];
  if (kids.length === 0) return store;
  const level = { ...(store.marks[parentId] ?? {}) };
  for (const child of kids) {
    const id = folderId(child);
    if (!id || id === keepId) continue;
    if (level[id] === true) continue;
    level[id] = false;
  }
  return {
    ...store,
    marks: { ...store.marks, [parentId]: level },
  };
}

/** Under a pruned container, any child without an explicit include is excluded. */
function applyPruneDefaults(store: IncludeStore, parentId: string): IncludeStore {
  if (!store.prunedContainers[parentId]) return store;
  const kids = store.items[parentId] ?? [];
  if (kids.length === 0) return store;
  const level = { ...(store.marks[parentId] ?? {}) };
  let changed = false;
  for (const child of kids) {
    const id = folderId(child);
    if (!id) continue;
    if (Object.prototype.hasOwnProperty.call(level, id)) continue;
    level[id] = false;
    changed = true;
  }
  if (!changed) return store;
  return {
    ...store,
    marks: { ...store.marks, [parentId]: level },
  };
}

/** True when this folder id is explicitly marked included under some parent. */
function isExplicitlyIncluded(store: IncludeStore, id: string): boolean {
  if (!id) return false;
  for (const level of Object.values(store.marks)) {
    if (level[id] === true) return true;
  }
  return false;
}

/** True when explicitly unchecked or filter-marked. */
function isExplicitlyExcluded(store: IncludeStore, id: string): boolean {
  if (!id) return false;
  if (store.reasons[id]) return true;
  for (const level of Object.values(store.marks)) {
    if (level[id] === false) return true;
  }
  return false;
}

/** Parent key in items when id appears as a listed child, if any. */
function listedParentId(store: IncludeStore, id: string): string | undefined {
  for (const [parentId, kids] of Object.entries(store.items)) {
    for (const child of kids) {
      if (folderId(child) === id) return parentId;
    }
  }
  return undefined;
}

/**
 * Included when explicitly checked, or inheriting from an included ancestor
 * (e.g. mnt checked at root, media kept by unchecking siblings only).
 */
function isEffectivelyIncluded(
  store: IncludeStore,
  id: string,
  seen: Set<string> = new Set()
): boolean {
  if (!id || seen.has(id)) return false;
  seen.add(id);
  if (isExplicitlyExcluded(store, id)) return false;
  if (isExplicitlyIncluded(store, id)) return true;

  const parentId = parentIdOf(store, id);
  if (parentId === undefined) return false;
  return isEffectivelyIncluded(store, parentId, seen);
}

/** True when this id appears as a listed child under any parent. */
function isListedAsChild(store: IncludeStore, id: string): boolean {
  if (!id) return false;
  for (const kids of Object.values(store.items)) {
    for (const child of kids) {
      if (folderId(child) === id) return true;
    }
  }
  return false;
}

/**
 * Folder is skipped when explicitly unchecked, filter-marked, or listed as a
 * child that was never checked (opt-in). Root-candidate folders (never listed
 * as a child) are not skipped so their children stay selectable.
 */
function isMarkedSkipped(store: IncludeStore, id: string): boolean {
  if (!id) return false;
  if (isExplicitlyExcluded(store, id)) return true;
  if (isListedAsChild(store, id) && !isEffectivelyIncluded(store, id)) {
    return true;
  }
  return false;
}

function readIncluded(
  store: IncludeStore,
  parentId: string,
  childId: string
): boolean {
  const level = store.marks[parentId] ?? {};
  if (Object.prototype.hasOwnProperty.call(level, childId)) {
    return level[childId] === true;
  }
  // Pruned containers are opt-in: missing children are skipped, even when the
  // container itself is marked included as a path bubble.
  if (store.prunedContainers[parentId]) {
    return false;
  }
  // Under a fully included folder, missing marks inherit include.
  if (isEffectivelyIncluded(store, parentId)) {
    return true;
  }
  // Root-candidate (or unchecked parent): opt-in.
  return false;
}

/** Mark every known child under parentId as skipped because the parent is skipped. */
function cascadeParentExclusion(store: IncludeStore, parentId: string): IncludeStore {
  const kids = store.items[parentId] ?? [];
  if (kids.length === 0) return store;
  const level = { ...(store.marks[parentId] ?? {}) };
  const reasons = { ...store.reasons };
  for (const child of kids) {
    const id = folderId(child);
    if (!id) continue;
    level[id] = false;
    reasons[id] = PARENT_PATH_EXCLUSION_REASON;
  }
  let next: IncludeStore = {
    ...store,
    marks: { ...store.marks, [parentId]: level },
    reasons,
  };
  for (const child of kids) {
    const id = folderId(child);
    if (!id || child.type === "file" || !next.items[id]) continue;
    next = cascadeParentExclusion(next, id);
  }
  return next;
}

/** Drop parent-cascade marks under folderId after the parent is included again. */
function clearParentCascadeUnder(store: IncludeStore, id: string): IncludeStore {
  const kids = store.items[id] ?? [];
  if (kids.length === 0) return store;
  const level = { ...(store.marks[id] ?? {}) };
  const reasons = { ...store.reasons };
  for (const child of kids) {
    const childId = folderId(child);
    if (!childId) continue;
    if (!isParentPathExclusionReason(reasons[childId])) continue;
    // Restore cascade-include under the re-checked parent (missing = included).
    delete level[childId];
    delete reasons[childId];
  }
  let next: IncludeStore = {
    ...store,
    marks: { ...store.marks, [id]: level },
    reasons,
  };
  for (const child of kids) {
    const childId = folderId(child);
    if (!childId || child.type === "file" || !next.items[childId]) continue;
    next = clearParentCascadeUnder(next, childId);
  }
  return next;
}

/**
 * Browse-wide include state. Source root children are opt-in (nothing checked
 * until the user checks them or uses select-all). Checking a folder includes its
 * whole subtree until the user opens it and unchecks children.
 *
 * Backed by a ref so confirm handlers can read selections they just recorded,
 * with a mirrored state value driving re-renders.
 */
export function useRootIncludeSelection() {
  const storeRef = useRef<IncludeStore>(emptyStore());
  const [store, setStore] = useState<IncludeStore>(storeRef.current);
  const lastRowIndexRef = useRef<number | null>(null);

  const commit = useCallback((next: IncludeStore) => {
    storeRef.current = next;
    setStore(next);
  }, []);

  const recordChildren = useCallback(
    (parentId: string, children: Folder[], options?: { complete?: boolean }) => {
      lastRowIndexRef.current = null;
      const current = storeRef.current;
      let next: IncludeStore = rememberParentsFromListing(
        {
          ...current,
          items: {
            ...current.items,
            [parentId]: mergeListing(current.items[parentId], children),
          },
          complete: options?.complete
            ? { ...current.complete, [parentId]: true }
            : current.complete,
        },
        parentId,
        children
      );
      if (isMarkedSkipped(next, parentId)) {
        next = cascadeParentExclusion(next, parentId);
      } else {
        next = applyPruneDefaults(next, parentId);
      }
      commit(next);
    },
    [commit]
  );

  const isIncluded = useCallback(
    (parentId: string, childId: string) =>
      readIncluded(store, parentId, childId),
    [store]
  );

  /** True when this folder id was unchecked, never checked, or filter-skipped. */
  const isFolderSkipped = useCallback(
    (id: string) => isMarkedSkipped(store, id),
    [store]
  );

  const explicitIncludeCount = countExplicitIncludes(store);
  const hasExplicitIncludes = explicitIncludeCount > 0;

  /**
   * Parent-exclusion cascade (banner + red Xs) only after the user has checked
   * something. Empty explore mode must not lock every entered folder.
   */
  const shouldCascadeParentExclusion = useCallback(
    (id: string) => hasExplicitIncludes && isMarkedSkipped(store, id),
    [hasExplicitIncludes, store]
  );

  /**
   * Include childId under parentId and bubble-include each ancestor as a pruned
   * container so navigating up still shows the path checked. ancestorChain is
   * breadcrumb paths from browse session root through parentId (inclusive).
   * fullSubtree (folder clicked directly) clears nested prune under the child.
   */
  const includeWithAncestors = useCallback(
    (
      parentId: string,
      childId: string,
      ancestorChain: string[],
      opts?: { fullSubtree?: boolean }
    ) => {
      const current = storeRef.current;
      if (isParentPathExclusionReason(current.reasons[childId])) {
        return;
      }
      const level = { ...(current.marks[parentId] ?? {}) };
      level[childId] = true;
      const reasons = { ...current.reasons };
      delete reasons[childId];
      let prunedContainers = { ...current.prunedContainers };
      let next: IncludeStore = rememberParent(
        {
          ...current,
          marks: { ...current.marks, [parentId]: level },
          reasons,
          prunedContainers,
        },
        childId,
        parentId
      );

      if (opts?.fullSubtree) {
        delete prunedContainers[childId];
        next = {
          ...next,
          prunedContainers: { ...prunedContainers },
        };
        next = clearParentCascadeUnder(next, childId);
      }

      // Bubble: mark each folder in the chain included under its parent, pruned.
      // Ancestors that are already effectively included (checked directly or
      // inherited from a checked folder) are left alone: demoting them to
      // pruned containers would exclude siblings that inherit the include.
      const chain =
        ancestorChain.length > 0 && ancestorChain[ancestorChain.length - 1] === parentId
          ? ancestorChain
          : [...ancestorChain, parentId];
      for (let i = chain.length - 1; i >= 1; i--) {
        const folderIdAt = chain[i];
        const parentOf = chain[i - 1];
        if (isEffectivelyIncluded(next, folderIdAt)) continue;
        const parentLevel = { ...(next.marks[parentOf] ?? {}) };
        parentLevel[folderIdAt] = true;
        const nextReasons = { ...next.reasons };
        delete nextReasons[folderIdAt];
        prunedContainers = {
          ...next.prunedContainers,
          [folderIdAt]: true,
        };
        next = rememberParent(
          {
            ...next,
            marks: { ...next.marks, [parentOf]: parentLevel },
            reasons: nextReasons,
            prunedContainers,
          },
          folderIdAt,
          parentOf
        );
        next = pruneSiblingsExcept(next, parentOf, folderIdAt);
        next = applyPruneDefaults(next, parentOf);
      }

      // At the selection level, prune siblings only under a pruned container.
      // Under a fully included parent the siblings inherit the include, so a
      // recheck must not write explicit exclusions for them.
      if (next.prunedContainers[parentId]) {
        next = pruneSiblingsExcept(next, parentId, childId);
        next = applyPruneDefaults(next, parentId);
      }

      commit(next);
    },
    [commit]
  );

  const excludeItem = useCallback(
    (parentId: string, childId: string) => {
      const current = storeRef.current;
      if (isParentPathExclusionReason(current.reasons[childId])) {
        return;
      }
      const level = { ...(current.marks[parentId] ?? {}) };
      level[childId] = false;
      const reasons = { ...current.reasons };
      delete reasons[childId];
      let next: IncludeStore = {
        ...current,
        marks: { ...current.marks, [parentId]: level },
        reasons,
      };
      if (next.items[childId]) {
        next = cascadeParentExclusion(next, childId);
      }
      // No explicit includes left under this parent: drop pruned path bubbles
      // first, then clear leftover false marks so explore mode resumes.
      if (!hasExplicitIncludedChild(next, parentId)) {
        next = clearOrphanedPrunedAncestors(next, parentId);
        if (!isEffectivelyIncluded(next, parentId)) {
          const cleared = { ...(next.marks[parentId] ?? {}) };
          for (const id of Object.keys(cleared)) {
            if (cleared[id] === false && !next.reasons[id]) {
              delete cleared[id];
            }
          }
          const marks = { ...next.marks };
          if (Object.keys(cleared).length === 0) {
            delete marks[parentId];
          } else {
            marks[parentId] = cleared;
          }
          next = { ...next, marks };
        } else if (next.prunedContainers[parentId]) {
          next = applyPruneDefaults(next, parentId);
        }
      }
      commit(next);
    },
    [commit]
  );

  const toggle = useCallback(
    (
      parentId: string,
      childId: string,
      ancestorChain: string[] = [],
      opts?: { fullSubtree?: boolean }
    ) => {
      const current = storeRef.current;
      if (isParentPathExclusionReason(current.reasons[childId])) {
        return;
      }
      if (!readIncluded(current, parentId, childId)) {
        includeWithAncestors(parentId, childId, ancestorChain, {
          fullSubtree: opts?.fullSubtree ?? true,
        });
        return;
      }
      excludeItem(parentId, childId);
    },
    [excludeItem, includeWithAncestors]
  );

  /**
   * Row click in include mode: the row is the checkbox, there is no separate
   * highlight selection. Plain and Ctrl/Cmd clicks toggle one item;
   * Shift+click applies the clicked item's new checked state to every row
   * between the previous row click and this one.
   */
  const toggleRow = useCallback(
    (
      parentId: string,
      item: { id: string; type: "file" | "folder" },
      index: number,
      shiftKey: boolean,
      visibleItems: { id: string; type: "file" | "folder" }[],
      ancestorChain: string[]
    ) => {
      const anchor = lastRowIndexRef.current;
      lastRowIndexRef.current = index;
      if (shiftKey && anchor != null) {
        const check = !readIncluded(storeRef.current, parentId, item.id);
        const start = Math.min(anchor, index);
        const end = Math.max(anchor, index);
        for (let i = start; i <= end; i++) {
          const entry = visibleItems[i];
          if (!entry) continue;
          if (check) {
            includeWithAncestors(parentId, entry.id, ancestorChain, {
              fullSubtree: entry.type === "folder",
            });
          } else {
            excludeItem(parentId, entry.id);
          }
        }
        return;
      }
      toggle(parentId, item.id, ancestorChain, {
        fullSubtree: item.type === "folder",
      });
    },
    [excludeItem, includeWithAncestors, toggle]
  );

  /** Check/uncheck every child of a folder (caller passes the complete listing). */
  const setAllForFolder = useCallback(
    (parentId: string, children: Folder[], included: boolean) => {
      const current = storeRef.current;
      const level: Record<string, boolean> = {};
      const reasons = { ...current.reasons };
      for (const child of children) {
        const id = folderId(child);
        if (!id) continue;
        level[id] = included;
        if (included) {
          delete reasons[id];
        }
      }
      let next: IncludeStore = {
        ...current,
        marks: { ...current.marks, [parentId]: level },
        items: {
          ...current.items,
          [parentId]: mergeListing(current.items[parentId], children),
        },
        complete: { ...current.complete, [parentId]: true },
        reasons,
      };
      if (included) {
        const pruned = { ...next.prunedContainers };
        delete pruned[parentId];
        next = { ...next, prunedContainers: pruned };
      } else {
        next = {
          ...next,
          prunedContainers: { ...next.prunedContainers, [parentId]: true },
        };
      }
      for (const child of children) {
        const id = folderId(child);
        if (!id || child.type === "file" || !next.items[id]) continue;
        next = included
          ? clearParentCascadeUnder(next, id)
          : cascadeParentExclusion(next, id);
      }
      if (!included) {
        // Select-none: keep explicit falses while clearing orphaned path bubbles,
        // then drop marks only once this parent is no longer effectively included.
        next = clearOrphanedPrunedAncestors(next, parentId);
        if (!isEffectivelyIncluded(next, parentId)) {
          const marks = { ...next.marks };
          delete marks[parentId];
          const pruned = { ...next.prunedContainers };
          delete pruned[parentId];
          next = { ...next, marks, prunedContainers: pruned };
        }
      }
      commit(next);
    },
    [commit]
  );

  /**
   * Uncheck current rule matches and attach reasons. Items that only had a filter
   * mark and no longer match are checked again; a manual uncheck is left alone.
   * Matched folders also cascade the skip onto any children already listed.
   */
  const applyFilterPreview = useCallback(
    (parentId: string, reasons: Record<string, string>) => {
      const current = storeRef.current;
      const level = { ...(current.marks[parentId] ?? {}) };
      const nextReasons = { ...current.reasons };
      const clearedFilterIds: string[] = [];
      for (const child of current.items[parentId] ?? []) {
        const id = folderId(child);
        if (!id) continue;
        const prevReason = current.reasons[id];
        delete nextReasons[id];
        if (reasons[id]) {
          level[id] = false;
        } else if (isParentPathExclusionReason(prevReason)) {
          nextReasons[id] = prevReason;
          level[id] = false;
        } else if (prevReason) {
          // Dropping a filter mark under an included parent restores cascade-include.
          if (isEffectivelyIncluded(current, parentId)) {
            delete level[id];
          } else {
            level[id] = true;
          }
          clearedFilterIds.push(id);
        }
      }
      let next: IncludeStore = {
        ...current,
        marks: { ...current.marks, [parentId]: level },
        reasons: { ...nextReasons, ...reasons },
      };
      for (const id of Object.keys(reasons)) {
        if (next.items[id]) {
          next = cascadeParentExclusion(next, id);
        }
      }
      for (const id of clearedFilterIds) {
        if (next.items[id]) {
          next = clearParentCascadeUnder(next, id);
        }
      }
      if (isMarkedSkipped(next, parentId)) {
        next = cascadeParentExclusion(next, parentId);
      }
      commit(next);
    },
    [commit]
  );

  const filterReason = useCallback(
    (childId: string) => store.reasons[childId],
    [store]
  );

  /** Parents the user pruned whose full listing we still need before building a payload. */
  const parentsNeedingFullListing = useCallback(() => {
    const { marks, complete } = storeRef.current;
    return Object.entries(marks)
      .filter(
        ([parentId, level]) =>
          !complete[parentId] && Object.values(level).some((v) => v === false)
      )
      .map(([parentId]) => parentId);
  }, []);

  /** True when anything under this subtree was unchecked (so it needs an allowlist). */
  const hasExclusionsUnder = useCallback((parentId: string): boolean => {
    const { marks, items } = storeRef.current;
    const seen = new Set<string>();
    const walk = (id: string): boolean => {
      if (seen.has(id)) return false;
      seen.add(id);
      if (Object.values(marks[id] ?? {}).some((v) => v === false)) {
        return true;
      }
      return (items[id] ?? []).some(
        (child) =>
          child.type !== "file" &&
          items[folderId(child)] !== undefined &&
          walk(folderId(child))
      );
    };
    return walk(parentId);
  }, []);

  const includedCountUnder = useCallback((rootParentId: string) => {
    const current = storeRef.current;
    const seen = new Set<string>();
    let total = 0;
    const walk = (parentId: string) => {
      if (seen.has(parentId)) return;
      seen.add(parentId);
      for (const child of current.items[parentId] ?? []) {
        const id = folderId(child);
        if (!id || !readIncluded(current, parentId, id)) continue;
        total++;
        if (child.type !== "file" && current.items[id]) {
          walk(id);
        }
      }
    };
    walk(rootParentId);
    return total;
  }, []);

  const buildPayload = useCallback(
    (
      rootParentId: string,
      opts?: { role?: "source" | "destination"; sourceChildNames?: string[] }
    ): MigrationRootChild[] => {
      const current = storeRef.current;
      if (opts?.role === "destination") {
        return destinationRootChildrenPayload(
          current.items[rootParentId] ?? [],
          opts?.sourceChildNames
        );
      }

      const seen = new Set<string>();
      const build = (parentId: string): MigrationRootChild[] => {
        seen.add(parentId);
        return (current.items[parentId] ?? []).map((item) => {
          const id = folderId(item);
          const included = readIncluded(current, parentId, id);
          // Only descend when the subtree was pruned; otherwise take it whole.
          const nested =
            included &&
            item.type !== "file" &&
            current.items[id] !== undefined &&
            !seen.has(id) &&
            hasExclusionsUnder(id)
              ? build(id)
              : undefined;
          return folderToChild(item, included, nested);
        });
      };

      return build(rootParentId);
    },
    [hasExclusionsUnder]
  );

  /** Restore a persisted sparse tree (filters page preview round-trip). */
  const restore = useCallback(
    (tree: MigrationRootChild[], rootParentId: string) => {
      const next = emptyStore();

      const walk = (kids: MigrationRootChild[], parentId: string) => {
        const folders: Folder[] = [];
        const level: Record<string, boolean> = {};
        let hasExclusion = false;
        for (const c of kids) {
          if (!c.id) continue;
          folders.push({
            ServiceID: c.id,
            Id: c.id,
            name: c.name,
            type: c.type === "file" ? "file" : "folder",
            size: c.size,
            lastUpdated: c.mtime,
          } as Folder);
          level[c.id] = !c.excluded;
          next.parentOf[c.id] = parentId;
          if (c.excluded) hasExclusion = true;
          if (c.children && c.children.length > 0) {
            walk(c.children, c.id);
            next.prunedContainers[c.id] = true;
          }
        }
        next.items[parentId] = folders;
        next.marks[parentId] = level;
        next.complete[parentId] = true;
        if (hasExclusion && parentId) {
          next.prunedContainers[parentId] = true;
        }
      };

      walk(tree, rootParentId);
      commit(next);
    },
    [commit]
  );

  const reset = useCallback(() => {
    commit(emptyStore());
  }, [commit]);

  return {
    recordChildren,
    isIncluded,
    isFolderSkipped,
    shouldCascadeParentExclusion,
    hasExplicitIncludes,
    toggle,
    toggleRow,
    includeWithAncestors,
    excludeItem,
    setAllForFolder,
    applyFilterPreview,
    filterReason,
    parentsNeedingFullListing,
    includedCountUnder,
    explicitIncludeCount,
    buildPayload,
    restore,
    reset,
  };
}
