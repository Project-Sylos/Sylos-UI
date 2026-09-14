import {
  FilterCondition,
  FilterGroup,
  FilterRuleset,
} from "../types/rulesets";
import { FIELD_LABELS } from "./rulesets";

export type FilterContradiction = {
  message: string;
  /** Index path from the ruleset root to the group that owns the conflict. */
  groupPath: number[];
  /** Path-search grouping traps are not unsatisfiable AND constraints. */
  kind?: "impossible" | "path";
};

type SetConstraint = {
  /** Values the field must be among (intersection of positives). */
  mustIntersect: Set<string>[] | null;
  /** Values the field must avoid (union of negatives). */
  mustAvoid: Set<string>;
  labels: string[];
};

type NumConstraint = {
  min: number | null;
  minInclusive: boolean;
  max: number | null;
  maxInclusive: boolean;
  equals: number[] | null;
  labels: string[];
};

const SET_FIELDS = new Set([
  "extension",
  "mimetype_category",
  "review_status",
  "path_issue_status",
  "path_issue_category",
]);

const NUM_FIELDS = new Set(["size"]);

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function valueList(value: FilterCondition["value"]): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof value === "boolean") {
    return [value ? "true" : "false"];
  }
  const raw = String(value ?? "").trim().toLowerCase();
  return raw ? [raw] : [];
}

function conditionShortLabel(cond: FilterCondition): string {
  const field = fieldLabel(cond.field);
  const vals = Array.isArray(cond.value)
    ? cond.value.join(", ")
    : String(cond.value ?? "");
  const op = cond.operator.replace(/_/g, " ");
  const polarity = cond.negate ? "not " : "";
  return `${polarity}${field} ${op} ${vals}`.trim();
}

function intersectSets(sets: Set<string>[]): Set<string> | null {
  if (sets.length === 0) return null;
  let out = new Set(sets[0]);
  for (let i = 1; i < sets.length; i += 1) {
    const next = new Set<string>();
    for (const v of out) {
      if (sets[i].has(v)) next.add(v);
    }
    out = next;
  }
  return out;
}

function emptySetConstraint(): SetConstraint {
  return { mustIntersect: null, mustAvoid: new Set(), labels: [] };
}

function emptyNumConstraint(): NumConstraint {
  return {
    min: null,
    minInclusive: true,
    max: null,
    maxInclusive: true,
    equals: null,
    labels: [],
  };
}

function applySetConstraint(
  state: SetConstraint,
  cond: FilterCondition
): string | null {
  const values = valueList(cond.value);
  if (values.length === 0) return null;
  const set = new Set(values);
  const label = conditionShortLabel(cond);
  state.labels.push(label);

  const op = cond.operator;
  const negated = !!cond.negate;

  // Treat eq / in as membership; neq as anti-membership.
  if (op === "neq") {
    if (negated) {
      // NOT (x != v) ≡ x == v
      if (!state.mustIntersect) state.mustIntersect = [];
      state.mustIntersect.push(set);
    } else {
      for (const v of set) state.mustAvoid.add(v);
    }
  } else if (op === "eq" || op === "in" || op === "") {
    if (negated) {
      for (const v of set) state.mustAvoid.add(v);
    } else {
      if (!state.mustIntersect) state.mustIntersect = [];
      state.mustIntersect.push(set);
    }
  } else {
    // glob / regex / contains: skip
    state.labels.pop();
    return null;
  }

  if (state.mustIntersect) {
    const allowed = intersectSets(state.mustIntersect);
    if (allowed && allowed.size === 0) {
      return `These rules can never match together (${state.labels.join("; ")}).`;
    }
    if (allowed) {
      let remaining = 0;
      for (const v of allowed) {
        if (!state.mustAvoid.has(v)) remaining += 1;
      }
      if (remaining === 0) {
        return `These rules can never match together (${state.labels.join("; ")}).`;
      }
    }
  }
  return null;
}

function tightenMin(
  state: NumConstraint,
  value: number,
  inclusive: boolean
): void {
  if (state.min == null || value > state.min) {
    state.min = value;
    state.minInclusive = inclusive;
    return;
  }
  if (value === state.min && !inclusive && state.minInclusive) {
    state.minInclusive = false;
  }
}

function tightenMax(
  state: NumConstraint,
  value: number,
  inclusive: boolean
): void {
  if (state.max == null || value < state.max) {
    state.max = value;
    state.maxInclusive = inclusive;
    return;
  }
  if (value === state.max && !inclusive && state.maxInclusive) {
    state.maxInclusive = false;
  }
}

function numRangeUnsat(state: NumConstraint): boolean {
  if (state.equals) {
    const uniq = [...new Set(state.equals)];
    if (uniq.length > 1) return true;
    const v = uniq[0];
    if (state.min != null) {
      if (v < state.min || (v === state.min && !state.minInclusive)) return true;
    }
    if (state.max != null) {
      if (v > state.max || (v === state.max && !state.maxInclusive)) return true;
    }
    return false;
  }
  if (state.min == null || state.max == null) return false;
  if (state.min > state.max) return true;
  if (state.min === state.max && (!state.minInclusive || !state.maxInclusive)) {
    return true;
  }
  return false;
}

function applyNumConstraint(
  state: NumConstraint,
  cond: FilterCondition
): string | null {
  const n = typeof cond.value === "number" ? cond.value : Number(cond.value);
  if (!Number.isFinite(n)) return null;
  const label = conditionShortLabel(cond);
  state.labels.push(label);

  const op = cond.operator;
  const negated = !!cond.negate;

  // Flip comparisons when negated: NOT (x > 5) ≡ x <= 5, etc.
  let effective = op;
  if (negated) {
    switch (op) {
      case "gt":
        effective = "lte";
        break;
      case "gte":
        effective = "lt";
        break;
      case "lt":
        effective = "gte";
        break;
      case "lte":
        effective = "gt";
        break;
      case "eq":
        effective = "neq";
        break;
      case "neq":
        effective = "eq";
        break;
      default:
        state.labels.pop();
        return null;
    }
  }

  switch (effective) {
    case "gt":
      tightenMin(state, n, false);
      break;
    case "gte":
      tightenMin(state, n, true);
      break;
    case "lt":
      tightenMax(state, n, false);
      break;
    case "lte":
      tightenMax(state, n, true);
      break;
    case "eq":
      if (!state.equals) state.equals = [];
      state.equals.push(n);
      break;
    case "neq":
      // Single-point hole: only contradict exact equals we already have.
      if (state.equals && state.equals.every((v) => v === n)) {
        return `These rules can never match together (${state.labels.join("; ")}).`;
      }
      break;
    default:
      state.labels.pop();
      return null;
  }

  if (numRangeUnsat(state)) {
    return `These rules can never match together (${state.labels.join("; ")}).`;
  }
  return null;
}

function checkAppliesToConflict(
  conditions: FilterCondition[],
  matchMode: "exclude" | "search"
): string | null {
  let sawFile = false;
  let sawFolder = false;
  const labels: string[] = [];
  for (const cond of conditions) {
    if (cond.negate) continue;
    if (matchMode === "search" && cond.field === "path") continue;
    if (cond.applies_to === "file") {
      sawFile = true;
      labels.push(`${conditionShortLabel(cond)} (files only)`);
    } else if (cond.applies_to === "folder") {
      sawFolder = true;
      labels.push(`${conditionShortLabel(cond)} (folders only)`);
    }
  }
  if (sawFile && sawFolder) {
    return `These rules can never match together: one requires a file and another requires a folder (${labels.join("; ")}).`;
  }
  return null;
}

function checkAndConditions(
  conditions: FilterCondition[],
  matchMode: "exclude" | "search"
): string[] {
  const messages: string[] = [];
  const setStates = new Map<string, SetConstraint>();
  const numStates = new Map<string, NumConstraint>();

  const applies = checkAppliesToConflict(conditions, matchMode);
  if (applies) messages.push(applies);

  for (const cond of conditions) {
    if (SET_FIELDS.has(cond.field)) {
      let state = setStates.get(cond.field);
      if (!state) {
        state = emptySetConstraint();
        setStates.set(cond.field, state);
      }
      const msg = applySetConstraint(state, cond);
      if (msg) messages.push(msg);
      continue;
    }

    if (NUM_FIELDS.has(cond.field)) {
      let state = numStates.get(cond.field);
      if (!state) {
        state = emptyNumConstraint();
        numStates.set(cond.field, state);
      }
      const msg = applyNumConstraint(state, cond);
      if (msg) messages.push(msg);
    }
  }

  return messages;
}

function groupHasInternalContradiction(group: FilterGroup): boolean {
  return findInGroup(group, [], "exclude").some((item) => item.kind !== "path");
}

function pathSearchIssues(
  group: FilterGroup,
  path: number[],
  underOr: boolean
): FilterContradiction[] {
  const out: FilterContradiction[] = [];
  const orHere = underOr || (!group.negate && group.op === "OR");
  (group.children ?? []).forEach((child, index) => {
    const cond = child.condition;
    if (cond?.field === "path") {
      if (cond.negate || group.negate) {
        out.push({
          kind: "path",
          groupPath: path,
          message:
            "Don't match when is ignored for path parts. Path search only requires in-path segments.",
        });
      } else if (orHere) {
        out.push({
          kind: "path",
          groupPath: path,
          message:
            "Path parts are always required in order. Putting them under any of these does not make them optional.",
        });
      }
    }
    if (child.group) {
      out.push(...pathSearchIssues(child.group, [...path, index], orHere));
    }
  });
  return out;
}

function findInGroup(
  group: FilterGroup,
  path: number[],
  matchMode: "exclude" | "search"
): FilterContradiction[] {
  const out: FilterContradiction[] = [];
  const children = group.children ?? [];

  // Negated groups invert meaning; skip structural unsat inside them.
  if (!group.negate && group.op === "AND") {
    const direct = children
      .map((c) => c.condition)
      .filter((c): c is FilterCondition => !!c);
    for (const message of checkAndConditions(direct, matchMode)) {
      out.push({ message, groupPath: path, kind: "impossible" });
    }
  }

  if (!group.negate && group.op === "OR") {
    const nested = children
      .map((c) => c.group)
      .filter((g): g is FilterGroup => !!g);
    const conditionKids = children.filter((c) => c.condition).length;
    // Outer check: every branch is itself contradictory (and there is at least one).
    if (
      nested.length > 0 &&
      conditionKids === 0 &&
      nested.every((g) => groupHasInternalContradiction(g))
    ) {
      out.push({
        kind: "impossible",
        message:
          "Every branch in this any-of-these group contradicts itself, so nothing can match.",
        groupPath: path,
      });
    }
  }

  children.forEach((child, index) => {
    if (child.group) {
      out.push(...findInGroup(child.group, [...path, index], matchMode));
    }
  });

  return out;
}

/**
 * Cheap AST lint for obvious unsatisfiable AND constraints among fields the
 * editor exposes (extension/status sets, size ranges, file+folder applies_to)
 * and OR groups whose every nested branch is already contradictory.
 * Skips name glob/regex/contains and non-UI fields (depth, child_count, …).
 * In search mode, path parts are not boolean leaves: they are always required
 * in order, and Don't match when on a path rule is ignored.
 */
export function findFilterContradictions(
  ruleset: FilterRuleset,
  matchMode: "exclude" | "search" = "exclude"
): FilterContradiction[] {
  const raw = findInGroup(ruleset.root_group, [], matchMode);
  if (matchMode === "search") {
    raw.push(...pathSearchIssues(ruleset.root_group, [], false));
  }
  // Dedupe identical messages (pair-wise checks can repeat as constraints grow).
  const seen = new Set<string>();
  const out: FilterContradiction[] = [];
  for (const item of raw) {
    const key = `${item.groupPath.join(".")}|${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
