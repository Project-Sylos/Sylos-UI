/**
 * Momentum + rubber-band scrolling for the app's scroll panes.
 *
 * Technique (the common one):
 *  - Momentum: intercept `wheel`, drive scrollTop ourselves via rAF using linear
 *    interpolation (exponential decay), so scrolling glides to a stop instead of
 *    halting the instant the wheel stops. This is what Lenis does; we scope it to
 *    our overflow containers instead of the page root.
 *  - Rubber-band: when a boundary is hit and the user keeps pushing, translate the
 *    pane with a damped offset, then spring it back — like mobile/macOS overscroll
 *    (à la elastic-scroll-polyfill), which no library provides cross-platform.
 *
 * Honors prefers-reduced-motion by staying out of the way (native scroll).
 */

const MANAGED_ATTR = "data-momentum";
const SCROLL_SELECTOR = [
  ".scroll-region",
  ".settings__content",
  ".selection-page__scroll",
  ".path-review__list",
  ".browse-folder__list",
].join(", ");

/** Momentum glide: higher = snappier/less glide (0–1 per frame at 60fps). */
const LERP = 0.16;
/** Below this gap (px) we snap and stop the momentum loop. */
const SETTLE_EPSILON = 0.5;

/** Max rubber-band stretch in px. */
const MAX_OVERSCROLL = 140;
/** Fraction of wheel delta that feeds the stretch at rest. */
const OVERSCROLL_INTENSITY = 0.5;
/** Spring-back decay per frame (higher = snappier return). */
const OVERSCROLL_RETURN = 0.82;
/** Below this the stretch is considered settled. */
const OVERSCROLL_EPSILON = 0.3;

/** ms without a wheel event after which a scroll is treated as external. */
const EXTERNAL_SCROLL_GRACE = 120;

type Managed = {
  el: HTMLElement;
  target: number;
  current: number;
  overscroll: number;
  raf: number;
  lastWheelTs: number;
  onWheel: (e: WheelEvent) => void;
  onScroll: () => void;
};

const managed = new WeakMap<HTMLElement, Managed>();

function maxScrollTop(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function normalizeDelta(e: WheelEvent, el: HTMLElement): number {
  // deltaMode: 0 = pixels, 1 = lines, 2 = pages.
  if (e.deltaMode === 1) return e.deltaY * 16;
  if (e.deltaMode === 2) return e.deltaY * el.clientHeight;
  return e.deltaY;
}

function applyTransform(el: HTMLElement, overscroll: number) {
  // translateZ(0) keeps the pane on its own compositor layer (matches CSS).
  el.style.transform = `translate3d(0, ${overscroll.toFixed(2)}px, 0)`;
}

function step(state: Managed) {
  const { el } = state;
  const max = maxScrollTop(el);
  state.target = clamp(state.target, 0, max);

  // Momentum toward target.
  const gap = state.target - state.current;
  if (Math.abs(gap) > SETTLE_EPSILON) {
    state.current += gap * LERP;
    el.scrollTop = state.current;
  } else if (state.current !== state.target) {
    state.current = state.target;
    el.scrollTop = state.current;
  }

  // Rubber-band spring back toward 0.
  if (Math.abs(state.overscroll) > OVERSCROLL_EPSILON) {
    state.overscroll *= OVERSCROLL_RETURN;
    applyTransform(el, state.overscroll);
  } else if (state.overscroll !== 0) {
    state.overscroll = 0;
    applyTransform(el, 0);
  }

  const settled =
    Math.abs(state.target - state.current) <= SETTLE_EPSILON &&
    Math.abs(state.overscroll) <= OVERSCROLL_EPSILON;

  if (settled) {
    state.raf = 0;
    return;
  }
  state.raf = window.requestAnimationFrame(() => step(state));
}

function ensureRunning(state: Managed) {
  if (!state.raf) {
    state.raf = window.requestAnimationFrame(() => step(state));
  }
}

function bind(el: HTMLElement) {
  if (el.getAttribute(MANAGED_ATTR) === "1") return;
  el.setAttribute(MANAGED_ATTR, "1");

  const state: Managed = {
    el,
    target: el.scrollTop,
    current: el.scrollTop,
    overscroll: 0,
    raf: 0,
    lastWheelTs: 0,
    onWheel: () => {},
    onScroll: () => {},
  };

  state.onWheel = (e: WheelEvent) => {
    // Let horizontal/zoom gestures and nested scrollers behave natively.
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const targetEl = e.target;
    if (targetEl instanceof Element) {
      const nested = targetEl.closest(SCROLL_SELECTOR);
      if (nested instanceof HTMLElement && nested !== el && el.contains(nested)) {
        return;
      }
    }

    const max = maxScrollTop(el);
    if (max <= 0) return; // nothing to scroll; leave tiny panes alone.

    const delta = normalizeDelta(e, el);
    state.lastWheelTs = performance.now();

    const atTop = state.target <= 0;
    const atBottom = state.target >= max;
    const pushingPastTop = atTop && delta < 0;
    const pushingPastBottom = atBottom && delta > 0;

    if (pushingPastTop || pushingPastBottom) {
      // Feed the rubber-band with diminishing resistance as it stretches.
      const resistance =
        OVERSCROLL_INTENSITY * (1 - Math.min(Math.abs(state.overscroll) / MAX_OVERSCROLL, 1));
      state.overscroll = clamp(
        state.overscroll - delta * resistance,
        -MAX_OVERSCROLL,
        MAX_OVERSCROLL
      );
    } else {
      state.target = clamp(state.target + delta, 0, max);
    }

    e.preventDefault();
    ensureRunning(state);
  };

  state.onScroll = () => {
    // Keyboard, scrollbar drag, and programmatic scrollIntoView all fire scroll
    // without a preceding wheel. Yield to them and resync so we never fight.
    const sinceWheel = performance.now() - state.lastWheelTs;
    if (sinceWheel > EXTERNAL_SCROLL_GRACE && Math.abs(state.overscroll) <= OVERSCROLL_EPSILON) {
      if (state.raf) {
        window.cancelAnimationFrame(state.raf);
        state.raf = 0;
      }
      state.current = el.scrollTop;
      state.target = el.scrollTop;
    }
  };

  managed.set(el, state);
  el.addEventListener("wheel", state.onWheel, { passive: false });
  el.addEventListener("scroll", state.onScroll, { passive: true });
}

/**
 * Attach momentum + rubber-band scrolling to known scroll panes.
 * Idempotent; safe to call after every route change.
 */
export function enhanceMomentumScrolling(root: ParentNode = document): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.querySelectorAll<HTMLElement>(SCROLL_SELECTOR).forEach(bind);
}
