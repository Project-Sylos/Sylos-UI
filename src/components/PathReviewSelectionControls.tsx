import { ChevronDown } from "lucide-react";
import type { RefObject } from "react";

export type PathReviewSelectionAction = {
  key: string;
  label: string;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
};

type PathReviewSelectionControlsProps = {
  selectedLabel: string;
  loading: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
  actions: PathReviewSelectionAction[];
  onClear: () => void;
};

export default function PathReviewSelectionControls({
  selectedLabel,
  loading,
  menuOpen,
  onToggleMenu,
  menuRef,
  actions,
  onClear,
}: PathReviewSelectionControlsProps) {
  return (
    <div className="path-review-list__bulk-actions path-review-list__bulk-actions--inline">
      <span className="path-review-list__bulk-count">{selectedLabel}</span>
      <div className="path-review-list__bulk-buttons">
        <div className="path-review-list__apply-action" ref={menuRef}>
          <button
            type="button"
            className="action-button action-button--small"
            disabled={loading}
            onClick={onToggleMenu}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            {loading ? "Working…" : "Apply action"}
            <ChevronDown size={14} style={{ marginLeft: "0.35rem" }} />
          </button>
          {menuOpen ? (
            <div className="path-review-list__apply-action-menu" role="menu">
              {actions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  className="path-review-list__apply-action-option"
                  role="menuitem"
                  disabled={loading || action.disabled}
                  title={action.title}
                  onClick={action.onClick}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="path-review-list__clear-selection"
          onClick={onClear}
        >
          Clear Selection
        </button>
      </div>
    </div>
  );
}
