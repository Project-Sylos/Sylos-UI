import "./AnimatedBackground.css";
import { useTheme } from "../contexts/ThemeContext";
import darkBgVideo from "../assets/backgrounds/cyan-magenta-lines-by-sharaed-on-pixabay.mp4";
import lightBgVideo from "../assets/backgrounds/iStock-blue-magenta-rectangle-lines-background.mov";

export default function AnimatedBackground() {
  const { theme } = useTheme();
  const isNeon = theme === "neon-dark" || theme === "neon-light";
  const bgVideo = theme === "neon-light" ? lightBgVideo : darkBgVideo;

  const containerClass = [
    "sylos-bg-container",
    `sylos-bg-container--${theme}`,
  ].join(" ");

  return (
    <div className={containerClass}>
      {isNeon && (
        <video
          className={`sylos-bg-video sylos-bg-video--${theme}`}
          src={bgVideo}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
        />
      )}
    </div>
  );
}
