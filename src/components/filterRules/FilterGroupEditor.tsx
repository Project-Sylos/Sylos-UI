import { useState, type DragEvent, type ReactNode } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";

import FilterConditionEditor from "./FilterConditionEditor";
import {
  FilterChild,
  FilterCondition,
  FilterGroup,
  GroupOp,
} from "../../types/rulesets";
import { createDefaultCondition, createDefaultGroup } from "../../utils/rulesets";
import "./FilterRulesBuilder.css";

const COMBINE_OPTIONS = [
  { value: "AND", label: "all of these" },
  { value: "OR", label: "any of these" },
] as const;

const DND_MIME = "application/x-sylos-filter-path";

interface FilterGroupEditorProps {
  group: FilterGroup;
  onChange: (next: FilterGroup) => void;
  depth?: number;
  disabled?: boolean;
  onRemove?: () => void;
  /** Denser controls; root group hides the any/all selector. */
  compact?: boolean;
  matchMode?: "exclude" | "search";
  isCopyPhase?: boolean;
  isTraversalPhase?: boolean;
  showCompatFields?: boolean;
  pathIssueCategories?: Array<{ category: string; label: string; count: number }>;
  /** Index path from the ruleset root to this group (empty for root). */
  path?: number[];
  /** Move a dragged child into this tree (root editor owns the mutation). */
  onMoveChild?: (
    fromPath: number[],
    toParentPath: number[],
    toIndex: number
  ) => void;
}

function parseDragPath(dataTransfer: DataTransfer): number[] | null {
  const raw =
    dataTransfer.getData(DND_MIME) || dataTransfer.getData("text/plain");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !Array.isArray(parsed) ||
      !parsed.every((v) => typeof v === "number" && Number.isInteger(v))
    ) {
      return null;
    }
    return parsed as number[];
  } catch {
    return null;
  }
}

function isPrefix(prefix: number[], path: number[]): boolean {
  return (
    prefix.length <= path.length &&
    prefix.every((v, i) => v === path[i])
  );
}

export default function FilterGroupEditor({
  group,
  onChange,
  depth = 0,
  disabled = false,
  onRemove,
  compact = false,
  matchMode = "exclude",
  isCopyPhase = false,
  isTraversalPhase = false,
  showCompatFields = false,
  pathIssueCategories = [],
  path = [],
  onMoveChild,
}: FilterGroupEditorProps) {
  const groupChildren = group.children ?? [];
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [draggingPath, setDraggingPath] = useState<number[] | null>(null);
  const dndEnabled = !disabled && !!onMoveChild;

  const updateChild = (index: number, child: FilterChild) => {
    const children = [...groupChildren];
    children[index] = child;
    onChange({ ...group, negate: false, children });
  };

  const removeChild = (index: number) => {
    onChange({
      ...group,
      negate: false,
      children: groupChildren.filter((_, i) => i !== index),
    });
  };

  const addCondition = () => {
    onChange({
      ...group,
      negate: false,
      children: [...groupChildren, { condition: createDefaultCondition() }],
    });
  };

  const addGroup = () => {
    onChange({
      ...group,
      negate: false,
      children: [
        ...groupChildren,
        {
          group: {
            ...createDefaultGroup(),
            children: [{ condition: createDefaultCondition() }],
          },
        },
      ],
    });
  };

  const acceptDrop = (e: DragEvent, toIndex: number): boolean => {
    if (!onMoveChild) return false;
    e.preventDefault();
    e.stopPropagation();
    const fromPath = parseDragPath(e.dataTransfer);
    setDropIndex(null);
    setDraggingPath(null);
    if (!fromPath || fromPath.length === 0) return false;
    if (isPrefix(fromPath, path)) return false;
    onMoveChild(fromPath, path, toIndex);
    return true;
  };

  const dragHandleProps = (childPath: number[]) =>
    dndEnabled
      ? {
          draggable: true as const,
          onDragStart: (e: DragEvent) => {
            const payload = JSON.stringify(childPath);
            e.dataTransfer.setData(DND_MIME, payload);
            e.dataTransfer.setData("text/plain", payload);
            e.dataTransfer.effectAllowed = "move";
            setDraggingPath(childPath);
          },
          onDragEnd: () => {
            setDraggingPath(null);
            setDropIndex(null);
          },
        }
      : undefined;

  const nested = depth > 0;
  const showCombine = nested || !compact;

  return (
    <div
      className={`filter-rules-group${nested ? " filter-rules-group--nested" : ""}${
        !nested && compact ? " filter-rules-group--root" : ""
      }${dropIndex === groupChildren.length ? " filter-rules-group--drop-end" : ""}`}
      onDragOver={
        dndEnabled
          ? (e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setDropIndex(groupChildren.length);
            }
          : undefined
      }
      onDragLeave={
        dndEnabled
          ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setDropIndex(null);
              }
            }
          : undefined
      }
      onDrop={
        dndEnabled
          ? (e) => {
              acceptDrop(e, groupChildren.length);
            }
          : undefined
      }
    >
      {showCombine ? (
        <div className="filter-rules-group__header">
          <select
            className="filter-rules-builder__select filter-rules-group__control"
            value={group.op}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...group, negate: false, op: e.target.value as GroupOp })
            }
            aria-label="How these rules combine"
          >
            {COMBINE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {!disabled && onRemove && (
            <button
              type="button"
              className="glass-button glass-button--secondary"
              onClick={onRemove}
              title="Remove group"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      ) : null}

      <div className="filter-rules-group__children">
        {groupChildren.length === 0 && (
          <p className="filter-rules-group__empty">
            No rules yet. Add one below (for example: name contains report).
            {dndEnabled ? " Or drag a rule here." : ""}
          </p>
        )}
        {groupChildren.map((child, index) => {
          const childPath = [...path, index];
          const isDragging =
            draggingPath != null &&
            draggingPath.length === childPath.length &&
            draggingPath.every((v, i) => v === childPath[i]);
          const showDropBefore = dropIndex === index;
          const handleProps = dragHandleProps(childPath);

          const wrapDnD = (node: ReactNode) => (
            <div
              key={
                child.condition?.id ??
                child.group?.id ??
                `${depth}-${index}`
              }
              className={`filter-rules-child${
                isDragging ? " filter-rules-child--dragging" : ""
              }${showDropBefore ? " filter-rules-child--drop-before" : ""}`}
              onDragOver={
                dndEnabled
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      e.dataTransfer.dropEffect = "move";
                      setDropIndex(index);
                    }
                  : undefined
              }
              onDrop={
                dndEnabled
                  ? (e) => {
                      acceptDrop(e, index);
                    }
                  : undefined
              }
            >
              {node}
            </div>
          );

          if (child.condition) {
            return wrapDnD(
              <FilterConditionEditor
                condition={child.condition}
                disabled={disabled}
                matchMode={matchMode}
                isCopyPhase={isCopyPhase}
                isTraversalPhase={isTraversalPhase}
                showCompatFields={showCompatFields}
                pathIssueCategories={pathIssueCategories}
                dragHandleProps={handleProps}
                onChange={(next: FilterCondition) =>
                  updateChild(index, { condition: next })
                }
                onRemove={() => removeChild(index)}
              />
            );
          }
          if (child.group) {
            return wrapDnD(
              <div className="filter-rules-nested-wrap">
                {handleProps ? (
                  <span
                    className="filter-rules-drag-handle filter-rules-drag-handle--group"
                    title="Drag to move group"
                    aria-label="Drag to move group"
                    {...handleProps}
                  >
                    <GripVertical size={16} />
                  </span>
                ) : null}
                <FilterGroupEditor
                  group={child.group}
                  depth={depth + 1}
                  disabled={disabled}
                  compact={compact}
                  matchMode={matchMode}
                  isCopyPhase={isCopyPhase}
                  isTraversalPhase={isTraversalPhase}
                  showCompatFields={showCompatFields}
                  pathIssueCategories={pathIssueCategories}
                  path={childPath}
                  onMoveChild={onMoveChild}
                  onChange={(next) =>
                    updateChild(index, { group: { ...next, negate: false } })
                  }
                  onRemove={() => removeChild(index)}
                />
              </div>
            );
          }
          return null;
        })}
      </div>

      {!disabled && (
        <div className="filter-rules-builder__toolbar">
          <button
            type="button"
            className="glass-button glass-button--secondary"
            onClick={addCondition}
          >
            <Plus size={16} style={{ marginRight: "0.35rem" }} />
            Add rule
          </button>
          {depth === 0 && (
            <button
              type="button"
              className="glass-button glass-button--secondary"
              onClick={addGroup}
            >
              Add group
            </button>
          )}
        </div>
      )}
    </div>
  );
}
