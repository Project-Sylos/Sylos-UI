import { useState } from "react";
import { useZoom, MIN_ZOOM, MAX_ZOOM } from "../contexts/ZoomContext";
import { ZoomIn, ZoomOut, Search } from "lucide-react";
import "./ZoomControl.css";

// Preset zoom levels similar to browser zoom
const ZOOM_PRESETS = [0.75, 0.9, 1.0, 1.1, 1.25, 1.5];

export default function ZoomControl() {
  const { zoomLevel, setZoomLevel } = useZoom();
  const [showPercent, setShowPercent] = useState(false);

  const findClosestPreset = (current: number, direction: "in" | "out"): number => {
    if (direction === "in") {
      const next = ZOOM_PRESETS.find(preset => preset > current);
      return next || MAX_ZOOM;
    } else {
      const prev = [...ZOOM_PRESETS].reverse().find(preset => preset < current);
      return prev || MIN_ZOOM;
    }
  };

  const handleZoomIn = () => {
    const newLevel = findClosestPreset(zoomLevel, "in");
    setZoomLevel(newLevel);
    showPercentage();
  };

  const handleZoomOut = () => {
    const newLevel = findClosestPreset(zoomLevel, "out");
    setZoomLevel(newLevel);
    showPercentage();
  };

  const showPercentage = () => {
    setShowPercent(true);
    setTimeout(() => setShowPercent(false), 1500);
  };

  const zoomPercent = Math.round(zoomLevel * 100);
  const canZoomIn = zoomLevel < MAX_ZOOM;
  const canZoomOut = zoomLevel > MIN_ZOOM;

  return (
    <div className="zoom-control">
      <button
        type="button"
        className="zoom-control__button zoom-control__button--out"
        onClick={handleZoomOut}
        disabled={!canZoomOut}
        aria-label="Zoom out"
      >
        <ZoomOut size={16} />
      </button>
      <div className="zoom-control__icon-container">
        <Search size={18} className="zoom-control__icon" />
        {showPercent && (
          <span className="zoom-control__percentage">{zoomPercent}%</span>
        )}
      </div>
      <button
        type="button"
        className="zoom-control__button zoom-control__button--in"
        onClick={handleZoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
      >
        <ZoomIn size={16} />
      </button>
    </div>
  );
}

