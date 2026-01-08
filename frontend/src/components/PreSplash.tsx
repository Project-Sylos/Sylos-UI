import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import "./PreSplash.css";
import { usePreferences } from "../contexts/PreferencesContext";
import splashVideo from "../assets/backgrounds/31809-splash-loading-video-by-Forsigo-on-Pixabay.mp4";

export default function PreSplash() {
  const { preferences } = usePreferences();
  const location = useLocation();
  const [phase, setPhase] = useState<"playing" | "fading-to-black" | "fading-out" | "dismissed">("playing");
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasStartedFade = useRef(false);
  const hasShownOnceRef = useRef(false);
  const initialPathnameRef = useRef<string | null>(null);

  // Track the initial pathname on mount
  useEffect(() => {
    if (initialPathnameRef.current === null) {
      initialPathnameRef.current = location.pathname;
    }
  }, [location.pathname]);

  // Check if we should show the splash screen
  // Only show if:
  // 1. We're on the root path ("/")
  // 2. The initial load was on "/" (not a deep link)
  // 3. We haven't shown it yet in this session
  const shouldShow = 
    location.pathname === "/" && 
    initialPathnameRef.current === "/" && 
    !hasShownOnceRef.current;

  // Track navigation away from "/" - mark as shown when we leave the root path
  useEffect(() => {
    if (location.pathname !== "/") {
      hasShownOnceRef.current = true;
      // Dismiss immediately if we navigate away from root
      if (phase !== "dismissed") {
        setPhase("dismissed");
      }
    } else if (location.pathname === "/" && phase === "dismissed") {
      // Mark as shown when splash completes on root path
      hasShownOnceRef.current = true;
    }
  }, [location.pathname, phase]);

  useEffect(() => {
    // Don't set up video listener if pre-splash is disabled, already dismissed, or shouldn't show
    if (!preferences.preSplashEnabled || phase === "dismissed" || !shouldShow) {
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
  }, [preferences.preSplashEnabled, phase, shouldShow]);

  // Don't render if pre-splash is disabled, dismissed, or we shouldn't show it
  if (!preferences.preSplashEnabled || phase === "dismissed" || !shouldShow) {
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
