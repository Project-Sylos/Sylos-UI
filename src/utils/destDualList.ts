import type { Folder } from "../types/services";

export type DestDualPresence = "both" | "sourceOnly" | "destOnly";

export type DestDualRow = {
  key: string;
  name: string;
  type: "folder" | "file";
  presence: DestDualPresence;
  src?: Folder;
  dst?: Folder;
};

function itemId(item: Folder): string {
  return item.ServiceID || item.Id || "";
}

function itemName(item: Folder): string {
  return typeof item.name === "string" && item.name !== "" ? item.name : "Untitled";
}

function itemType(item: Folder): "folder" | "file" {
  return item.type === "file" ? "file" : "folder";
}

/** Case-insensitive basename merge of source and dest listings at one relative level. */
export function mergeRelativeListings(
  sourceItems: Folder[],
  destItems: Folder[]
): DestDualRow[] {
  const byName = new Map<
    string,
    { name: string; src?: Folder; dst?: Folder }
  >();

  for (const src of sourceItems) {
    const name = itemName(src);
    const key = name.toLowerCase();
    const prev = byName.get(key) ?? { name };
    prev.src = src;
    byName.set(key, prev);
  }
  for (const dst of destItems) {
    const name = itemName(dst);
    const key = name.toLowerCase();
    const prev = byName.get(key) ?? { name };
    prev.dst = dst;
    // Prefer dest display casing when both exist.
    if (prev.dst) prev.name = name;
    byName.set(key, prev);
  }

  const rows: DestDualRow[] = [];
  for (const { name, src, dst } of byName.values()) {
    const presence: DestDualPresence = src && dst ? "both" : src ? "sourceOnly" : "destOnly";
    const primary = dst ?? src;
    rows.push({
      key: itemId(primary!) || name.toLowerCase(),
      name,
      type: itemType(primary!),
      presence,
      src,
      dst,
    });
  }

  rows.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return rows;
}

/** Walk source root by relative basename segments; returns folder id or null if missing. */
export function resolveSourceFolderId(
  rootId: string,
  segments: string[],
  findChildId: (parentId: string, name: string) => string | null
): string | null {
  let id = rootId;
  for (const segment of segments) {
    const next = findChildId(id, segment);
    if (!next) return null;
    id = next;
  }
  return id;
}
