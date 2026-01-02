import { useState, useRef, useEffect } from "react";
import "./PreSplash.css";
import { usePreferences } from "../contexts/PreferencesContext";
import splashVideo from "../assets/backgrounds/31809-splash-loading-video-by-Forsigo-on-Pixabay.mp4";

export default function PreSplash() {
  const { preferences } = usePreferences();
  const [phase, setPhase] = useState<"playing" | "fading-to-black" | "fading-out" | "dismissed">("playing");
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasStartedFade = useRef(false);

  useEffect(() => {
    // Don't set up video listener if pre-splash is disabled or already dismissed
    if (!preferences.preSplashEnabled || phase === "dismissed") {
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      // Start fade sequence 1 second before video ends
      if (!hasStartedFade.current && video.duration > 0 && video.currentTime >= video.duration - 1) {
        hasStartedFade.current = true;
        video.pause();
        
        // Phase 1: Fade to black overlay (500ms)
        setPhase("fading-to-black");
        
        setTimeout(() => {
          // Phase 2: Fade out entire screen over 2 seconds
          setPhase("fading-out");
          
          setTimeout(() => {
            // Phase 3: Remove from DOM
            setPhase("dismissed");
          }, 2000);
        }, 500);
      }
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    
    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
    };
  }, [preferences.preSplashEnabled, phase]);

  // Don't render if pre-splash is disabled or dismissed
  if (!preferences.preSplashEnabled || phase === "dismissed") {
    return null;
  }

  return (
    <div className={`pre-splash pre-splash--${phase}`}>
      <video
        ref={videoRef}
        className="pre-splash__video"
        src={splashVideo}
        autoPlay
        muted
        playsInline
      />
      {(phase === "fading-to-black" || phase === "fading-out") && (
        <div className="pre-splash__black-overlay" />
      )}
      <div className="pre-splash__credit">
        <a
          href="https://pixabay.com/users/forsigo-14301466/"
          target="_blank"
          rel="noopener noreferrer"
          className="pre-splash__credit-link"
        >
          <span className="pre-splash__credit-text">
            Background by <span className="pre-splash__credit-handle">@Forsigo</span>
          </span>
        </a>
      </div>
    </div>
  );
}
