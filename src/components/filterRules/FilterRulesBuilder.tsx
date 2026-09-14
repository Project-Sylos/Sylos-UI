import { useMemo } from "react";
import FilterGroupEditor from "./FilterGroupEditor";
import { FilterRuleset } from "../../types/rulesets";
import { findFilterContradictions } from "../../utils/filterContradictions";
import {
  isEditorKeepOnly,
  isRulesetEffectivelyEmpty,
  moveFilterChild,
} from "../../utils/rulesets";
import "./FilterRulesBuilder.css";

interface FilterRulesBuilderProps {
  ruleset: FilterRuleset;
  onChange: (next: FilterRuleset) => void;
  disabled?: boolean;
  /** Hide name/description and use plain-language labels. */
  compact?: boolean;
  /** Search match wording instead of exclusion Filter out/in. */
  matchMode?: "exclude" | "search";
  isCopyPhase?: boolean;
  isTraversalPhase?: boolean;
  showCompatFields?: boolean;
  pathIssueCategories?: Array<{ category: string; label: string; count: number }>;
}

export default function FilterRulesBuilder({
  ruleset,
  onChange,
  disabled = false,
  compact = false,
  matchMode = "exclude",
  isCopyPhase = false,
  isTraversalPhase = false,
  showCompatFields = false,
  pathIssueCategories = [],
}: FilterRulesBuilderProps) {
  const keepOnly = isEditorKeepOnly(ruleset);
  const contradictions = useMemo(
    () => findFilterContradictions(ruleset, matchMode),
    [ruleset, matchMode]
  );
  const impossible = contradictions.filter((item) => item.kind !== "path");
  const pathNotes = contradictions.filter((item) => item.kind === "path");

  const updateRootGroup = (root_group: FilterRuleset["root_group"]) => {
    onChange({ ...ruleset, root_group: { ...root_group, negate: false } });
  };

  const moveChild = (
    fromPath: number[],
    toParentPath: number[],
    toIndex: number
  ) => {
    updateRootGroup(
      moveFilterChild(ruleset.root_group, fromPath, toParentPath, toIndex)
    );
  };

  return (
    <div
      className={`filter-rules-builder${compact ? " filter-rules-builder--compact" : ""}${
        disabled ? " filter-rules-builder--readonly" : ""
      }`}
    >
      {!compact && (
        <div className="filter-rules-builder__meta">
          <label className="filter-rules-builder__meta-row">
            <span className="filter-rules-builder__label">Name</span>
            <input
              className="filter-rules-builder__input"
              type="text"
              value={ruleset.name}
              disabled={disabled}
              onChange={(e) => onChange({ ...ruleset, name: e.target.value })}
              placeholder="e.g. PDFs under a report folder"
            />
          </label>
          <label className="filter-rules-builder__meta-row">
            <span className="filter-rules-builder__label">Notes</span>
            <textarea
              className="filter-rules-builder__textarea"
              value={ruleset.description ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ ...ruleset, description: e.target.value })}
              placeholder="Optional notes"
            />
          </label>
        </div>
      )}

      <FilterGroupEditor
        group={ruleset.root_group}
        disabled={disabled}
        compact={compact}
        matchMode={matchMode}
        isCopyPhase={isCopyPhase}
        isTraversalPhase={isTraversalPhase}
        showCompatFields={showCompatFields}
        pathIssueCategories={pathIssueCategories}
        path={[]}
        onMoveChild={disabled ? undefined : moveChild}
        onChange={updateRootGroup}
      />

      {contradictions.length > 0 ? (
        <div
          className="filter-rules-builder__contradictions"
          role="status"
          aria-live="polite"
        >
          {impossible.length > 0 ? (
            <>
              <p className="filter-rules-builder__contradictions-title">
                These rules look impossible to satisfy
              </p>
              <ul className="filter-rules-builder__contradictions-list">
                {impossible.map((item, index) => (
                  <li key={`${item.groupPath.join("-")}-${index}`}>{item.message}</li>
                ))}
              </ul>
            </>
          ) : null}
          {pathNotes.length > 0 ? (
            <>
              <p className="filter-rules-builder__contradictions-title">
                Path search does not follow this grouping
              </p>
              <ul className="filter-rules-builder__contradictions-list">
                {pathNotes.map((item, index) => (
                  <li key={`path-${item.groupPath.join("-")}-${index}`}>
                    {item.message}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      <p className="filter-rules-builder__hint">
        {isRulesetEffectivelyEmpty(ruleset)
          ? compact || matchMode === "search"
            ? "No rules yet. Add one below (for example: name contains report). Drag the handle to move rules between groups."
            : "No rules yet, so everything under the source root is migrated unless you uncheck items while browsing."
          : matchMode === "search"
            ? keepOnly
              ? "Every rule is Don't match when, so only items that fail all/any of them are shown. Prefer Match when for normal list search."
              : "Match when keeps items that satisfy the rule. Don't match when drops items that satisfy it. Path parts are always required in order, even inside any of these. Drag rules between groups, or onto the page background to ungroup."
            : keepOnly
              ? "Every rule is Filter in when, so only items that match all/any of them are kept. Example: path contains mnt and path contains media with all of these keeps only /mnt/media."
              : "Filter out when skips matching items. Switch a rule to Filter in when to require a match instead. If every rule is Filter in when, the set becomes keep-only."}
      </p>
    </div>
  );
}
