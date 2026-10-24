import BrowseFolderItemRow from "../BrowseFolderItemRow";
import BrowseIncludeControl from "./BrowseIncludeControl";
import DestPresenceBadge from "./DestPresenceBadge";
import type { DestDualRow } from "../../utils/destDualList";

type DestDualListRowsProps = {
  rows: DestDualRow[];
  /** When true, checks only mirror source presence (not editable). */
  readOnlyChecks?: boolean;
  sourceParentId?: string | null;
  isIncluded?: (parentId: string, childId: string) => boolean;
  onToggleInclude?: (
    parentId: string,
    childId: string,
    ancestorChain: string[]
  ) => void;
  sourceAncestorChain?: string[];
  onOpenFolder: (row: DestDualRow) => void;
};

/** Merged source+dest listing rows for destination relative dual-list browse. */
export default function DestDualListRows({
  rows,
  readOnlyChecks = true,
  sourceParentId = null,
  isIncluded,
  onToggleInclude,
  sourceAncestorChain = [],
  onOpenFolder,
}: DestDualListRowsProps) {
  // Review mode: only real dest entries; checks mirror same-name source presence.
  const visible = readOnlyChecks
    ? rows.filter((r) => r.presence !== "sourceOnly")
    : rows;

  if (visible.length === 0) {
    return <div className="path-review-list__empty">This folder is empty.</div>;
  }

  return (
    <>
      {visible.map((row) => {
        const srcId = row.src?.ServiceID || row.src?.Id || "";
        const existsOnSource = row.presence === "both";
        const canEdit =
          !readOnlyChecks &&
          Boolean(sourceParentId && srcId && row.presence !== "destOnly");
        const included = readOnlyChecks
          ? existsOnSource
          : canEdit && isIncluded
            ? isIncluded(sourceParentId!, srcId)
            : false;
        const canOpen = row.type === "folder" && Boolean(row.dst);
        const showCheck = readOnlyChecks
          ? true
          : canEdit || row.presence === "destOnly";

        return (
          <div
            key={`${row.presence}:${row.key}`}
            className={`browse-folder__item browse-folder__item--selectable${
              row.type === "file" ? " browse-folder__item--file" : ""
            }${
              showCheck && !included ? " browse-folder__item--unchecked" : ""
            }${
              row.presence === "sourceOnly" ? " browse-folder__item--source-only" : ""
            }`}
            onDoubleClick={() => {
              if (canOpen) onOpenFolder(row);
            }}
          >
            {showCheck ? (
              <BrowseIncludeControl
                included={included}
                readOnly={readOnlyChecks || !canEdit}
                onToggle={
                  canEdit && onToggleInclude
                    ? () =>
                        onToggleInclude(
                          sourceParentId!,
                          srcId,
                          sourceAncestorChain
                        )
                    : undefined
                }
              />
            ) : (
              <span className="browse-folder__include-spacer" aria-hidden />
            )}
            <BrowseFolderItemRow
              name={row.name}
              path={row.dst?.ServiceID || row.src?.ServiceID || row.name}
              type={row.type}
              showArrow={canOpen}
              lastUpdated={row.dst?.lastUpdated || row.src?.lastUpdated}
            />
            {!readOnlyChecks ? (
              <DestPresenceBadge presence={row.presence} />
            ) : null}
          </div>
        );
      })}
    </>
  );
}
