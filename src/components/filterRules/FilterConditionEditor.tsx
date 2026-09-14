import { useEffect, useMemo, useRef, type DragEvent } from "react";
import { GripVertical, Trash2, ChevronUp, ChevronDown, Plus, X } from "lucide-react";

import {
  FilterCondition,
  MtimeMode,
  NamePathMode,
} from "../../types/rulesets";
import {
  APPLIES_TO_OPTIONS,
  EXTENSION_PRESETS,
  FIELD_LABELS,
  MTIME_DURATION_UNITS,
  MTIME_MODE_OPTIONS,
  SIZE_UNITS,
  conditionPatternList,
  createDefaultCondition,
  formatBytesForSizeInput,
  isMtimeDateMode,
  lockedAppliesTo,
  matchingExtensionPresetId,
  mtimeDateInputValue,
  namePathModeFromOperator,
  operatorFromNamePathMode,
  parseSizeToBytes,
} from "../../utils/rulesets";
import TokenListInput from "./TokenListInput";
import "./FilterRulesBuilder.css";

const BASE_FIELD_OPTIONS: FilterCondition["field"][] = [
  "name",
  "path",
  "extension",
  "size",
  "mtime",
];

const REVIEW_STATUS_OPTIONS = [
  { value: "pending", label: "Pending (will be copied over)" },
  { value: "pending_retry", label: "Pending Retry" },
  { value: "excluded", label: "Excluded" },
  { value: "failed", label: "Failed" },
  { value: "successful", label: "Exists (on both)" },
  { value: "not_on_src", label: "Exists (on destination only)" },
] as const;

const MAX_PATH_SEGMENTS = 6;

function pathSegmentDrafts(value: FilterCondition["value"]): string[] {
  if (Array.isArray(value)) {
    const raw = value.map((item) => String(item));
    return raw.length > 0 ? raw : [""];
  }
  if (value == null || String(value) === "") return [""];
  return [String(value)];
}

interface FilterConditionEditorProps {
  condition: FilterCondition;
  onChange: (next: FilterCondition) => void;
  onRemove: () => void;
  disabled?: boolean;
  /** Search match wording instead of exclusion Filter out/in. */
  matchMode?: "exclude" | "search";
  /** Hide pending status option in copy/traversal (matches basic filter). */
  isCopyPhase?: boolean;
  /** When true (Discover review), hide copy-pending; use pending_retry / failed instead. */
  isTraversalPhase?: boolean;
  /** Show compatibility fields (Spectra / GPL path issues). */
  showCompatFields?: boolean;
  pathIssueCategories?: Array<{ category: string; label: string; count: number }>;
  /** Drag handle props from parent DnD (handle-only, so inputs stay usable). */
  dragHandleProps?: {
    draggable: true;
    onDragStart: (e: DragEvent) => void;
    onDragEnd: () => void;
  };
}

export default function FilterConditionEditor({
  condition,
  onChange,
  onRemove,
  disabled = false,
  matchMode = "exclude",
  isCopyPhase = false,
  isTraversalPhase = false,
  showCompatFields = false,
  pathIssueCategories = [],
  dragHandleProps,
}: FilterConditionEditorProps) {
  const sizeParts = useMemo(() => {
    if (typeof condition.value !== "number") {
      return { amount: 0, unit: "MB" };
    }
    return formatBytesForSizeInput(condition.value);
  }, [condition.value]);

  const mtimeParts = useMemo(() => {
    const raw = String(condition.value ?? "1y");
    const match = raw.match(/^(\d+(?:\.\d+)?)([a-z]+)$/i);
    if (!match) return { amount: 1, unit: "y" };
    return { amount: Number(match[1]), unit: match[2] };
  }, [condition.value]);

  const namePathMode = namePathModeFromOperator(condition.operator);

  const fieldOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = BASE_FIELD_OPTIONS.map(
      (field) => ({ value: field, label: FIELD_LABELS[field] ?? field })
    );
    if (matchMode === "search") {
      opts.push({ value: "review_status", label: "Status" });
      if (showCompatFields) {
        opts.push({ value: "compatibility", label: "Compatibility" });
      }
    }
    return opts;
  }, [matchMode, showCompatFields]);

  const fieldSelectValue =
    condition.field === "path_issue_status" ||
    condition.field === "path_issue_category"
      ? "compatibility"
      : condition.field;

  /** Duration and date modes hold different value shapes, so seed one when switching. */
  const updateMtimeMode = (mode: MtimeMode) => {
    const toDate = isMtimeDateMode(mode);
    if (toDate === isMtimeDateMode(condition.operator)) {
      onChange({ ...condition, operator: mode });
      return;
    }
    onChange({
      ...condition,
      operator: mode,
      value: toDate
        ? mtimeDateInputValue(condition.value) ||
          new Date().toISOString().slice(0, 10)
        : "1y",
    });
  };

  const updateField = (raw: string) => {
    if (raw === "compatibility") {
      onChange({
        ...createDefaultCondition("path_issue_status"),
        id: condition.id,
        negate: condition.negate,
      });
      return;
    }
    const field = raw as FilterCondition["field"];
    if (field === "review_status") {
      onChange({
        ...createDefaultCondition("review_status"),
        id: condition.id,
        negate: condition.negate,
        value: isCopyPhase || isTraversalPhase ? "pending_retry" : "pending",
      });
      return;
    }
    const next: FilterCondition = {
      ...condition,
      field,
      case_sensitive: undefined,
    };
    switch (field) {
      case "size":
        next.operator = "gt";
        next.value = parseSizeToBytes(100, "MB");
        next.applies_to = "file";
        break;
      case "mtime":
        next.operator = "older_than";
        next.value = "1y";
        next.applies_to = "file";
        break;
      case "extension":
        next.operator = "in";
        next.value = [];
        next.applies_to = "file";
        break;
      case "path":
        next.operator = matchMode === "search" ? "segments" : "contains";
        next.value = matchMode === "search" ? [""] : [];
        next.applies_to = "both";
        next.case_sensitive = undefined;
        break;
      case "name":
        next.operator = "contains";
        next.value = [];
        next.applies_to = "both";
        next.case_sensitive = undefined;
        break;
      default:
        break;
    }
    onChange(next);
  };

  const compatibilitySelectValue =
    condition.field === "path_issue_category"
      ? `cat:${String(condition.value ?? "")}`
      : String(condition.value ?? "issues");

  const updateCompatibility = (raw: string) => {
    if (raw.startsWith("cat:")) {
      onChange({
        ...condition,
        field: "path_issue_category",
        operator: "eq",
        value: raw.slice(4),
        applies_to: "both",
      });
      return;
    }
    onChange({
      ...condition,
      field: "path_issue_status",
      operator: "eq",
      value: raw,
      applies_to: "both",
    });
  };

  const extensions = Array.isArray(condition.value)
    ? condition.value.map(String)
    : [];
  const extensionPresetId = matchingExtensionPresetId(extensions);

  const patterns = conditionPatternList(condition.value);
  const pathSearch = matchMode === "search" && condition.field === "path";
  // Keep blank drafts. conditionPatternList drops "" so an added path part never renders.
  const pathSegments = pathSearch ? pathSegmentDrafts(condition.value) : [];
  const pathInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const focusPathIndex = useRef<number | null>(null);
  useEffect(() => {
    const index = focusPathIndex.current;
    if (index == null) return;
    focusPathIndex.current = null;
    pathInputRefs.current[index]?.focus();
  }, [pathSegments]);
  const setPathSegments = (next: string[]) => {
    onChange({
      ...condition,
      field: "path",
      operator: "segments",
      value: next.length > 0 ? next : [""],
      applies_to: "both",
      negate: false,
      case_sensitive: undefined,
    });
  };
  const appliesLock = lockedAppliesTo(condition.field);
  const appliesTo = appliesLock ?? condition.applies_to;
  const knownField =
    fieldOptions.some((o) => o.value === fieldSelectValue) ||
    fieldSelectValue === "compatibility";
  const fieldValue = knownField ? fieldSelectValue : "name";
  const polarityLabel =
    matchMode === "search"
      ? {
          is: "Match when",
          not: "Don't match when",
        }
      : {
          is: "Filter out when",
          not: "Filter in when",
        };

  const statusOptions = REVIEW_STATUS_OPTIONS.filter(
    (opt) => !((isCopyPhase || isTraversalPhase) && opt.value === "pending")
  );

  return (
    <div className="filter-rules-condition">
      <div className="filter-rules-condition__main">
        {dragHandleProps ? (
          <span
            className="filter-rules-drag-handle"
            title="Drag to move"
            aria-label="Drag to move"
            {...dragHandleProps}
          >
            <GripVertical size={16} />
          </span>
        ) : null}

        <div className="filter-rules-condition__row">
        {!pathSearch ? (
        <label>
          <span className="filter-rules-builder__label">This rule</span>
          <select
            className="filter-rules-builder__select"
            value={condition.negate ? "not" : "is"}
            disabled={disabled}
            onChange={(e) =>
              onChange({
                ...condition,
                negate: e.target.value === "not" ? true : false,
              })
            }
          >
            <option value="is">{polarityLabel.is}</option>
            <option value="not">{polarityLabel.not}</option>
          </select>
        </label>
        ) : null}

        <label>
          <span className="filter-rules-builder__label">Field</span>
          <select
            className="filter-rules-builder__select"
            value={fieldValue}
            disabled={disabled}
            onChange={(e) => updateField(e.target.value)}
          >
            {fieldOptions.map((field) => (
              <option key={field.value} value={field.value}>
                {field.label}
              </option>
            ))}
          </select>
        </label>

        {(condition.field === "name" || (condition.field === "path" && !pathSearch)) && (
          <label>
            <span className="filter-rules-builder__label">Match mode</span>
            <select
              className="filter-rules-builder__select"
              value={namePathMode}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...condition,
                  operator: operatorFromNamePathMode(e.target.value as NamePathMode),
                })
              }
            >
              <option value="contains">Contains text</option>
              <option value="glob">Whole name or wildcard</option>
              <option value="regex">Regex (advanced)</option>
            </select>
          </label>
        )}

        {(condition.field === "name" || (condition.field === "path" && !pathSearch)) && (
          <label className="filter-rules-condition__checkbox">
            <input
              type="checkbox"
              checked={!!condition.case_sensitive}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...condition,
                  case_sensitive: e.target.checked ? true : undefined,
                })
              }
            />
            Case sensitive
          </label>
        )}

        {condition.field === "size" && (
          <label>
            <span className="filter-rules-builder__label">Compare</span>
            <select
              className="filter-rules-builder__select"
              value={condition.operator}
              disabled={disabled}
              onChange={(e) => onChange({ ...condition, operator: e.target.value })}
            >
              <option value="eq">Equals</option>
              <option value="gt">Greater than</option>
              <option value="gte">Greater or equal</option>
              <option value="lt">Less than</option>
              <option value="lte">Less or equal</option>
            </select>
          </label>
        )}

        {condition.field === "mtime" && (
          <label>
            <span className="filter-rules-builder__label">Compare</span>
            <select
              className="filter-rules-builder__select"
              value={condition.operator}
              disabled={disabled}
              onChange={(e) => updateMtimeMode(e.target.value as MtimeMode)}
            >
              {MTIME_MODE_OPTIONS.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {!appliesLock &&
          !pathSearch &&
          condition.field !== "review_status" &&
          condition.field !== "path_issue_status" &&
          condition.field !== "path_issue_category" && (
          <label>
            <span className="filter-rules-builder__label">Applies to</span>
            <select
              className="filter-rules-builder__select"
              value={appliesTo}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...condition,
                  applies_to: e.target.value as FilterCondition["applies_to"],
                })
              }
            >
              {APPLIES_TO_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {condition.field === "review_status" && (
          <label>
            <span className="filter-rules-builder__label">Status</span>
            <select
              className="filter-rules-builder__select"
              value={String(condition.value ?? "")}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  ...condition,
                  operator: "eq",
                  value: e.target.value,
                  applies_to: "both",
                })
              }
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {(condition.field === "path_issue_status" ||
          condition.field === "path_issue_category") && (
          <label>
            <span className="filter-rules-builder__label">Compatibility</span>
            <select
              className="filter-rules-builder__select"
              value={compatibilitySelectValue}
              disabled={disabled}
              onChange={(e) => updateCompatibility(e.target.value)}
            >
              <option value="issues">Has issues</option>
              <option value="manual">Needs manual review</option>
              <option value="rejected">Ignored / rejected</option>
              <option value="none">No issues</option>
              {pathIssueCategories.length > 0 ? (
                <optgroup label="By type">
                  {pathIssueCategories.map((row) => (
                    <option key={row.category} value={`cat:${row.category}`}>
                      {row.label} ({row.count})
                    </option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </label>
        )}

        {condition.field === "size" && (
          <label>
            <span className="filter-rules-builder__label">Size</span>
            <div className="filter-rules-inline-size">
              <input
                className="filter-rules-builder__input"
                type="number"
                min={0}
                step="any"
                disabled={disabled}
                value={sizeParts.amount}
                onChange={(e) =>
                  onChange({
                    ...condition,
                    value: parseSizeToBytes(
                      Number(e.target.value),
                      sizeParts.unit
                    ),
                  })
                }
              />
              <select
                className="filter-rules-builder__select"
                value={sizeParts.unit}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    ...condition,
                    value: parseSizeToBytes(sizeParts.amount, e.target.value),
                  })
                }
              >
                {SIZE_UNITS.map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.value}
                  </option>
                ))}
              </select>
            </div>
          </label>
        )}

        {condition.field === "mtime" && isMtimeDateMode(condition.operator) && (
          <label>
            <span className="filter-rules-builder__label">Date</span>
            <input
              className="filter-rules-builder__input"
              type="date"
              disabled={disabled}
              value={mtimeDateInputValue(condition.value)}
              onChange={(e) => onChange({ ...condition, value: e.target.value })}
            />
          </label>
        )}

        {condition.field === "mtime" && !isMtimeDateMode(condition.operator) && (
          <label>
            <span className="filter-rules-builder__label">Duration</span>
            <div className="filter-rules-inline-size">
              <input
                className="filter-rules-builder__input"
                type="number"
                min={0}
                step="any"
                disabled={disabled}
                value={mtimeParts.amount}
                onChange={(e) =>
                  onChange({
                    ...condition,
                    value: `${e.target.value}${mtimeParts.unit}`,
                  })
                }
              />
              <select
                className="filter-rules-builder__select"
                value={mtimeParts.unit}
                disabled={disabled}
                onChange={(e) =>
                  onChange({
                    ...condition,
                    value: `${mtimeParts.amount}${e.target.value}`,
                  })
                }
              >
                {MTIME_DURATION_UNITS.map((unit) => (
                  <option key={unit.value} value={unit.value}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
          </label>
        )}

        {condition.field === "extension" && (
          <>
            <label>
              <span className="filter-rules-builder__label">Preset</span>
              <select
                className="filter-rules-builder__select"
                value={extensionPresetId}
                disabled={disabled}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    onChange({ ...condition, operator: "in", value: [] });
                    return;
                  }
                  const preset = EXTENSION_PRESETS.find((p) => p.id === id);
                  if (!preset) return;
                  onChange({
                    ...condition,
                    operator: "in",
                    applies_to: "file",
                    value: [...preset.extensions],
                  });
                }}
              >
                <option value="">Custom list</option>
                {EXTENSION_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <TokenListInput
              label="Extensions"
              placeholder="pdf"
              tokens={extensions}
              disabled={disabled}
              normalize={(raw) => raw.trim().replace(/^\./, "").toLowerCase()}
              renderToken={(ext) => `.${ext}`}
              onChange={(next) => onChange({ ...condition, value: next })}
            />
            <p className="filter-rules-builder__hint">
              Pick a preset to prefill, then add or remove extensions.
            </p>
          </>
        )}

        {(condition.field === "name" || (condition.field === "path" && !pathSearch)) && (
          <TokenListInput
            label={namePathMode === "regex" ? "Patterns" : "Values"}
            placeholder={
              namePathMode === "glob"
                ? "*.tmp"
                : namePathMode === "regex"
                  ? "^draft"
                  : "report"
            }
            tokens={patterns}
            disabled={disabled}
            onChange={(next) => onChange({ ...condition, value: next })}
          />
        )}
        {pathSearch && (
          <div className="filter-rules-path-segments">
            <span className="filter-rules-builder__label">In path</span>
            {pathSegments.map((seg, index) => (
              <div key={index} className="filter-rules-path-segment">
                <input
                  ref={(node) => {
                    pathInputRefs.current[index] = node;
                  }}
                  type="text"
                  className="filter-rules-builder__input"
                  placeholder={index === 0 ? "In path…" : "then…"}
                  value={seg}
                  disabled={disabled}
                  aria-label={`Path segment ${index + 1}`}
                  onChange={(e) => {
                    const next = [...pathSegments];
                    next[index] = e.target.value;
                    setPathSegments(next);
                  }}
                />
                <button
                  type="button"
                  className="filter-rules-path-segment__btn"
                  title="Move up"
                  aria-label={`Move segment ${index + 1} up`}
                  disabled={disabled || index === 0}
                  onClick={() => {
                    const next = [...pathSegments];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    setPathSegments(next);
                  }}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  className="filter-rules-path-segment__btn"
                  title="Move down"
                  aria-label={`Move segment ${index + 1} down`}
                  disabled={disabled || index >= pathSegments.length - 1}
                  onClick={() => {
                    const next = [...pathSegments];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    setPathSegments(next);
                  }}
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  className="filter-rules-path-segment__btn"
                  title="Remove segment"
                  aria-label={`Remove segment ${index + 1}`}
                  disabled={disabled || pathSegments.length <= 1}
                  onClick={() => setPathSegments(pathSegments.filter((_, i) => i !== index))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {pathSegments.length < MAX_PATH_SEGMENTS && (
              <button
                type="button"
                className="filter-rules-path-segment__add"
                disabled={disabled}
                onClick={() => {
                  focusPathIndex.current = pathSegments.length;
                  setPathSegments([...pathSegments, ""]);
                }}
              >
                <Plus size={14} />
                Add path part
              </button>
            )}
            <p className="filter-rules-builder__hint">
              Ordered folder names along the path, same as the search bar. Gaps are allowed.
            </p>
          </div>
        )}
        </div>
      </div>

      <div className="filter-rules-condition__actions">
        {!disabled && (
          <button
            type="button"
            className="glass-button glass-button--secondary"
            onClick={onRemove}
            title="Remove condition"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
