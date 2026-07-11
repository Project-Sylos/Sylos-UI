import { SylosUser } from "../api/auth";

export function countAdmins(users: SylosUser[]): number {
  return users.filter((user) => user.role === "admin").length;
}

export function countEnabledAdmins(users: SylosUser[]): number {
  return users.filter((user) => user.role === "admin" && !user.disabled).length;
}

/** Whether disable/delete icons should appear for a target user. */
export function canModerateUser(users: SylosUser[], target: SylosUser): boolean {
  if (users.length <= 1) {
    return false;
  }
  if (target.role !== "admin") {
    return true;
  }
  return countAdmins(users) > 1;
}

/** Whether disabling this user would remove the last active admin. */
export function canDisableUser(users: SylosUser[], target: SylosUser): boolean {
  if (!canModerateUser(users, target)) {
    return false;
  }
  if (target.disabled) {
    return true;
  }
  if (target.role === "admin" && countEnabledAdmins(users) <= 1) {
    return false;
  }
  return true;
}

/** Whether a user can be included in admin bulk selection/delete. */
export function canSelectUserForBulkDelete(
  users: SylosUser[],
  target: SylosUser,
  currentUserId: string
): boolean {
  if (target.id === currentUserId) {
    return false;
  }
  return canModerateUser(users, target);
}

/** Whether demoting or deleting would remove the last admin account. */
export function canChangeAdminRole(users: SylosUser[], target: SylosUser): boolean {
  if (target.role !== "admin") {
    return true;
  }
  return countAdmins(users) > 1;
}
