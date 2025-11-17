import "./AnimatedBackground.css";
import bgVideo from "../assets/backgrounds/iStock-blue-magenta-rectangle-lines-background.mov";

export default function AnimatedBackground() {
  return (
    <div className="sylos-bg-container">
      <video
        className="sylos-bg-video"
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
