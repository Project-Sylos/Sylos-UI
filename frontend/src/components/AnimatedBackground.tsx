import { useRef, useEffect } from "react";

const ANGLE = Math.PI / 4; // 45° (bottom-left to top-right)
const DIR_X = Math.cos(ANGLE);
const DIR_Y = -Math.sin(ANGLE);
const PERP_X = -DIR_Y;
const PERP_Y = DIR_X;

const TRACK_SPACING = 80;
const GAP = 24;
const MIN_LENGTH = 70;
const MAX_LENGTH = 160;
const SPEED_MIN = 160;
const SPEED_MAX = 260;
const MARGIN = 260;

const COLORS = [
  "rgba(34, 211, 238, 0.42)",
  "rgba(167, 139, 250, 0.38)",
  "rgba(96, 165, 250, 0.36)",
  "rgba(251, 191, 36, 0.3)",
];

type Segment = {
  start: number;
  length: number;
  speed: number;
  color: string;
};

type Track = {
  offset: number;
  segments: Segment[];
};

function randomLength() {
  return MIN_LENGTH + Math.random() * (MAX_LENGTH - MIN_LENGTH);
}

function randomSpeed() {
  return SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
}

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
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

      tracks = offsets.map((offset) => {
        const segments: Segment[] = [];
        let cursor = -diagDistance / 2 - randomLength();

        while (cursor < diagDistance / 2 + MAX_LENGTH) {
          const length = randomLength();
          segments.push({
            start: cursor,
            length,
            speed: randomSpeed(),
            color: randomColor(),
          });
          cursor += length + GAP;
        }

        return { offset, segments };
      });
    };

    const pointAt = (distance: number, offset: number) => ({
      x: centerX + DIR_X * distance + PERP_X * offset,
      y: centerY + DIR_Y * distance + PERP_Y * offset,
    });

    const updateTracks = (delta: number) => {
      const maxDistance = diagDistance / 2 + MAX_LENGTH + MARGIN;

      for (const track of tracks) {
        let minStart = Infinity;

        for (const segment of track.segments) {
          segment.start += (segment.speed * delta) / 1000;
          if (segment.start < minStart) {
            minStart = segment.start;
          }
        }

        for (const segment of track.segments) {
          if (segment.start - segment.length > maxDistance) {
            segment.length = randomLength();
            segment.speed = randomSpeed();
            segment.color = randomColor();
            segment.start = minStart - GAP - segment.length;
            minStart = segment.start;
          }
        }
      }
    };

    const drawTracks = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineCap = "round";
      ctx.lineWidth = 2.6;

      for (const track of tracks) {
        for (const segment of track.segments) {
          const startPoint = pointAt(segment.start, track.offset);
          const endPoint = pointAt(segment.start + segment.length, track.offset);

          ctx.strokeStyle = segment.color;
          ctx.shadowColor = segment.color;
          ctx.shadowBlur = 24;

          ctx.beginPath();
          ctx.moveTo(startPoint.x, startPoint.y);
          ctx.lineTo(endPoint.x, endPoint.y);
          ctx.stroke();
        }
      }
    };

    let lastTime = performance.now();

    const render = () => {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;

      updateTracks(delta);
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
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 1 }}
    />
  );
}
