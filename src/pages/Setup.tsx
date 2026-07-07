import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import logo from "../assets/logos/main-app-logo-transparent.png";
import { useAuth } from "../contexts/AuthContext";
import "../App.css";

export default function Setup() {
  const navigate = useNavigate();
  const { setup } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setup(username.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="App-root">
      <div className="App-card">
        <img src={logo} alt="Sylos Logo" className="App-logo" />
        <h1>Create admin account</h1>
        <p>Set up the first administrator for this Sylos server.</p>
        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          {error && <p className="auth-form__error">{error}</p>}
          <button className="glass-button glass-button--pill" type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Create admin"}
          </button>
        </form>
      </div>
    </div>
  );
}
