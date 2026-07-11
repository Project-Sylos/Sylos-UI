import { FormEvent, useEffect, useMemo, useState } from "react";
import { Ban, Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import {
  SylosUser,
  UserRole,
  changePassword,
  createUser,
  deleteUser,
  deleteUsers,
  listUsers,
  updateUser,
} from "../api/auth";
import { useRecoveryCode } from "../contexts/RecoveryCodeContext";
import {
  canChangeAdminRole,
  canDisableUser,
  canModerateUser,
  canSelectUserForBulkDelete,
} from "../utils/userModeration";
import "./SettingsUsersSection.css";
import "./ConfirmDialog.css";

type SettingsUsersSectionProps = {
  currentUser: SylosUser;
  isAdmin: boolean;
  sectionId?: string;
};

type EditTarget = SylosUser | null;

function formatUserTimestamp(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

export default function SettingsUsersSection({
  currentUser,
  isAdmin,
  sectionId,
}: SettingsUsersSectionProps) {
  const { needsAttention, resolveRecoveryAttention, showHandoffDialog, refreshStatus } =
    useRecoveryCode();
  const [users, setUsers] = useState<SylosUser[]>([]);
  const [loading, setLoading] = useState(isAdmin);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [creating, setCreating] = useState(false);

  const [editTarget, setEditTarget] = useState<EditTarget>(null);
  const [editRole, setEditRole] = useState<UserRole>("user");
  const [editPassword, setEditPassword] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadUsers = async () => {
    if (!isAdmin) return;
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
    if (!isAdmin) return;
    void loadUsers();
  }, [isAdmin]);

  const displayUsers = isAdmin ? users : [currentUser];

  const sortedUsers = useMemo(() => {
    return [...displayUsers].sort((a, b) => {
      if (a.id === currentUser.id) return -1;
      if (b.id === currentUser.id) return 1;
      return a.username.localeCompare(b.username);
    });
  }, [displayUsers, currentUser.id]);

  const editingSelf = editTarget?.id === currentUser.id;

  const selectableUsers = useMemo(
    () =>
      sortedUsers.filter((user) =>
        canSelectUserForBulkDelete(users, user, currentUser.id)
      ),
    [sortedUsers, users, currentUser.id]
  );

  const allSelectableSelected =
    selectableUsers.length > 0 &&
    selectableUsers.every((user) => selectedIds.has(user.id));

  const toggleUserSelected = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelectableSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(selectableUsers.map((user) => user.id)));
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds].filter((id) =>
      selectableUsers.some((user) => user.id === id)
    );
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} user${ids.length === 1 ? "" : "s"}? This cannot be undone.`
      )
    ) {
      return;
    }
    setBulkDeleting(true);
    setError(null);
    try {
      await deleteUsers(ids);
      setSelectedIds(new Set());
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete users.");
    } finally {
      setBulkDeleting(false);
    }
  };

  const openCreate = () => {
    setUsername("");
    setPassword("");
    setRole("user");
    setError(null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setUsername("");
    setPassword("");
    setRole("user");
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const created = await createUser({ username: username.trim(), password, role });
      closeCreate();
      await loadUsers();
      if (created.recoveryCode) {
        showHandoffDialog(created.recoveryCode);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (user: SylosUser) => {
    setEditTarget(user);
    setEditRole(user.role);
    setEditPassword("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setError(null);
  };

  const closeEdit = () => {
    setEditTarget(null);
    setEditPassword("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
  };

  const handleSaveAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingSelf) return;
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      await changePassword(currentPassword, newPassword);
      closeEdit();
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleSaveAdminEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editTarget || editingSelf) return;

    const nextRole = editRole;
    if (editTarget.role === "admin" && nextRole === "user" && !canChangeAdminRole(users, editTarget)) {
      setError("Cannot remove the last admin account.");
      return;
    }

    setSavingEdit(true);
    setError(null);
    try {
      const payload: { role?: UserRole; password?: string } = {};
      if (nextRole !== editTarget.role) {
        payload.role = nextRole;
      }
      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }
      if (Object.keys(payload).length === 0) {
        closeEdit();
        return;
      }
      await updateUser(editTarget.id, payload);
      await loadUsers();
      closeEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleDisabled = async (user: SylosUser) => {
    if (!canDisableUser(users, user)) return;
    const action = user.disabled ? "enable" : "disable";
    if (
      !window.confirm(
        `${action === "disable" ? "Disable" : "Enable"} user "${user.username}"?`
      )
    ) {
      return;
    }
    setError(null);
    try {
      await updateUser(user.id, { disabled: !user.disabled });
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user.");
    }
  };

  const handleDelete = async (user: SylosUser) => {
    if (!canModerateUser(users, user)) return;
    if (!window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteUser(user.id);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
    }
  };

  const handleRecoveryAttention = async () => {
    setError(null);
    try {
      await resolveRecoveryAttention();
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update recovery code.");
    }
  };

  return (
    <div className="settings__section settings__page-section" id={sectionId}>
      <div className="settings-users__title-row">
        <h1 className="settings__section-title">Users</h1>
        {isAdmin && (
          <span className="settings-users__count">Total users: {sortedUsers.length}</span>
        )}
      </div>
      <p className="settings__subsection-description settings-users__intro">
        {isAdmin
          ? "Manage accounts on this install. Disable and delete are hidden when only one account exists or when an action would remove the last admin."
          : "Manage your account password and recovery code."}
      </p>

      {error && <p className="settings__message settings__message--error">{error}</p>}

      {loading ? (
        <p className="settings__subsection-description">Loading users…</p>
      ) : (
        <div
          className={`settings-users__table ${isAdmin ? "settings-users__table--admin" : "settings-users__table--self"}`}
        >
          <div className="settings-users__table-head">
            {isAdmin && (
              <>
                <button
                  type="button"
                  className="settings-users__icon-button settings-users__icon-button--add"
                  onClick={openCreate}
                  aria-label="Add user"
                  title="Add user"
                >
                  <Plus size={16} aria-hidden="true" />
                </button>
                <label className="settings-users__select-all">
                  <input
                    type="checkbox"
                    checked={allSelectableSelected}
                    disabled={selectableUsers.length === 0}
                    onChange={toggleSelectAll}
                    aria-label="Select all users"
                  />
                </label>
              </>
            )}
            <span className="settings-users__col-label">Username</span>
            <span className="settings-users__col-label">Role</span>
            <span className="settings-users__col-label">Created</span>
            <span className="settings-users__col-label">Last login</span>
            <div className="settings-users__table-head-actions">
              {isAdmin && selectedIds.size > 0 && (
                <button
                  type="button"
                  className="settings-users__icon-button settings-users__icon-button--danger"
                  onClick={() => void handleBulkDelete()}
                  disabled={bulkDeleting}
                  aria-label={`Delete ${selectedIds.size} selected user${selectedIds.size === 1 ? "" : "s"}`}
                  title={`Delete ${selectedIds.size} selected`}
                >
                  {bulkDeleting ? (
                    <Loader2 size={16} className="settings-users__spin" aria-hidden="true" />
                  ) : (
                    <Trash2 size={16} aria-hidden="true" />
                  )}
                </button>
              )}
              <span className="settings-users__col-label settings-users__col-label--actions">
                Actions
              </span>
            </div>
          </div>

          {sortedUsers.map((user) => {
            const isSelf = user.id === currentUser.id;
            const showModeration = isAdmin && canModerateUser(users, user);
            const showDisable = isAdmin && canDisableUser(users, user);
            const showRecoveryAttention = isSelf && needsAttention;
            const selectable = isAdmin && canSelectUserForBulkDelete(users, user, currentUser.id);
            const disableTitle = user.disabled
              ? "Enable user"
              : showDisable
                ? "Disable user"
                : "Cannot disable the last admin";

            return (
              <div
                key={user.id}
                className={`settings-users__table-row ${isSelf ? "settings-users__table-row--self" : ""}`}
              >
                {isAdmin && (
                  <>
                    <span className="settings-users__table-spacer" aria-hidden="true" />
                    <label className="settings-users__row-select">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(user.id)}
                        disabled={!selectable}
                        onChange={() => toggleUserSelected(user.id)}
                        aria-label={`Select ${user.username}`}
                      />
                    </label>
                  </>
                )}

                <div className="settings-users__cell settings-users__cell--username">
                  <div className="settings-users__title-line">
                    <span className="settings-users__name">{user.username}</span>
                    {showRecoveryAttention && (
                      <button
                        type="button"
                        className="settings-users__attention"
                        onClick={() => void handleRecoveryAttention()}
                        aria-label="Recovery code needs attention"
                        title="Generate and store your recovery code"
                      />
                    )}
                    {isSelf && (
                      <span className="settings-users__badge settings-users__badge--you">You</span>
                    )}
                    {user.disabled && (
                      <span className="settings-users__badge settings-users__badge--disabled">
                        Disabled
                      </span>
                    )}
                  </div>
                </div>

                <div className="settings-users__cell settings-users__cell--role">
                  <span
                    className={`settings-users__badge ${
                      user.role === "admin" ? "settings-users__badge--admin" : ""
                    }`}
                  >
                    {user.role}
                  </span>
                </div>

                <div className="settings-users__cell settings-users__cell--time">
                  {formatUserTimestamp(user.createdAt)}
                </div>

                <div className="settings-users__cell settings-users__cell--time">
                  {formatUserTimestamp(user.lastLoginAt)}
                </div>

                <div className="settings-users__actions">
                  <button
                    type="button"
                    className="settings-users__icon-button"
                    onClick={() => openEdit(user)}
                    aria-label={isSelf ? "Edit your account" : `Edit ${user.username}`}
                    title={isSelf ? "Edit your account" : "Edit user"}
                  >
                    <Pencil size={16} aria-hidden="true" />
                  </button>

                  {showModeration && (
                    <button
                      type="button"
                      className="settings-users__icon-button"
                      onClick={() => void handleToggleDisabled(user)}
                      disabled={!showDisable && !user.disabled}
                      aria-label={disableTitle}
                      title={disableTitle}
                    >
                      <Ban size={16} aria-hidden="true" />
                    </button>
                  )}

                  {showModeration && (
                    <button
                      type="button"
                      className="settings-users__icon-button settings-users__icon-button--danger"
                      onClick={() => void handleDelete(user)}
                      aria-label={`Delete ${user.username}`}
                      title="Delete user"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <div className="confirm-dialog__overlay" onClick={closeCreate}>
          <div
            className="confirm-dialog__content cloud-oauth-edit"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="confirm-dialog__title">Add user</h2>
            <p className="settings__subsection-description">
              A one-time recovery code is shown after the account is created.
            </p>
            <form className="settings-users__edit-form" onSubmit={(e) => void handleCreate(e)}>
              <label>
                Username
                <input value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
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
              {error && <p className="settings__message settings__message--error">{error}</p>}
              <div className="confirm-dialog__actions">
                <button
                  type="button"
                  className="confirm-dialog__button confirm-dialog__button--cancel"
                  onClick={closeCreate}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="confirm-dialog__button confirm-dialog__button--confirm"
                  disabled={creating}
                >
                  {creating ? "Adding…" : "Add user"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTarget && editingSelf && (
        <div className="confirm-dialog__overlay" onClick={closeEdit}>
          <div
            className="confirm-dialog__content cloud-oauth-edit"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="confirm-dialog__title">Edit your account</h2>
            <form className="settings-users__edit-form" onSubmit={(e) => void handleSaveAccount(e)}>
              <label>
                Current password
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  autoFocus
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
              {passwordError && <p className="settings__message settings__message--error">{passwordError}</p>}
              <div className="confirm-dialog__actions">
                <button
                  type="button"
                  className="confirm-dialog__button confirm-dialog__button--cancel"
                  onClick={closeEdit}
                  disabled={passwordBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="confirm-dialog__button confirm-dialog__button--confirm"
                  disabled={passwordBusy}
                >
                  {passwordBusy ? "Updating…" : "Update password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTarget && !editingSelf && (
        <div className="confirm-dialog__overlay" onClick={closeEdit}>
          <div
            className="confirm-dialog__content cloud-oauth-edit"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="confirm-dialog__title">Edit {editTarget.username}</h2>
            <form className="settings-users__edit-form" onSubmit={(e) => void handleSaveAdminEdit(e)}>
              <label>
                Role
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                >
                  <option
                    value="user"
                    disabled={
                      editTarget.role === "admin" && !canChangeAdminRole(users, editTarget)
                    }
                  >
                    User
                  </option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label>
                New password
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  autoComplete="new-password"
                  autoFocus
                />
              </label>
              {error && <p className="settings__message settings__message--error">{error}</p>}
              <div className="confirm-dialog__actions">
                <button
                  type="button"
                  className="confirm-dialog__button confirm-dialog__button--cancel"
                  onClick={closeEdit}
                  disabled={savingEdit}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="confirm-dialog__button confirm-dialog__button--confirm"
                  disabled={savingEdit}
                >
                  {savingEdit ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
