import { Calculator, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { PaginationInfo } from "../types/services";
import { canGoToNextPage } from "../utils/listSearch";
import "../pages/PathReview.css";

const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000];

interface ListViewPaginationProps {
  pagination: PaginationInfo;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  zoomLevel?: number;
  onCalculateTotal?: () => void;
  calculatingTotal?: boolean;
  calculatedTotal?: number | null;
}

export default function ListViewPagination({
  pagination,
  currentPage,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  zoomLevel = 1,
  onCalculateTotal,
  calculatingTotal = false,
  calculatedTotal = null,
}: ListViewPaginationProps) {
  const [showItemsPerPageDropdown, setShowItemsPerPageDropdown] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const itemsPerPageDropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const nextEnabled = canGoToNextPage(
    {
      offset: pagination.offset,
      limit: pagination.limit,
      total: pagination.total,
      hasMore: pagination.hasMore,
    },
    currentPage,
    itemsPerPage
  );

  useLayoutEffect(() => {
    if (!showItemsPerPageDropdown || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left: rect.left,
      zIndex: 100050,
    });
  }, [showItemsPerPageDropdown]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showItemsPerPageDropdown &&
        itemsPerPageDropdownRef.current &&
        !itemsPerPageDropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowItemsPerPageDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showItemsPerPageDropdown]);

  const dropdown =
    showItemsPerPageDropdown && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={itemsPerPageDropdownRef}
            className="path-review-list__items-per-page-dropdown path-review-list__items-per-page-dropdown--portal"
            style={dropdownStyle}
          >
            {PAGE_SIZE_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className={`path-review-list__items-per-page-option ${
                  itemsPerPage === value
                    ? "path-review-list__items-per-page-option--selected"
                    : ""
                }`}
                onClick={() => {
                  onItemsPerPageChange(value);
                  onPageChange(0);
                  setShowItemsPerPageDropdown(false);
                }}
              >
                {value}
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="path-review-list__page-nav">
      {onCalculateTotal ? (
        <button
          type="button"
          className="path-review-list__calc-button"
          onClick={onCalculateTotal}
          disabled={calculatingTotal}
          title={
            calculatingTotal
              ? "Counting total matches…"
              : calculatedTotal != null
                ? `Recalculate total matches (${calculatedTotal.toLocaleString()})`
                : "Calculate total matches"
          }
          aria-label={
            calculatingTotal
              ? "Counting total matches"
              : "Calculate total matches"
          }
        >
          <Calculator size={16 * zoomLevel} />
        </button>
      ) : null}
      <div className="path-review-list__items-per-page-compact">
        <button
          ref={buttonRef}
          type="button"
          className="path-review-list__items-per-page-button"
          onClick={() => setShowItemsPerPageDropdown((current) => !current)}
          title="Items per page"
          aria-label="Items per page"
          aria-expanded={showItemsPerPageDropdown}
        >
          {itemsPerPage}
          <ChevronDown size={14 * zoomLevel} />
        </button>
        {dropdown}
      </div>
      <button
        type="button"
        className="path-review-list__page-nav-button"
        onClick={() => onPageChange(Math.max(0, currentPage - 1))}
        disabled={currentPage === 0}
        title="Previous page"
        aria-label="Previous page"
      >
        <ChevronLeft size={18 * zoomLevel} />
      </button>
      <button
        type="button"
        className="path-review-list__page-nav-button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={!nextEnabled}
        title="Next page"
        aria-label="Next page"
      >
        <ChevronRight size={18 * zoomLevel} />
      </button>
    </div>
  );
}
