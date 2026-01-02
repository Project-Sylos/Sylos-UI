import "./BackgroundCredit.css";
import { useTheme } from "../contexts/ThemeContext";

export default function BackgroundCredit() {
  const { theme } = useTheme();
  
  // Dark mode: Sharaed from Pixabay
  // Light mode: Black_Kira from iStock
  const creditLink = theme === "light" 
    ? "https://www.istockphoto.com/portfolio/Black_Kira"
    : "https://pixabay.com/users/sharaed-10850801/";
  
  const creditHandle = theme === "light" ? "@Black_Kira" : "@Sharaed";

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

