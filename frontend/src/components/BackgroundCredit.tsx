import "./BackgroundCredit.css";
import { useTheme } from "../contexts/ThemeContext";

export default function BackgroundCredit() {
  const { theme } = useTheme();

  if (theme !== "neon-dark" && theme !== "neon-light") {
    return null;
  }

  const creditLink =
    theme === "neon-light"
      ? "https://www.istockphoto.com/portfolio/Black_Kira"
      : "https://pixabay.com/users/sharaed-10850801/";

  const creditHandle = theme === "neon-light" ? "@Black_Kira" : "@Sharaed";

  return (
    <div className="background-credit">
      <a
        href={creditLink}
        target="_blank"
        rel="noopener noreferrer"
        className="background-credit__link"
      >
        <span className="background-credit__text">
          Background by <span className="background-credit__handle">{creditHandle}</span>
        </span>
      </a>
    </div>
  );
}
