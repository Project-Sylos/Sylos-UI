import { useEffect, useRef } from "react";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (
    type: "release",
    listener: () => void
  ) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

/**
 * Request a screen wake lock while `enabled` is true (Progress Monitor live runs).
 * Re-acquires when the tab becomes visible again; no-ops if unsupported or denied.
 */
export function useScreenWakeLock(enabled: boolean): void {
  const lockRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!enabled) {
      const lock = lockRef.current;
      lockRef.current = null;
      if (lock && !lock.released) {
        void lock.release().catch(() => {});
      }
      return;
    }

    let cancelled = false;
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock?.request) {
      return;
    }

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const existing = lockRef.current;
        if (existing && !existing.released) {
          return;
        }
        const lock = await nav.wakeLock!.request("screen");
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        lockRef.current = lock;
        lock.addEventListener("release", () => {
          if (lockRef.current === lock) {
            lockRef.current = null;
          }
        });
      } catch {
        // Unsupported, denied, or transient (e.g. low-power); ignore.
      }
    };

    void acquire();

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const lock = lockRef.current;
      lockRef.current = null;
      if (lock && !lock.released) {
        void lock.release().catch(() => {});
      }
    };
  }, [enabled]);
}
