import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ALargeSmall } from "lucide-react";

import InteractionHint from "./InteractionHint";
import { useListDensity } from "../contexts/ListDensityContext";
import {
  LIST_DENSITY_MAX,
  LIST_DENSITY_MIN,
  LIST_ROWS_MAX,
  LIST_ROWS_MIN,
} from "../utils/listDensity";
import "./ListDensityControl.css";

const DENSITY_HINT_TIP_ID = "list-density-control";

export default function ListDensityControl() {
  const { density, setDensity } = useListDensity();
  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const updatePopoverPosition = () => {
    if (!buttonRef.current) {
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    setPopoverStyle({
      position: "fixed",
      top: rect.top - 8,
      left: rect.left + rect.width / 2,
      transform: "translate(-50%, -100%)",
      zIndex: 100000,
    });
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }
    updatePopoverPosition();
    const handleReposition = () => updatePopoverPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        buttonRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const popover = isOpen && Object.keys(popoverStyle).length > 0
    ? createPortal(
        <div
          ref={popoverRef}
          className="list-density-control__popover"
          style={popoverStyle}
          role="dialog"
          aria-label="Row size"
        >
          <div className="list-density-control__header">
            <span className="list-density-control__title">Row size</span>
          </div>
          <div className="list-density-control__labels">
            <span>{LIST_ROWS_MAX} rows</span>
            <span>{LIST_ROWS_MIN} rows</span>
          </div>
          <input
            type="range"
            className="list-density-control__slider"
            min={LIST_DENSITY_MIN}
            max={LIST_DENSITY_MAX}
            value={density}
            onChange={(event) => setDensity(Number(event.target.value))}
            aria-label="Adjust how many items are visible in the list"
          />
        </div>,
        document.body
      )
    : null;

  return (
    <div className="list-density-control">
      <InteractionHint
        tipId={DENSITY_HINT_TIP_ID}
        position="above"
        content={
          <p>
            Make list rows bigger or smaller. Your choice is saved for next time.
          </p>
        }
      >
        <button
          ref={buttonRef}
          type="button"
          className="list-density-control__button"
          onClick={() => {
            const next = !isOpen;
            if (next && buttonRef.current) {
              const rect = buttonRef.current.getBoundingClientRect();
              setPopoverStyle({
                position: "fixed",
                top: rect.top - 8,
                left: rect.left + rect.width / 2,
                transform: "translate(-50%, -100%)",
                zIndex: 100000,
              });
            }
            setIsOpen(next);
          }}
          aria-label="Adjust row size"
          aria-expanded={isOpen}
          title="Row size"
        >
          <ALargeSmall size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </InteractionHint>
      {popover}
    </div>
  );
}
