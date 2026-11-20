import { ReactNode } from "react";

import HelpTooltip from "./HelpTooltip";
import ListViewPagination from "./ListViewPagination";
import { useBrowseDensity } from "../contexts/BrowseDensityContext";
import { PaginationInfo } from "../types/services";
import "../pages/PathReview.css";

/** @deprecated Prefer tipId "browse-folder-selection" from the tips registry. */
export const BROWSE_SELECTION_HELP = {
  tipId: "browse-folder-selection",
} as const;

/** @deprecated Prefer tipId "path-review-selection" from the tips registry. */
export const PATH_REVIEW_SELECTION_HELP = {
  tipId: "path-review-selection",
} as const;

interface FileBrowserPaneProps {
  pagination?: PaginationInfo | null;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  toolbarLeft?: ReactNode;
  /** tipId for Selection help; category/content come from the tips registry. */
  helpTooltip?: {
    tipId: string;
  };
  listClassName?: string;
  children: ReactNode;
}

export default function FileBrowserPane({
  pagination,
  currentPage,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  toolbarLeft,
  helpTooltip,
  listClassName = "",
  children,
}: FileBrowserPaneProps) {
  const { densityStyle, setListViewportElement } = useBrowseDensity();
  const showPagination = pagination != null && (pagination.total ?? 0) > 0;
  const showHelp = helpTooltip != null;
  const showToolbarRow = Boolean(toolbarLeft || showHelp || showPagination);

  return (
    <div
      className="path-review-list browse-folder__browser"
      style={densityStyle}
    >
      {showToolbarRow && (
        <div className="path-review-list__legend-wrapper browse-folder__toolbar-row">
          <div className="browse-folder__toolbar-start">
            {toolbarLeft}
            {showHelp && (
              <div className="path-review__legend path-review__legend--compact path-review__legend--inline">
                <div className="path-review__legend-item">
                  <span className="path-review__legend-label">Selection</span>
                  <HelpTooltip tipId={helpTooltip.tipId} position="above" />
                </div>
              </div>
            )}
          </div>
          {showPagination && (
            <ListViewPagination
              pagination={pagination}
              currentPage={currentPage}
              itemsPerPage={itemsPerPage}
              onPageChange={onPageChange}
              onItemsPerPageChange={onItemsPerPageChange}
              zoomLevel={1}
            />
          )}
        </div>
      )}

      <div className="path-review-list__items-container">
        <div
          ref={setListViewportElement}
          className={`path-review-list__items browse-folder__items${
            listClassName ? ` ${listClassName}` : ""
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
