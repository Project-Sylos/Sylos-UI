import "./BackgroundCredit.css";

export default function BackgroundCredit() {
  return (
    <div className="background-credit">
      <a
        href="https://www.istockphoto.com/portfolio/Black_Kira"
        target="_blank"
        rel="noopener noreferrer"
        className="background-credit__link"
      >
        <span className="background-credit__text">
          Background by <span className="background-credit__handle">@Black_Kira</span>
        </span>
      </a>
    </div>
  );
}

