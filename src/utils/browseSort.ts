import { Folder } from "../types/services";

export type BrowseSortField = "name" | "size" | "mtime";
export type BrowseSortDir = "asc" | "desc";

export type BrowseSortState = {
  field: BrowseSortField;
  dir: BrowseSortDir;
};

export const DEFAULT_BROWSE_SORT: BrowseSortState = {
  field: "name",
  dir: "asc",
};

function compareStrings(a: string, b: string, dir: BrowseSortDir): number {
  const cmp = a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
  return dir === "asc" ? cmp : -cmp;
}

function compareNumbers(a: number, b: number, dir: BrowseSortDir): number {
  if (a === b) return 0;
  const cmp = a < b ? -1 : 1;
  return dir === "asc" ? cmp : -cmp;
}

function itemMTime(item: Folder): number {
  if (!item.lastUpdated) return 0;
  const t = Date.parse(item.lastUpdated);
  return Number.isFinite(t) ? t : 0;
}

export function sortBrowseItems(items: Folder[], sort: BrowseSortState): Folder[] {
  const out = [...items];
  out.sort((a, b) => {
    switch (sort.field) {
      case "size":
        return compareNumbers(a.size ?? 0, b.size ?? 0, sort.dir);
      case "mtime":
        return compareNumbers(itemMTime(a), itemMTime(b), sort.dir);
      case "name":
      default:
        return compareStrings(a.name || "", b.name || "", sort.dir);
    }
  });
  return out;
}

export function sortBrowseFoldersAndFiles(
  folders: Folder[],
  files: Folder[],
  sort: BrowseSortState
): { folders: Folder[]; files: Folder[] } {
  return {
    folders: sortBrowseItems(folders, sort),
    files: sortBrowseItems(files, sort),
  };
}
