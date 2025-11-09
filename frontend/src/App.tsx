import "./App.css";
import logo from "./assets/logos/main-app-logo-transparent.png";
import AnimatedBackground from "./components/AnimatedBackground";

export default function App() {
  return (
    <div className="App-root">
      <AnimatedBackground />

      <div className="App-card">
        <img src={logo} alt="Sylos Logo" className="App-logo" />
        <button className="App-button">Start Migration</button>
      </div>
    </div>
  );
}
