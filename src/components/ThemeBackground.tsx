import "./ThemeBackground.css";
import { useTheme } from "../contexts/ThemeContext";

/** Flat page background for obsidian / quartz. */
export default function ThemeBackground() {
  const { theme } = useTheme();
  return (
    <div
      className={`sylos-bg-container sylos-bg-container--${theme}`}
      aria-hidden="true"
    />
  );
}
