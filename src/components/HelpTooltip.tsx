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

const VIEWPORT_MARGIN = 8;
const GAP = 8;
const ESTIMATED_WIDTH = 360;
const ESTIMATED_HEIGHT = 120;

function resolvePosition(
  iconRect: DOMRect,
  bubbleW: number,
  bubbleH: number,
  preferred: HelpTooltipProps["position"]
): NonNullable<HelpTooltipProps["position"]> {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let position = preferred ?? "above";

  if (position === "above" && iconRect.top - GAP - bubbleH < VIEWPORT_MARGIN) {
    position = "below";
  } else if (position === "below" && iconRect.bottom + GAP + bubbleH > vh - VIEWPORT_MARGIN) {
    position = "above";
  } else if (position === "right" && iconRect.right + GAP + bubbleW > vw - VIEWPORT_MARGIN) {
    position = "left";
  } else if (position === "left" && iconRect.left - GAP - bubbleW < VIEWPORT_MARGIN) {
    position = "right";
  }

  return position;
}

function getBubblePosition(
  iconRect: DOMRect,
  bubbleSize: { width: number; height: number } | null,
  preferred: HelpTooltipProps["position"]
): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bubbleW = bubbleSize?.width && bubbleSize.width > 0 ? bubbleSize.width : Math.min(ESTIMATED_WIDTH, vw - VIEWPORT_MARGIN * 2);
  const bubbleH = bubbleSize?.height && bubbleSize.height > 0 ? bubbleSize.height : ESTIMATED_HEIGHT;
  const position = resolvePosition(iconRect, bubbleW, bubbleH, preferred);

  let top = 0;
  let left = 0;

  switch (position) {
    case "below":
      top = iconRect.bottom + GAP;
      left = iconRect.left + iconRect.width / 2 - bubbleW / 2;
      break;
    case "right":
      top = iconRect.top + iconRect.height / 2 - bubbleH / 2;
      left = iconRect.right + GAP;
      break;
    case "left":
      top = iconRect.top + iconRect.height / 2 - bubbleH / 2;
      left = iconRect.left - GAP - bubbleW;
      break;
    case "above":
    default:
      top = iconRect.top - GAP - bubbleH;
      left = iconRect.left + iconRect.width / 2 - bubbleW / 2;
      break;
  }

  left = Math.min(Math.max(VIEWPORT_MARGIN, left), vw - VIEWPORT_MARGIN - bubbleW);
  top = Math.min(Math.max(VIEWPORT_MARGIN, top), vh - VIEWPORT_MARGIN - bubbleH);

  return {
    position: "fixed",
    zIndex: 100000,
    top,
    left,
    transform: "none",
  };
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
    const iconRect = iconRef.current.getBoundingClientRect();
    const measured = tooltipRef.current?.getBoundingClientRect() ?? null;
    setBubbleStyle(
      getBubblePosition(
        iconRect,
        measured ? { width: measured.width, height: measured.height } : null,
        position
      )
    );
  };

  useLayoutEffect(() => {
    if (!isOpen || !tipsEnabled || !categoryEnabled) {
      return;
    }

    updateBubblePosition();
    const frame = window.requestAnimationFrame(() => updateBubblePosition());

    const handleReposition = () => updateBubblePosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.cancelAnimationFrame(frame);
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
    const next = !isOpen;
    if (next && iconRef.current) {
      setBubbleStyle(
        getBubblePosition(iconRef.current.getBoundingClientRect(), null, position)
      );
    }
    setIsOpen(next);
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

  const bubble = isOpen && Object.keys(bubbleStyle).length > 0
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
