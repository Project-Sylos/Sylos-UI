import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { PaginationInfo } from "../types/services";
import "../pages/PathReview.css";

const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000];

interface ListViewPaginationProps {
  pagination: PaginationInfo;
  currentPage: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  zoomLevel?: number;
}

export default function ListViewPagination({
  pagination,
  currentPage,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  zoomLevel = 1,
}: ListViewPaginationProps) {
  const [showItemsPerPageDropdown, setShowItemsPerPageDropdown] = useState(false);
  const itemsPerPageDropdownRef = useRef<HTMLDivElement>(null);
  const totalPages = Math.max(1, Math.ceil(pagination.total / itemsPerPage));

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showItemsPerPageDropdown &&
        itemsPerPageDropdownRef.current &&
        !itemsPerPageDropdownRef.current.contains(event.target as Node)
      ) {
        setShowItemsPerPageDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showItemsPerPageDropdown]);

  return (
    <div className="path-review-list__page-nav">
      <div className="path-review-list__items-per-page-compact" ref={itemsPerPageDropdownRef}>
        <button
          type="button"
          className="path-review-list__items-per-page-button"
          onClick={() => setShowItemsPerPageDropdown((current) => !current)}
          title="Items per page"
          aria-label="Items per page"
        >
          {itemsPerPage}
          <ChevronDown size={14 * zoomLevel} />
        </button>
        {showItemsPerPageDropdown && (
          <div className="path-review-list__items-per-page-dropdown">
            {PAGE_SIZE_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                className={`path-review-list__items-per-page-option ${
                  itemsPerPage === value ? "path-review-list__items-per-page-option--selected" : ""
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
          </div>
        )}
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
        onClick={() => {
          if (totalPages > 0) {
            onPageChange(Math.min(totalPages - 1, currentPage + 1));
          } else {
            onPageChange(currentPage + 1);
          }
        }}
        disabled={totalPages > 0 ? currentPage >= totalPages - 1 : !pagination.hasMore}
        title="Next page"
        aria-label="Next page"
      >
        <ChevronRight size={18 * zoomLevel} />
      </button>
    </div>
  );
}
