import "./AnimatedBackground.css";
import { useTheme } from "../contexts/ThemeContext";
import darkBgVideo from "../assets/backgrounds/cyan-magenta-lines-by-sharaed-on-pixabay.mp4";
import lightBgVideo from "../assets/backgrounds/iStock-blue-magenta-rectangle-lines-background.mov";

export default function AnimatedBackground() {
  const { theme } = useTheme();
  const bgVideo = theme === "light" ? lightBgVideo : darkBgVideo;

  return (
    <div className={`sylos-bg-container sylos-bg-container--${theme}`}>
      <video
        className={`sylos-bg-video sylos-bg-video--${theme}`}
        src={bgVideo}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
      />
    </div>
  );
}
