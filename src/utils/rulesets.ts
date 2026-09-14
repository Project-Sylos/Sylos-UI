import {
  FilterChild,
  FilterCondition,
  FilterGroup,
  FilterRuleset,
  GroupOp,
  NamePathMode,
  RULESET_SCHEMA_VERSION,
  RulesetSummary,
} from "../types/rulesets";

/** Placeholder rule id for the "no rules" ruleset; see matchNothingCondition. */
export const MATCH_NOTHING_CONDITION_ID = "__match_nothing__";

export const MIMETYPE_CATEGORIES = [
  "document",
  "spreadsheet",
  "presentation",
  "image",
  "video",
  "audio",
  "archive",
  "code",
  "pdf",
  "other",
] as const;

/**
 * Extension presets for the filter editor. Selecting one prefills an editable
 * extension token list (same idea as the old junk starter sets).
 * Keep in sync with Migration-Engine/pkg/filter/mimetype.go extensionCategory.
 */
export const EXTENSION_PRESETS: ReadonlyArray<{
  id: string;
  label: string;
  extensions: readonly string[];
}> = [
  {
    id: "document",
    label: "Documents",
    extensions: ["doc", "docx", "odt", "rtf", "txt", "md", "pages"],
  },
  {
    id: "spreadsheet",
    label: "Spreadsheets",
    extensions: ["xls", "xlsx", "xlsm", "xltx", "ods", "csv", "tsv", "numbers"],
  },
  {
    id: "presentation",
    label: "Presentations",
    extensions: ["ppt", "pptx", "odp", "key"],
  },
  {
    id: "image",
    label: "Images",
    extensions: [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "bmp",
      "tif",
      "tiff",
      "svg",
      "heic",
      "ico",
    ],
  },
  {
    id: "video",
    label: "Video",
    extensions: ["mp4", "mov", "avi", "mkv", "webm", "wmv", "m4v"],
  },
  {
    id: "audio",
    label: "Audio",
    extensions: ["mp3", "wav", "flac", "aac", "m4a", "ogg", "wma"],
  },
  {
    id: "archive",
    label: "Archives",
    extensions: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2"],
  },
  {
    id: "code",
    label: "Code / text data",
    extensions: [
      "go",
      "js",
      "ts",
      "jsx",
      "tsx",
      "py",
      "java",
      "c",
      "cpp",
      "h",
      "rs",
      "rb",
      "php",
      "cs",
      "swift",
      "kt",
      "html",
      "css",
      "json",
      "xml",
      "yaml",
      "yml",
      "toml",
      "sql",
      "sh",
      "bash",
    ],
  },
  {
    id: "pdf",
    label: "PDF",
    extensions: ["pdf"],
  },
  {
    id: "junk",
    label: "Common junk",
    extensions: ["tmp", "temp", "bak", "old", "swp", "part", "crdownload"],
  },
];

/** Active preset id when the token list still contains that preset's extensions. */
export function matchingExtensionPresetId(
  extensions: readonly string[]
): string {
  const set = new Set(
    extensions
      .map((e) => e.trim().replace(/^\./, "").toLowerCase())
      .filter(Boolean)
  );
  if (set.size === 0) return "";
  for (const preset of EXTENSION_PRESETS) {
    if (
      preset.extensions.length === set.size &&
      preset.extensions.every((ext) => set.has(ext))
    ) {
      return preset.id;
    }
  }
  let bestId = "";
  let bestLen = 0;
  for (const preset of EXTENSION_PRESETS) {
    if (
      preset.extensions.length > bestLen &&
      preset.extensions.every((ext) => set.has(ext))
    ) {
      bestId = preset.id;
      bestLen = preset.extensions.length;
    }
  }
  return bestId;
}

export const SIZE_UNITS = [
  { value: "B", multiplier: 1 },
  { value: "KB", multiplier: 1024 },
  { value: "MB", multiplier: 1024 * 1024 },
  { value: "GB", multiplier: 1024 * 1024 * 1024 },
  { value: "TB", multiplier: 1024 * 1024 * 1024 * 1024 },
] as const;

export const MTIME_DURATION_UNITS = [
  { value: "d", label: "days" },
  { value: "w", label: "weeks" },
  { value: "mo", label: "months" },
  { value: "y", label: "years" },
] as const;

export const MTIME_MODE_OPTIONS = [
  { value: "older_than", label: "Older than" },
  { value: "newer_than", label: "Newer than" },
  { value: "before", label: "Before date" },
  { value: "after", label: "After date" },
] as const;

/** before/after take a calendar date; older_than/newer_than take a relative duration. */
export function isMtimeDateMode(operator: string): boolean {
  return operator === "before" || operator === "after";
}

/** YYYY-MM-DD for <input type="date">, tolerating stored RFC3339 values. */
export function mtimeDateInputValue(value: FilterCondition["value"]): string {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

export const FIELD_LABELS: Record<string, string> = {
  size: "Size",
  mtime: "Modified",
  name: "Name",
  path: "Path",
  extension: "Extension",
  mimetype_category: "Category",
  depth: "Depth",
  is_empty: "Empty folder",
  child_count: "Child count",
  review_status: "Status",
  path_issue_status: "Compatibility",
  path_issue_category: "Compatibility",
};

export const APPLIES_TO_OPTIONS = [
  { value: "both", label: "Files and folders" },
  { value: "file", label: "Files only" },
  { value: "folder", label: "Folders only" },
] as const;

/**
 * Fields that only make sense on one node type. The editor locks Applies to
 * when this returns a value; name/path/mtime stay free.
 */
export function lockedAppliesTo(
  field: FilterCondition["field"]
): FilterCondition["applies_to"] | null {
  switch (field) {
    case "size":
    case "extension":
    case "mimetype_category":
      return "file";
    case "is_empty":
    case "child_count":
      return "folder";
    case "review_status":
    case "path_issue_status":
    case "path_issue_category":
      return "both";
    default:
      return null;
  }
}

let idCounter = 0;

export function nextRuleId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function createDefaultCondition(field: FilterCondition["field"] = "name"): FilterCondition {
  const base: FilterCondition = {
    id: nextRuleId("rule"),
    field,
    operator: "contains",
    value: [],
    applies_to: field === "is_empty" || field === "child_count" ? "folder" : "both",
  };
  switch (field) {
    case "size":
      return { ...base, operator: "gt", value: 0, applies_to: "file" };
    case "mtime":
      return { ...base, operator: "older_than", value: "1y", applies_to: "file" };
    case "extension":
      return { ...base, operator: "in", value: [], applies_to: "file" };
    case "mimetype_category":
      return { ...base, operator: "eq", value: "document", applies_to: "file" };
    case "depth":
      return { ...base, operator: "gte", value: 1, applies_to: "both" };
    case "is_empty":
      return { ...base, operator: "eq", value: true, applies_to: "folder" };
    case "child_count":
      return { ...base, operator: "eq", value: 0, applies_to: "folder" };
    case "path":
      return { ...base, operator: "segments", value: [""], applies_to: "both" };
    case "review_status":
      return { ...base, operator: "eq", value: "pending", applies_to: "both" };
    case "path_issue_status":
      return { ...base, operator: "eq", value: "issues", applies_to: "both" };
    case "path_issue_category":
      return { ...base, operator: "eq", value: "", applies_to: "both" };
    default:
      return base;
  }
}

export function createDefaultGroup(op: GroupOp = "AND"): FilterGroup {
  return {
    id: nextRuleId("group"),
    op,
    negate: false,
    children: [],
  };
}

export function createEmptyRuleset(migrationId: string, name = "Migration filters"): FilterRuleset {
  return {
    ruleset_id: `${migrationId}-ruleset`,
    name,
    schema_version: RULESET_SCHEMA_VERSION,
    root_group: createDefaultGroup("AND"),
  };
}

/**
 * Compile rejects a group with no children, so an empty ruleset is saved as a
 * single condition that can never be true (depth < 0) and therefore excludes nothing.
 */
export function matchNothingCondition(): FilterCondition {
  return {
    id: MATCH_NOTHING_CONDITION_ID,
    field: "depth",
    operator: "lt",
    value: 0,
    applies_to: "both",
  };
}

export function isMatchNothingCondition(condition: FilterCondition): boolean {
  return condition.id === MATCH_NOTHING_CONDITION_ID;
}

export function countConditions(group: FilterGroup): number {
  let count = 0;
  for (const child of group.children ?? []) {
    if (child.condition && !isMatchNothingCondition(child.condition) && !isUnfinishedCondition(child.condition)) {
      count += 1;
    }
    if (child.group) {
      count += countConditions(child.group);
    }
  }
  return count;
}

export function isRulesetEffectivelyEmpty(ruleset: FilterRuleset): boolean {
  return countConditions(ruleset.root_group) === 0;
}

/** Name/path/extension rows with no patterns yet are draft UI, not real rules. */
export function isUnfinishedCondition(condition: FilterCondition): boolean {
  if (condition.field === "name" || condition.field === "path") {
    return conditionPatternList(condition.value).length === 0;
  }
  if (condition.field === "extension") {
    return !Array.isArray(condition.value) || condition.value.length === 0;
  }
  return false;
}

/** Drops placeholder and half-filled rows so the tree matches what the engine will compile. */
export function compactGroup(group: FilterGroup): FilterGroup {
  const children: FilterChild[] = [];
  for (const child of group.children ?? []) {
    if (child.condition) {
      if (!isMatchNothingCondition(child.condition) && !isUnfinishedCondition(child.condition)) {
        const lock = lockedAppliesTo(child.condition.field);
        children.push({
          condition: {
            ...child.condition,
            negate: Boolean(child.condition.negate),
            applies_to: lock ?? child.condition.applies_to,
          },
        });
      }
      continue;
    }
    if (child.group) {
      const nested = compactGroup(child.group);
      // Empty nested groups fail Compile ("group has no children") and break preview.
      if ((nested.children ?? []).length > 0) {
        children.push({
          group: {
            ...nested,
            negate: Boolean(nested.negate),
          },
        });
      }
    }
  }
  return {
    ...group,
    negate: Boolean(group.negate),
    children,
  };
}

function mapLeafConditions(
  group: FilterGroup,
  map: (condition: FilterCondition) => FilterCondition
): FilterGroup {
  return {
    ...group,
    children: (group.children ?? []).map((child) => {
      if (child.condition) {
        return { condition: map(child.condition) };
      }
      if (child.group) {
        return { group: mapLeafConditions(child.group, map) };
      }
      return child;
    }),
  };
}

function collectLeafConditions(group: FilterGroup): FilterCondition[] {
  const out: FilterCondition[] = [];
  for (const child of group.children ?? []) {
    if (child.condition) out.push(child.condition);
    if (child.group) out.push(...collectLeafConditions(child.group));
  }
  return out;
}

/**
 * Push nested group.negate into children (De Morgan) so the editor never shows
 * a group-level Filter in/out. Root negate is handled separately.
 */
function eliminateNestedGroupNegates(group: FilterGroup, depth = 0): FilterGroup {
  const children = (group.children ?? []).map((child) => {
    if (child.group) {
      return { group: eliminateNestedGroupNegates(child.group, depth + 1) };
    }
    return child;
  });
  let next: FilterGroup = { ...group, children };

  if (depth > 0 && next.negate) {
    next = {
      ...next,
      negate: false,
      op: next.op === "AND" ? "OR" : "AND",
      children: (next.children ?? []).map((child) => {
        if (child.condition) {
          return {
            condition: {
              ...child.condition,
              negate: !Boolean(child.condition.negate),
            },
          };
        }
        if (child.group) {
          return {
            group: eliminateNestedGroupNegates(
              { ...child.group, negate: !Boolean(child.group.negate) },
              depth + 1
            ),
          };
        }
        return child;
      }),
    };
  }

  if (depth > 0) {
    next = { ...next, negate: false };
  }
  return next;
}

/**
 * Editor form: polarity lives only on conditions (Filter in when / Filter out when).
 * Keep-only rulesets (root.negate) are shown as Filter in when on every leaf.
 */
export function presentRulesetForEditor(ruleset: FilterRuleset): FilterRuleset {
  let root = eliminateNestedGroupNegates(compactGroup(ruleset.root_group), 0);
  if (root.negate) {
    root = {
      ...mapLeafConditions(root, (condition) => ({
        ...condition,
        negate: !Boolean(condition.negate),
      })),
      negate: false,
    };
  } else {
    root = { ...root, negate: false };
  }
  return { ...ruleset, root_group: root };
}

/**
 * Engine form: if every leaf is Filter in when, that means keep-only (root.negate)
 * with positive conditions. Mixed Filter in/out stays literal for the engine.
 */
export function materializeRulesetPolarity(ruleset: FilterRuleset): FilterRuleset {
  let root = eliminateNestedGroupNegates(compactGroup(ruleset.root_group), 0);
  const leaves = collectLeafConditions(root).filter(
    (c) => !isMatchNothingCondition(c) && !isUnfinishedCondition(c)
  );
  if (leaves.length === 0) {
    return { ...ruleset, root_group: { ...root, negate: false } };
  }

  // Already stored as keep-only with positive leaves: leave alone.
  if (root.negate && leaves.every((c) => !c.negate)) {
    return { ...ruleset, root_group: root };
  }

  const allFilterIn = leaves.every((c) => Boolean(c.negate));
  if (!root.negate && allFilterIn) {
    return {
      ...ruleset,
      root_group: {
        ...mapLeafConditions(root, (condition) => ({
          ...condition,
          negate: false,
        })),
        negate: true,
      },
    };
  }

  return { ...ruleset, root_group: { ...root, negate: Boolean(root.negate) } };
}

/** True when every real leaf is Filter in when (editor keep-only intent). */
export function isEditorKeepOnly(ruleset: FilterRuleset): boolean {
  const leaves = collectLeafConditions(ruleset.root_group).filter(
    (c) => !isMatchNothingCondition(c) && !isUnfinishedCondition(c)
  );
  return leaves.length > 0 && leaves.every((c) => Boolean(c.negate));
}

/** Fresh ids when copying a library ruleset onto a migration draft. */
export function cloneGroupWithFreshIds(group: FilterGroup): FilterGroup {
  return {
    ...group,
    id: nextRuleId("group"),
    negate: Boolean(group.negate),
    children: (group.children ?? []).map((child) => {
      if (child.condition) {
        return {
          condition: {
            ...child.condition,
            id: nextRuleId("rule"),
            negate: Boolean(child.condition.negate),
          },
        };
      }
      if (child.group) {
        return { group: cloneGroupWithFreshIds(child.group) };
      }
      return child;
    }),
  };
}

export function duplicateRulesetForMigration(ruleset: FilterRuleset): FilterRuleset {
  const copy = cloneRuleset(ruleset);
  copy.root_group = cloneGroupWithFreshIds(copy.root_group);
  return presentRulesetForEditor(copy);
}

export function prepareRulesetForSave(ruleset: FilterRuleset): FilterRuleset {
  const cleaned = materializeRulesetPolarity({
    ...ruleset,
    schema_version: RULESET_SCHEMA_VERSION,
  });
  if (isRulesetEffectivelyEmpty(cleaned)) {
    return {
      ...cleaned,
      root_group: {
        ...cleaned.root_group,
        op: "AND",
        negate: false,
        children: [{ condition: matchNothingCondition() }],
      },
    };
  }
  return cleaned;
}

export function groupNestDepth(group: FilterGroup, depth = 0): number {
  let max = depth;
  for (const child of group.children ?? []) {
    if (child.group) {
      max = Math.max(max, groupNestDepth(child.group, depth + 1));
    }
  }
  return max;
}

export function canAddNestedGroup(group: FilterGroup): boolean {
  return groupNestDepth(group) < 2;
}

export function rulesetFromSummary(summary: RulesetSummary, migrationId?: string): FilterRuleset {
  return presentRulesetForEditor({
    ruleset_id: summary.id,
    name: summary.name,
    description: summary.description,
    created_by: summary.createdBy,
    schema_version: summary.schemaVersion || RULESET_SCHEMA_VERSION,
    root_group: summary.rootGroup
      ? compactGroup(summary.rootGroup)
      : createDefaultGroup("AND"),
  });
}

export function summaryToMigrationRuleset(
  summary: RulesetSummary,
  migrationId: string
): FilterRuleset {
  const rs = rulesetFromSummary(summary, migrationId);
  return {
    ...rs,
    ruleset_id: `${migrationId}-ruleset`,
    name: rs.name || "Migration filters",
  };
}

export function displayPathForChild(
  parentDisplayPath: string,
  parentDepth: number,
  childName: string
): string {
  const name = childName.replace(/^\/+|\/+$/g, "");
  const childDepth = parentDepth + 1;
  if (childDepth <= 0) return "/";
  if (childDepth === 1) return name ? `/${name}` : "/";
  const base = parentDisplayPath;
  if (!base || base === "/") return name ? `/${name}` : "/";
  return name ? `${base.replace(/\/$/, "")}/${name}` : base;
}

/**
 * Name and path rules hold one pattern or a list of them. A lone string stays whole:
 * commas are legal in file names, so the value is never split on them.
 */
export function conditionPatternList(value: FilterCondition["value"]): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter((pattern) => pattern !== "");
  }
  const single = String(value ?? "").trim();
  return single ? [single] : [];
}

export function namePathModeFromOperator(operator: string): NamePathMode {
  if (operator === "glob") return "glob";
  if (operator === "regex") return "regex";
  return "contains";
}

export function operatorFromNamePathMode(mode: NamePathMode): string {
  if (mode === "glob") return "glob";
  if (mode === "regex") return "regex";
  return "contains";
}

export function formatConditionLabel(
  condition: FilterCondition,
  matchMode: "exclude" | "search" = "exclude"
): string {
  const field = FIELD_LABELS[condition.field] ?? condition.field;
  const op = condition.operator.replace(/_/g, " ");
  let val = "";
  if (Array.isArray(condition.value)) {
    val = condition.value.join(", ");
  } else if (typeof condition.value === "boolean") {
    val = condition.value ? "yes" : "no";
  } else {
    val = String(condition.value);
  }
  const prefix =
    matchMode === "search"
      ? condition.negate
        ? "Don't match when "
        : "Match when "
      : condition.negate
        ? "Filter in when "
        : "Filter out when ";
  const caseNote =
    condition.field === "name" && condition.case_sensitive
      ? " (case sensitive)"
      : "";
  if (condition.field === "path") {
    const parts = conditionPatternList(condition.value).filter((s) => s.trim() !== "");
    const shown = parts.length > 0 ? parts.join(" / ") : "(empty)";
    return `${prefix}path has segments ${shown}`.trim();
  }
  return `${prefix}${field} ${op} ${val}${caseNote}`.trim();
}

export function parseSizeToBytes(amount: number, unit: string): number {
  const found = SIZE_UNITS.find((u) => u.value === unit);
  return Math.round(amount * (found?.multiplier ?? 1));
}

export function formatBytesForSizeInput(bytes: number): { amount: number; unit: string } {
  if (bytes <= 0) return { amount: 0, unit: "B" };
  for (let i = SIZE_UNITS.length - 1; i >= 0; i -= 1) {
    const u = SIZE_UNITS[i];
    if (bytes >= u.multiplier) {
      return { amount: bytes / u.multiplier, unit: u.value };
    }
  }
  return { amount: bytes, unit: "B" };
}

export function cloneRuleset(ruleset: FilterRuleset): FilterRuleset {
  return JSON.parse(JSON.stringify(ruleset)) as FilterRuleset;
}

function cloneGroup(group: FilterGroup): FilterGroup {
  return JSON.parse(JSON.stringify(group)) as FilterGroup;
}

function pathsEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function isPathPrefix(prefix: number[], path: number[]): boolean {
  return (
    prefix.length <= path.length &&
    prefix.every((v, i) => v === path[i])
  );
}

function childAtPath(root: FilterGroup, path: number[]): FilterChild | null {
  let group = root;
  for (let i = 0; i < path.length; i += 1) {
    const children = group.children ?? [];
    const idx = path[i];
    if (idx < 0 || idx >= children.length) return null;
    if (i === path.length - 1) return children[idx];
    const next = children[idx]?.group;
    if (!next) return null;
    group = next;
  }
  return null;
}

function removeChildAtPath(root: FilterGroup, path: number[]): FilterChild | null {
  if (path.length === 0) return null;
  let group = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    const next = group.children?.[path[i]]?.group;
    if (!next) return null;
    group = next;
  }
  const idx = path[path.length - 1];
  const children = [...(group.children ?? [])];
  if (idx < 0 || idx >= children.length) return null;
  const [removed] = children.splice(idx, 1);
  group.children = children;
  return removed ?? null;
}

function insertChildAtPath(
  root: FilterGroup,
  parentPath: number[],
  index: number,
  child: FilterChild
): boolean {
  let group = root;
  for (const idx of parentPath) {
    const next = group.children?.[idx]?.group;
    if (!next) return false;
    group = next;
  }
  const children = [...(group.children ?? [])];
  const clamped = Math.max(0, Math.min(index, children.length));
  children.splice(clamped, 0, child);
  group.children = children;
  return true;
}

/**
 * Move a condition or nested group within a ruleset tree.
 * `fromPath` is the child index path; `toParentPath` is where to insert;
 * `toIndex` is the insertion index among that parent's children.
 * Dropping a group into itself or a descendant is a no-op.
 */
export function moveFilterChild(
  root: FilterGroup,
  fromPath: number[],
  toParentPath: number[],
  toIndex: number
): FilterGroup {
  if (fromPath.length === 0) return root;
  if (isPathPrefix(fromPath, toParentPath)) return root;

  const next = cloneGroup(root);
  const moving = childAtPath(next, fromPath);
  if (!moving) return root;
  // Dropping a group into one of its own descendants is already blocked by
  // isPathPrefix; also skip no-op same slot.
  if (
    pathsEqual(fromPath.slice(0, -1), toParentPath) &&
    fromPath[fromPath.length - 1] === toIndex
  ) {
    return root;
  }

  const removed = removeChildAtPath(next, fromPath);
  if (!removed) return root;

  let insertIndex = toIndex;
  if (pathsEqual(fromPath.slice(0, -1), toParentPath)) {
    const fromIndex = fromPath[fromPath.length - 1];
    if (fromIndex < insertIndex) {
      insertIndex -= 1;
    }
  }
  if (!insertChildAtPath(next, toParentPath, insertIndex, removed)) {
    return root;
  }
  return next;
}

export type ListSearchSizeOperator = "equals" | "gt" | "gte" | "lt" | "lte";

export interface ListSearchRulesetSeed {
  migrationId: string;
  existing: FilterRuleset;
  searchField: "path" | "name";
  nameQuery: string;
  pathSegments: string[];
  typeFilter: "both" | "folder" | "file";
  sizeBytes: number | null;
  sizeOperator: ListSearchSizeOperator;
  reviewStatus?: string;
  pathIssueStatus?: string;
  pathIssueCategory?: string;
}

/**
 * Build or extend a search ruleset from basic list-filter drafts so Advanced
 * opens with the user's current size / name / path / status choices as rules.
 */
export function seedListSearchRuleset(
  input: ListSearchRulesetSeed
): { ruleset: FilterRuleset; seeded: boolean } {
  const applies_to =
    input.typeFilter === "both" ? "both" : input.typeFilter;
  const children: FilterChild[] = [];

  if (input.searchField === "name") {
    const name = input.nameQuery.trim();
    if (name) {
      children.push({
        condition: {
          id: nextRuleId("rule"),
          field: "name",
          operator: "contains",
          value: [name],
          applies_to,
        },
      });
    }
  } else {
    children.push({
      condition: {
        id: nextRuleId("rule"),
        field: "path",
        operator: "segments",
        value: input.pathSegments.map((s) => s.trim()).filter((s) => s !== ""),
        applies_to,
      },
    });
  }

  if (
    input.sizeBytes != null &&
    Number.isFinite(input.sizeBytes) &&
    input.sizeBytes >= 0 &&
    input.typeFilter !== "folder"
  ) {
    if (input.sizeOperator === "equals") {
      children.push({
        condition: {
          id: nextRuleId("rule"),
          field: "size",
          operator: "gte",
          value: input.sizeBytes,
          applies_to: "file",
        },
      });
      children.push({
        condition: {
          id: nextRuleId("rule"),
          field: "size",
          operator: "lte",
          value: input.sizeBytes,
          applies_to: "file",
        },
      });
    } else {
      children.push({
        condition: {
          id: nextRuleId("rule"),
          field: "size",
          operator: input.sizeOperator,
          value: input.sizeBytes,
          applies_to: "file",
        },
      });
    }
  }

  const reviewStatus = (input.reviewStatus ?? "").trim();
  if (reviewStatus) {
    children.push({
      condition: {
        id: nextRuleId("rule"),
        field: "review_status",
        operator: "eq",
        value: reviewStatus,
        applies_to: "both",
      },
    });
  }

  const pathIssueCategory = (input.pathIssueCategory ?? "").trim();
  const pathIssueStatus = (input.pathIssueStatus ?? "").trim();
  if (pathIssueCategory) {
    children.push({
      condition: {
        id: nextRuleId("rule"),
        field: "path_issue_category",
        operator: "eq",
        value: pathIssueCategory,
        applies_to: "both",
      },
    });
  } else if (pathIssueStatus) {
    children.push({
      condition: {
        id: nextRuleId("rule"),
        field: "path_issue_status",
        operator: "eq",
        value: pathIssueStatus,
        applies_to: "both",
      },
    });
  }

  if (children.length === 0) {
    return { ruleset: input.existing, seeded: false };
  }

  if (isRulesetEffectivelyEmpty(input.existing)) {
    return {
      ruleset: {
        ...createEmptyRuleset(input.migrationId, "List search filters"),
        root_group: {
          ...createDefaultGroup("AND"),
          children,
        },
      },
      seeded: true,
    };
  }

  const existing = cloneRuleset(input.existing);
  // Prefer flattening into the root AND so list search doesn't grow a nested shell.
  if (existing.root_group.op === "AND") {
    return {
      ruleset: {
        ...existing,
        root_group: {
          ...existing.root_group,
          children: [...(existing.root_group.children ?? []), ...children],
        },
      },
      seeded: true,
    };
  }

  return {
    ruleset: {
      ...existing,
      root_group: {
        id: nextRuleId("group"),
        op: "AND",
        negate: false,
        children: [
          { group: existing.root_group },
          {
            group: {
              id: nextRuleId("group"),
              op: "AND",
              negate: false,
              children,
            },
          },
        ],
      },
    },
    seeded: true,
  };
}

export function formatMatchSummary(
  annotation: { outcome: string; matches?: { label: string; result: string }[] },
  mode: "preview" | "review"
): string {
  const header = mode === "preview" ? "Matched rules" : "Excluded by";
  if (!annotation || typeof annotation !== "object") {
    return mode === "preview" ? "Excluded" : header;
  }
  if (annotation.outcome === "passed") {
    return mode === "preview" ? "Pass" : "Included";
  }
  if (annotation.outcome === "engine_error") {
    return "Engine error";
  }
  const rawMatches = Array.isArray(annotation.matches) ? annotation.matches : [];
  const matches = rawMatches.filter((m) => m && m.result === "pass");
  if (matches.length === 0) {
    return mode === "preview" ? "Excluded" : header;
  }
  const labels = matches.map((m) => m.label).filter(Boolean);
  if (labels.length === 0) {
    return mode === "preview" ? "Excluded" : header;
  }
  return `${header}: ${labels.join(", ")}`;
}
