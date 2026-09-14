import { Folder } from "../types/services";

/** Shown on every child when previewing inside a skipped parent folder. */
export const PARENT_PATH_EXCLUSION_REASON =
  "A parent folder on this path is excluded, so everything under it is skipped too.";

export function isParentPathExclusionReason(reason: string | undefined): boolean {
  return reason === PARENT_PATH_EXCLUSION_REASON;
}

export function parentCascadeReasons(children: Folder[]): Record<string, string> {
  const reasons: Record<string, string> = {};
  for (const child of children) {
    const id = child.ServiceID || child.Id || "";
    if (id) {
      reasons[id] = PARENT_PATH_EXCLUSION_REASON;
    }
  }
  return reasons;
}
