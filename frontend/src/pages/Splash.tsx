import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import "../App.css";
import AnimatedBackground from "../components/AnimatedBackground";
import logo from "../assets/logos/main-app-logo-transparent.png";
import { useSelection } from "../context/SelectionContext";

export default function Splash() {
  const navigate = useNavigate();
  const { clearSelections } = useSelection();

  useEffect(() => {
    clearSelections();
  }, [clearSelections]);

  return (
    <div className="App-root">
      <AnimatedBackground />

      <div className="App-card">
        <img src={logo} alt="Sylos Logo" className="App-logo" />
        <button className="App-button" onClick={() => navigate("/connect")}>
          Start Migration
        </button>
      </div>
    </div>
  );
}

