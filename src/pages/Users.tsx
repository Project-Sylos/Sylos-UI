import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { SylosUser, UserRole, createUser, deleteUser, listUsers, updateUser } from "../api/auth";
import PageBackButton from "../components/PageBackButton";
import { useAuth } from "../contexts/AuthContext";
import "../App.css";

export default function Users() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<SylosUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");

  useEffect(() => {
    if (currentUser?.role !== "admin") {
      navigate("/settings", { replace: true });
    }
  }, [currentUser, navigate]);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await createUser({ username: username.trim(), password, role });
      setUsername("");
      setPassword("");
      setRole("user");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    }
  };

  const handleToggleDisabled = async (user: SylosUser) => {
    setError(null);
    try {
      await updateUser(user.id, { disabled: !user.disabled });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.");
    }
  };

  const handleDelete = async (user: SylosUser) => {
    if (!window.confirm(`Delete user "${user.username}"?`)) return;
    setError(null);
    try {
      await deleteUser(user.id);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
    }
  };

  return (
    <section className="browse-folder">
      <div className="browse-folder__content glass-surface--panel">
        <PageBackButton to="/settings" label="Back to settings" />
        <h1 className="browse-folder__title">Users</h1>
        {error && <p className="browse-folder__error">{error}</p>}

        <form onSubmit={handleCreate} className="auth-form auth-form--inline">
          <h2>Create user</h2>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button type="submit" className="glass-button">
            Add user
          </button>
        </form>

        <h2>Existing users</h2>
        {loading ? (
          <p>Loading users…</p>
        ) : (
          <ul className="users-list">
            {users.map((user) => (
              <li key={user.id} className="users-list__item">
                <span>
                  {user.username} ({user.role})
                  {user.disabled ? " — disabled" : ""}
                </span>
                <span className="users-list__actions">
                  <button
                    type="button"
                    className="glass-button"
                    onClick={() => void handleToggleDisabled(user)}
                  >
                    {user.disabled ? "Enable" : "Disable"}
                  </button>
                  <button
                    type="button"
                    className="glass-button"
                    onClick={() => void handleDelete(user)}
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
