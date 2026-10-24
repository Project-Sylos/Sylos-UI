import "./ThemeBackground.css";
import { useTheme } from "../contexts/ThemeContext";

/** Soft wash + blurred orbs behind the app shell. */
export default function ThemeBackground() {
  const { theme } = useTheme();
  return (
    <div
      className={`sylos-bg-container sylos-bg-container--${theme}`}
      aria-hidden="true"
    />
  );
}
