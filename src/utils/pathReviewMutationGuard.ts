/** Client-side guard for overlapping path-review status toggles. */

export const EXCLUSION_OP_TITLE = "Exclusion op in progress";
export const RETRY_OP_TITLE = "Retry op in progress";
export const REMOVAL_OP_TITLE = "Removal op in progress";

/** How long the green confirmation check stays after a successful mutation. */
export const MUTATION_CONFIRM_MS = 700;
/** How long the red failure X stays after a failed mutation. */
export const MUTATION_FAIL_MS = 1000;

export type MutationOpPhase = "pending" | "confirmed" | "failed";

export type MutationOpState = {
  title: string;
  phase: MutationOpPhase;
};

export type MutationOpsMap = ReadonlyMap<string, MutationOpState>;

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

/** Record a pending op, mark confirmed, or clear (title null). */
export function withInFlightOp(
  prev: MutationOpsMap,
  ids: Array<string | null | undefined>,
  title: string | null,
  phase: MutationOpPhase = "pending"
): Map<string, MutationOpState> {
  const next = new Map(prev);
  for (const id of ids) {
    if (!id) continue;
    if (title) {
      next.set(id, { title, phase });
    } else {
      next.delete(id);
    }
  }
  return next;
}

export function inFlightOpState(
  inFlight: MutationOpsMap,
  ids: Array<string | null | undefined>
): MutationOpState | undefined {
  for (const id of ids) {
    if (!id) continue;
    const state = inFlight.get(id);
    if (state) return state;
  }
  return undefined;
}

export function inFlightOpTitle(
  inFlight: MutationOpsMap,
  ids: Array<string | null | undefined>
): string | undefined {
  return inFlightOpState(inFlight, ids)?.title;
}

export function itemMutationIds(item: {
  id?: string | null;
  src?: { id?: string | null } | null;
  dst?: { id?: string | null } | null;
}): Array<string | null | undefined> {
  return [item.id, item.src?.id, item.dst?.id];
}

/** True when none of the item's mutation ids are already in flight. */
export function canStartItemMutation(
  inFlight: { has(id: string): boolean },
  item: {
    id?: string | null;
    src?: { id?: string | null } | null;
    dst?: { id?: string | null } | null;
  }
): boolean {
  for (const id of itemMutationIds(item)) {
    if (id && inFlight.has(id)) {
      return false;
    }
  }
  return true;
}
