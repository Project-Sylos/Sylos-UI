import { useRef, useEffect } from "react";

const ANGLE = Math.PI / 4; // 45° (bottom-left to top-right)
const DIR_X = Math.cos(ANGLE);
const DIR_Y = -Math.sin(ANGLE);
const PERP_X = -DIR_Y;
const PERP_Y = DIR_X;

// Make the lines spawn more frequently and move faster for a smoother effect.
// Track spacing smaller = more tracks. GAP smaller = more lines per track. SPEED increased for faster movement.
const TRACK_SPACING = 48;
const GAP = 16;
const LENGTH = 140;
const SPEED = 160;
const FIXED_TIME_STEP = 1000 / 120; // ~8.3ms per physics tick
const MAX_FRAME_DELTA = 48;
const MARGIN = 260;

const PURE_CYAN = "#00ffff";
const PURE_MAGENTA = "#ff00ff";

const COLOR_CYCLE = [PURE_CYAN, PURE_MAGENTA, PURE_CYAN, PURE_MAGENTA];

type Segment = {
  start: number;
  length: number;
  color: string;
};

type Track = {
  offset: number;
  segments: Segment[];
  nextColor: () => string;
};

function makeColorCycler() {
  let colorIndex = 0;
  return () => {
    const color = COLOR_CYCLE[colorIndex];
    colorIndex = (colorIndex + 1) % COLOR_CYCLE.length;
    return color;
  };
}

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let animationFrameId: number;
    let tracks: Track[] = [];
    let diagDistance = 0;
    let centerX = 0;
    let centerY = 0;

    const rebuildTracks = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      canvas.width = width;
      canvas.height = height;

      centerX = width / 2;
      centerY = height / 2;
      diagDistance = Math.sqrt(
        (width + MARGIN * 2) * (width + MARGIN * 2) +
          (height + MARGIN * 2) * (height + MARGIN * 2)
      );

      const trackCount =
        Math.ceil((width + height + MARGIN * 2) / TRACK_SPACING) + 6;
      const offsets = Array.from({ length: trackCount }, (_, i) =>
        (i - (trackCount - 1) / 2) * TRACK_SPACING
      );

      // Each track gets its own cycler so segment colors stay in same order after segment cycling
      tracks = offsets.map((offset) => {
        const segments: Segment[] = [];
        let cursor = -diagDistance / 2 - LENGTH;
        const nextColor = makeColorCycler();

        while (cursor < diagDistance / 2 + LENGTH) {
          const length = LENGTH;
          segments.push({
            start: cursor,
            length,
            color: nextColor(),
          });
          cursor += length + GAP;
        }

        return { offset, segments, nextColor };
      });
    };

    const pointAt = (distance: number, offset: number) => ({
      x: centerX + DIR_X * distance + PERP_X * offset,
      y: centerY + DIR_Y * distance + PERP_Y * offset,
    });

    const updateTracks = (delta: number) => {
      const maxDistance = diagDistance / 2 + LENGTH + MARGIN;

      for (const track of tracks) {
        let minStart = Infinity;
        const pickColor = track.nextColor;

        for (const segment of track.segments) {
          segment.start += (SPEED * delta) / 1000;
          if (segment.start < minStart) {
            minStart = segment.start;
          }
        }

        for (const segment of track.segments) {
          if (segment.start - segment.length > maxDistance) {
            segment.length = LENGTH;
            segment.color = pickColor();
            segment.start = minStart - GAP - segment.length;
            minStart = segment.start;
          }
        }
      }
    };

    const drawTracks = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = "round";
      ctx.lineWidth = 2;

      for (const track of tracks) {
        for (const segment of track.segments) {
          const startPoint = pointAt(segment.start, track.offset);
          const endPoint = pointAt(segment.start + segment.length, track.offset);

          ctx.strokeStyle = segment.color;
          ctx.shadowColor = segment.color;
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = segment.color === "#00ffff" ? 1 : -1;
          ctx.shadowOffsetY = segment.color === "#00ffff" ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(startPoint.x, startPoint.y);
          ctx.lineTo(endPoint.x, endPoint.y);
          ctx.stroke();
        }
      }
    };

    let lastTime = performance.now();
    let accumulator = 0;

    const render = () => {
      const now = performance.now();
      let frameDelta = now - lastTime;
      lastTime = now;
      frameDelta = Math.min(frameDelta, MAX_FRAME_DELTA);
      accumulator += frameDelta;

      while (accumulator >= FIXED_TIME_STEP) {
        updateTracks(FIXED_TIME_STEP);
        accumulator -= FIXED_TIME_STEP;
      }

      drawTracks();

      animationFrameId = requestAnimationFrame(render);
    };

    rebuildTracks();
    render();

    const handleResize = () => {
      rebuildTracks();
      lastTime = performance.now();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="App-backgroundCanvas"
      style={{ zIndex: 1 }}
    />
  );
}
