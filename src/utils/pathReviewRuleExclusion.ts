import {
  DiffItem,
  RuleExclusion,
  markNodeForRetryDiscovery,
  unexcludeNode,
} from "../api/services";

export function getRuleExclusion(item: DiffItem): RuleExclusion | undefined {
  return item.src?.ruleExclusion;
}

export function isRuleExcluded(item: DiffItem): boolean {
  return !!getRuleExclusion(item);
}

export function ruleExclusionLabel(item: DiffItem): string | undefined {
  const label = getRuleExclusion(item)?.label?.trim();
  return label || undefined;
}

export function excludedByRuleText(item: DiffItem): string | undefined {
  const label = ruleExclusionLabel(item);
  return label ? `Excluded by: ${label}` : undefined;
}

export function canIncludeRuleExcludedSubtree(item: DiffItem): boolean {
  return item.type === "folder" && isRuleExcluded(item);
}

export async function includeRuleExcludedSubtree(
  migrationId: string,
  nodeId: string
): Promise<{ success: boolean; error?: string }> {
  const unex = await unexcludeNode(migrationId, nodeId);
  if (!unex.success) {
    return { success: false, error: unex.error || "Failed to unexclude node" };
  }
  const mark = await markNodeForRetryDiscovery(migrationId, nodeId);
  if (!mark.success) {
    return {
      success: false,
      error: mark.error || "Failed to mark subtree for discovery retry",
    };
  }
  return { success: true };
}
