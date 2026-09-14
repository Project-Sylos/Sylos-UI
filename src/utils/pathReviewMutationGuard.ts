/** Client-side guard for overlapping path-review status toggles. */

export const EXCLUSION_OP_TITLE = "Exclusion op in progress";
export const RETRY_OP_TITLE = "Retry op in progress";
export const REMOVAL_OP_TITLE = "Removal op in progress";

export function canStartMutation(
  inFlight: { has(id: string): boolean },
  nodeId: string | null | undefined
): boolean {
  if (!nodeId) {
    return false;
  }
  return !inFlight.has(nodeId);
}

export function withInFlightIds(
  prev: Set<string>,
  ids: Array<string | null | undefined>,
  add: boolean
): Set<string> {
  const next = new Set(prev);
  for (const id of ids) {
    if (!id) continue;
    if (add) {
      next.add(id);
    } else {
      next.delete(id);
    }
  }
  return next;
}

/** Record or clear an in-flight path-review op. title null removes the ids. */
export function withInFlightOp(
  prev: ReadonlyMap<string, string>,
  ids: Array<string | null | undefined>,
  title: string | null
): Map<string, string> {
  const next = new Map(prev);
  for (const id of ids) {
    if (!id) continue;
    if (title) {
      next.set(id, title);
    } else {
      next.delete(id);
    }
  }
  return next;
}

export function inFlightOpTitle(
  inFlight: ReadonlyMap<string, string>,
  ids: Array<string | null | undefined>
): string | undefined {
  for (const id of ids) {
    if (!id) continue;
    const title = inFlight.get(id);
    if (title) return title;
  }
  return undefined;
}

export function itemMutationIds(item: {
  id?: string | null;
  src?: { id?: string | null } | null;
  dst?: { id?: string | null } | null;
}): Array<string | null | undefined> {
  return [item.id, item.src?.id, item.dst?.id];
}
