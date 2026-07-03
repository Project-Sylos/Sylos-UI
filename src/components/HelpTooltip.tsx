import { useState, useRef, useEffect, ReactNode } from "react";
import { HelpCircle, X } from "lucide-react";
import { usePreferences } from "../contexts/PreferencesContext";
import "./HelpTooltip.css";

export interface HelpTooltipProps {
  tipId: string;
  category: string;
  content: ReactNode;
  position?: "above" | "right" | "left" | "below";
}

export default function HelpTooltip({
  tipId,
  category,
  content,
  position = "above",
}: HelpTooltipProps) {
  const { preferences, updatePreferences } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);

  // Check if tips are enabled and category is enabled
  const tipsEnabled = preferences.tips?.enabled !== false;
  const categoryEnabled = preferences.tips?.categories?.[category] !== false;

  // Handle click outside to close
  // Note: All hooks must be called before any conditional returns
  useEffect(() => {
    if (!isOpen || !tipsEnabled || !categoryEnabled) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        tooltipRef.current &&
        iconRef.current &&
        !tooltipRef.current.contains(event.target as Node) &&
        !iconRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, tipsEnabled, categoryEnabled]);

  // Don't render if tips are disabled or category is disabled
  if (!tipsEnabled || !categoryEnabled) {
    return null;
  }

  const handleIconClick = () => {
    setIsOpen(!isOpen);
  };

  const handleDismiss = () => {
    // Update preferences to disable this category
    const currentTips = preferences.tips || { enabled: true, categories: {} };
    const currentCategories = currentTips.categories || {};
    updatePreferences({
      tips: {
        ...currentTips,
        enabled: currentTips.enabled ?? true,
        categories: {
          ...currentCategories,
          [category]: false,
        },
      },
    });
    setIsOpen(false);
  };

  return (
    <div className="help-tooltip">
      <button
        ref={iconRef}
        className="help-tooltip__icon"
        onClick={handleIconClick}
        aria-label="Show help"
        type="button"
      >
        <HelpCircle size={16} />
      </button>
      {isOpen && (
        <div
          ref={tooltipRef}
          className={`help-tooltip__bubble help-tooltip__bubble--${position}`}
        >
          <button
            className="help-tooltip__close"
            onClick={handleDismiss}
            aria-label="Dismiss tip"
            type="button"
          >
            <X size={14} />
          </button>
          <div className="help-tooltip__content">{content}</div>
        </div>
      )}
    </div>
  );
}
