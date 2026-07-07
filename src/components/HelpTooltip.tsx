import { useState, useRef, useEffect, useLayoutEffect, ReactNode, CSSProperties } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";
import { usePreferences } from "../contexts/PreferencesContext";
import "./HelpTooltip.css";

export interface HelpTooltipProps {
  tipId: string;
  category: string;
  content: ReactNode;
  position?: "above" | "right" | "left" | "below";
}

function getBubblePosition(rect: DOMRect, position: HelpTooltipProps["position"]): CSSProperties {
  const gap = 8;
  const base: CSSProperties = {
    position: "fixed",
    zIndex: 100000,
  };

  switch (position) {
    case "below":
      return {
        ...base,
        top: rect.bottom + gap,
        left: rect.left + rect.width / 2,
        transform: "translate(-50%, 0)",
      };
    case "right":
      return {
        ...base,
        top: rect.top + rect.height / 2,
        left: rect.right + gap,
        transform: "translate(0, -50%)",
      };
    case "left":
      return {
        ...base,
        top: rect.top + rect.height / 2,
        left: rect.left - gap,
        transform: "translate(-100%, -50%)",
      };
    case "above":
    default:
      return {
        ...base,
        top: rect.top - gap,
        left: rect.left + rect.width / 2,
        transform: "translate(-50%, -100%)",
      };
  }
}

export default function HelpTooltip({
  tipId,
  category,
  content,
  position = "above",
}: HelpTooltipProps) {
  const { preferences, updatePreferences } = usePreferences();
  const [isOpen, setIsOpen] = useState(false);
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties>({});
  const tooltipRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLButtonElement>(null);

  const tipsEnabled = preferences.tips?.enabled !== false;
  const categoryEnabled = preferences.tips?.categories?.[category] !== false;

  const updateBubblePosition = () => {
    if (!iconRef.current) {
      return;
    }
    setBubbleStyle(getBubblePosition(iconRef.current.getBoundingClientRect(), position));
  };

  useLayoutEffect(() => {
    if (!isOpen || !tipsEnabled || !categoryEnabled) {
      return;
    }

    updateBubblePosition();

    const handleReposition = () => updateBubblePosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isOpen, position, tipsEnabled, categoryEnabled]);

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

  if (!tipsEnabled || !categoryEnabled) {
    return null;
  }

  const handleIconClick = () => {
    setIsOpen((current) => !current);
  };

  const handleDismiss = () => {
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

  const bubble = isOpen
    ? createPortal(
        <div
          ref={tooltipRef}
          className="help-tooltip__bubble help-tooltip__bubble--portaled"
          style={bubbleStyle}
          role="dialog"
          aria-labelledby={`help-tooltip-${tipId}`}
        >
          <button
            className="help-tooltip__close"
            onClick={handleDismiss}
            aria-label="Dismiss tip"
            type="button"
          >
            <X size={14} />
          </button>
          <div className="help-tooltip__content" id={`help-tooltip-${tipId}`}>
            {content}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <div className="help-tooltip">
      <button
        ref={iconRef}
        className="help-tooltip__icon"
        onClick={handleIconClick}
        aria-label="Show help"
        aria-expanded={isOpen}
        type="button"
      >
        <HelpCircle size={16} />
      </button>
      {bubble}
    </div>
  );
}
