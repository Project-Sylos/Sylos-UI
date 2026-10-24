import logoObsidian from "../assets/logos/sylos-wordmark-obsidian.png";
import logoQuartz from "../assets/logos/sylos-wordmark-quartz.png";
import { useTheme } from "../contexts/ThemeContext";

type SylosLogoProps = {
  className?: string;
  alt?: string;
};

/** Theme-matched wordmark (Quartz vs Obsidian palette variants). */
export default function SylosLogo({
  className = "",
  alt = "Sylos",
}: SylosLogoProps) {
  const { theme } = useTheme();
  const src = theme === "quartz" ? logoQuartz : logoObsidian;
  return <img src={src} alt={alt} className={className} />;
}
