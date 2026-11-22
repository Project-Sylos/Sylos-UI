import { TIP_GROUP_META, TIP_GROUP_ORDER } from "./groups";
import { TIP_REGISTRY, getTip, resolveTipCategory, resolveTipContent } from "./registry";
import type { TipDef, TipGroupId, TipGroupMeta } from "./types";

export type { TipDef, TipGroupId, TipGroupMeta, TipKind } from "./types";
export { TIP_GROUP_META, TIP_GROUP_ORDER } from "./groups";
export {
  TIP_REGISTRY,
  getTip,
  resolveTipCategory,
  resolveTipContent,
  autoscalerKnobContent,
  autoscalerWorkerContent,
  selectionHelpCore,
} from "./registry";

export type TipsGroupSection = {
  meta: TipGroupMeta;
  tips: TipDef[];
};

/** Tips grouped for the Tips library (ordered). */
export function tipsByGroup(): TipsGroupSection[] {
  const buckets = new Map<TipGroupId, TipDef[]>();
  for (const tip of TIP_REGISTRY) {
    const list = buckets.get(tip.groupId);
    if (list) {
      list.push(tip);
    } else {
      buckets.set(tip.groupId, [tip]);
    }
  }
  return TIP_GROUP_ORDER.map((id) => ({
    meta: TIP_GROUP_META[id],
    tips: buckets.get(id) ?? [],
  })).filter((section) => section.tips.length > 0);
}

/** Preference keys for dismiss / show-again (one per tipId). */
export function allTipIds(): string[] {
  return TIP_REGISTRY.map((tip) => tip.tipId);
}

/** Map every registry tipId to enabled/disabled (Enable tips / Reset all). */
export function categoriesEnabledMap(enabled: boolean): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const tipId of allTipIds()) {
    out[tipId] = enabled;
  }
  return out;
}
