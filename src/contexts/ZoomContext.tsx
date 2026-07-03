import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface ZoomContextType {
  zoomLevel: number;
  setZoomLevel: (level: number) => void;
}

const ZoomContext = createContext<ZoomContextType | undefined>(undefined);

const ZOOM_STORAGE_KEY = "sylos_ui_zoom_level";
const DEFAULT_ZOOM = 1.0;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.05;

export function ZoomProvider({ children }: { children: ReactNode }) {
  const [zoomLevel, setZoomLevelState] = useState<number>(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= MIN_ZOOM && parsed <= MAX_ZOOM) {
        return parsed;
      }
    }
    return DEFAULT_ZOOM;
  });

  const setZoomLevel = (level: number) => {
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, level));
    setZoomLevelState(clamped);
    localStorage.setItem(ZOOM_STORAGE_KEY, clamped.toString());
  };

  return (
    <ZoomContext.Provider value={{ zoomLevel, setZoomLevel }}>
      {children}
    </ZoomContext.Provider>
  );
}

export function useZoom() {
  const context = useContext(ZoomContext);
  if (context === undefined) {
    throw new Error("useZoom must be used within a ZoomProvider");
  }
  return context;
}

export { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP };

