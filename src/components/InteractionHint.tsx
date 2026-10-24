import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { usePreferences } from "../contexts/PreferencesContext";
import {
  claimInteractionHint,
  releaseInteractionHint,
} from "../utils/interactionHintAnchors";
import "./InteractionHint.css";

export type InteractionHintProps = {
  /** Stable id; also the tips.categories key when dismissed. */
  tipId: string;
  content: ReactNode;
  position?: "above" | "right" | "left" | "below";
  /** When false, never claim or show (e.g. locked / wrong status). */
  eligible?: boolean;
  children: ReactNode;
};

const VIEWPORT_MARGIN = 8;
const GAP = 10;
const ESTIMATED_WIDTH = 280;
const ESTIMATED_HEIGHT = 96;

function resolvePosition(
  anchor: DOMRect,
  bubbleW: number,
  bubbleH: number,
  preferred: NonNullable<InteractionHintProps["position"]>
): NonNullable<InteractionHintProps["position"]> {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let position = preferred;

  if (position === "above" && anchor.top - GAP - bubbleH < VIEWPORT_MARGIN) {
    position = "below";
  } else if (
    position === "below" &&
    anchor.bottom + GAP + bubbleH > vh - VIEWPORT_MARGIN
  ) {
    position = "above";
  } else if (
    position === "right" &&
    anchor.right + GAP + bubbleW > vw - VIEWPORT_MARGIN
  ) {
    position = "left";
  } else if (
    position === "left" &&
    anchor.left - GAP - bubbleW < VIEWPORT_MARGIN
  ) {
    position = "right";
  }
  return position;
}

function bubbleStyleFor(
  anchor: DOMRect,
  size: { width: number; height: number } | null,
  preferred: NonNullable<InteractionHintProps["position"]>
): CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bubbleW =
    size?.width && size.width > 0
      ? size.width
      : Math.min(ESTIMATED_WIDTH, vw - VIEWPORT_MARGIN * 2);
  const bubbleH =
    size?.height && size.height > 0 ? size.height : ESTIMATED_HEIGHT;
  const position = resolvePosition(anchor, bubbleW, bubbleH, preferred);

  let top = 0;
  let left = 0;
  switch (position) {
    case "below":
      top = anchor.bottom + GAP;
      left = anchor.left + anchor.width / 2 - bubbleW / 2;
      break;
    case "right":
      top = anchor.top + anchor.height / 2 - bubbleH / 2;
      left = anchor.right + GAP;
      break;
    case "left":
      top = anchor.top + anchor.height / 2 - bubbleH / 2;
      left = anchor.left - GAP - bubbleW;
      break;
    case "above":
    default:
      top = anchor.top - GAP - bubbleH;
      left = anchor.left + anchor.width / 2 - bubbleW / 2;
      break;
  }

  left = Math.min(
    Math.max(VIEWPORT_MARGIN, left),
    vw - VIEWPORT_MARGIN - bubbleW
  );
  top = Math.min(
    Math.max(VIEWPORT_MARGIN, top),
    vh - VIEWPORT_MARGIN - bubbleH
  );

  return { position: "fixed", zIndex: 100000, top, left };
}

/**
 * First-run coach mark on an interactive control. Only claims while the
 * anchor is in the viewport, so scrolled/paginated rows teach when they
 * appear. Dismiss via X or by clicking the control (win condition).
 */
export default function InteractionHint({
  tipId,
  content,
  position = "right",
  eligible = true,
  children,
}: InteractionHintProps) {
  const { preferences, updatePreferences } = usePreferences();
  const reactId = useId();
  const token = useMemo(() => Symbol(reactId), [reactId]);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});

  const tipsEnabled = preferences.tips?.enabled !== false;
  const tipOpen = preferences.tips?.categories?.[tipId] !== false;
  const canCompete = tipsEnabled && tipOpen && eligible && inView;
  const active = canCompete && claimed;

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setInView(Boolean(entry?.isIntersecting && entry.intersectionRatio > 0));
      },
      { root: null, threshold: 0.35, rootMargin: "0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!canCompete) {
      releaseInteractionHint(tipId, token);
      setClaimed(false);
      return;
    }
    setClaimed(claimInteractionHint(tipId, token));
    return () => {
      releaseInteractionHint(tipId, token);
    };
  }, [canCompete, tipId, token]);

  const dismiss = () => {
    const currentTips = preferences.tips || { enabled: true, categories: {} };
    void updatePreferences({
      tips: {
        ...currentTips,
        enabled: currentTips.enabled ?? true,
        categories: {
          ...(currentTips.categories || {}),
          [tipId]: false,
        },
      },
    });
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  const updatePosition = () => {
    if (!wrapRef.current) return;
    const measured = bubbleRef.current?.getBoundingClientRect() ?? null;
    setStyle(
      bubbleStyleFor(
        wrapRef.current.getBoundingClientRect(),
        measured ? { width: measured.width, height: measured.height } : null,
        position
      )
    );
  };

  useLayoutEffect(() => {
    if (!active) return;
    updatePosition();
    const frame = window.requestAnimationFrame(() => updatePosition());
    const onMove = () => updatePosition();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [active, position, content]);

  useEffect(() => {
    if (!active || !wrapRef.current) return;
    const node = wrapRef.current;
    const onPointerDown = () => {
      dismissRef.current();
    };
    node.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      node.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [active]);

  const bubble =
    active && Object.keys(style).length > 0
      ? createPortal(
          <div
            ref={bubbleRef}
            className="interaction-hint__bubble"
            style={style}
            role="dialog"
            aria-labelledby={`interaction-hint-${tipId}`}
          >
            <button
              type="button"
              className="interaction-hint__close"
              onClick={(e) => {
                e.stopPropagation();
                dismiss();
              }}
              aria-label="Dismiss hint"
            >
              <X size={14} />
            </button>
            <div
              className="interaction-hint__content"
              id={`interaction-hint-${tipId}`}
            >
              {content}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <span
      ref={wrapRef}
      className={`interaction-hint${active ? " interaction-hint--active" : ""}`}
    >
      {children}
      {bubble}
    </span>
  );
}
