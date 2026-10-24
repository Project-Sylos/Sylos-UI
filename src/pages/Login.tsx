import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import logo from "../assets/logos/main-app-logo-transparent.png";
import { recoverPassword } from "../api/auth";
import { useAuth } from "../contexts/AuthContext";
import "../App.css";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);

  const from =
    (location.state as { from?: string } | null)?.from?.replace(/^\//, "") ?? "";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setRecoverySuccess(null);
    try {
      await login(username.trim(), password, remember);
      navigate(from ? `/${from}` : "/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoverySubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setRecoverySuccess(null);
    try {
      await recoverPassword({
        username: username.trim(),
        recoveryCode,
        newPassword,
      });
      setRecoverySuccess(
        "Password updated. Sign in with your new password to receive a new recovery code."
      );
      setRecoveryMode(false);
      setPassword("");
      setRecoveryCode("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password recovery failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="App-root">
      <div className="App-card">
        <img src={logo} alt="Sylos Logo" className="App-logo" />
        {recoveryMode ? (
          <form onSubmit={handleRecoverySubmit} className="auth-form">
            <h1 className="auth-form__heading">Reset password</h1>
            <p className="auth-form__hint">
              Use your one-time recovery code to set a new password. You will get a new code
              after you sign in.
            </p>
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
              Recovery code
              <input
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                autoComplete="off"
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            {error && <p className="auth-form__error">{error}</p>}
            {recoverySuccess && <p className="auth-form__success">{recoverySuccess}</p>}
            <button className="action-button action-button--pill action-button--primary" type="submit" disabled={submitting}>
              {submitting ? "Updating…" : "Update password"}
            </button>
            <button
              type="button"
              className="auth-form__link-button"
              onClick={() => {
                setRecoveryMode(false);
                setError(null);
              }}
            >
              Back to sign in
            </button>
          </form>
        ) : (
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
                autoComplete="current-password"
                required
              />
            </label>
            <label className="auth-form__checkbox">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember me
            </label>
            {error && <p className="auth-form__error">{error}</p>}
            {recoverySuccess && <p className="auth-form__success">{recoverySuccess}</p>}
            <button className="action-button action-button--pill action-button--primary" type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
            <button
              type="button"
              className="auth-form__link-button"
              onClick={() => {
                setRecoveryMode(true);
                setError(null);
                setRecoverySuccess(null);
              }}
            >
              Locked out? Reset with recovery code
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
