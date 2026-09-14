export const RULESET_SCHEMA_VERSION = 1;

export type GroupOp = "AND" | "OR";

export type ConditionField =
  | "size"
  | "mtime"
  | "name"
  | "path"
  | "extension"
  | "mimetype_category"
  | "depth"
  | "is_empty"
  | "child_count"
  /** Path-review search only (needs status / gpl_issues joins). */
  | "review_status"
  | "path_issue_status"
  | "path_issue_category";

export type AppliesTo = "file" | "folder" | "both";

export type NamePathMode = "contains" | "glob" | "regex";

export type MtimeMode = "older_than" | "newer_than" | "before" | "after";

export interface FilterCondition {
  id: string;
  field: ConditionField;
  operator: string;
  value: string | number | boolean | string[];
  negate?: boolean;
  applies_to: AppliesTo;
  /** Name/path string match only. Default false = case-insensitive. */
  case_sensitive?: boolean;
}

export interface FilterGroup {
  id?: string;
  op: GroupOp;
  negate?: boolean;
  children: FilterChild[];
}

export interface FilterChild {
  condition?: FilterCondition;
  group?: FilterGroup;
}

export interface FilterRuleset {
  ruleset_id: string;
  name: string;
  description?: string;
  created_by?: string;
  schema_version: number;
  root_group: FilterGroup;
}

export interface RulesetSummary {
  id: string;
  name: string;
  description?: string;
  createdBy: string;
  schemaVersion: number;
  rootGroup?: FilterGroup;
  createdAt: string;
  updatedAt: string;
}

export interface MigrationRulesetResponse {
  ruleset?: FilterRuleset | null;
}

export interface CreateRulesetRequest {
  name: string;
  description?: string;
  schemaVersion?: number;
  rootGroup: FilterGroup;
}

export interface UpdateRulesetRequest {
  name: string;
  description?: string;
  schemaVersion?: number;
  rootGroup: FilterGroup;
}

export interface RuleExclusion {
  ruleId: string;
  label: string;
  evalPhase?: "pre" | "post" | "apply" | string;
  exclusionSource?: string;
  applicationId?: string;
}
