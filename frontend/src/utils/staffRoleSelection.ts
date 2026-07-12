import type { AdminRoleRow } from "../types/api";

type RolePermSource = Pick<AdminRoleRow, "id" | "permissions">;

/** Union of permission keys from selected staff roles. */
export function unionPermissionsFromRoles(
  allRoles: RolePermSource[],
  selectedIds: ReadonlySet<string>,
): string[] {
  const out = new Set<string>();
  for (const role of allRoles) {
    if (!selectedIds.has(role.id)) continue;
    for (const p of role.permissions) {
      if (p.trim()) out.add(p);
    }
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

export function selectedRolesHavePermission(
  allRoles: RolePermSource[],
  selectedIds: ReadonlySet<string>,
  permission: string,
): boolean {
  const want = permission.trim().toLowerCase();
  for (const role of allRoles) {
    if (!selectedIds.has(role.id)) continue;
    if (role.permissions.some((p) => p.trim().toLowerCase() === want)) return true;
  }
  return false;
}

/** Practice users with roles need customer assignments (unless superadmin). */
export function staffNeedsCustomerAssignments(selectedIds: ReadonlySet<string>, isAdmin: boolean): boolean {
  return !isAdmin && selectedIds.size > 0;
}

/** Default picker to all customers (every status) when roles include customer or library-assignee access. */
export function staffDefaultsAllCustomers(
  allRoles: RolePermSource[],
  selectedIds: ReadonlySet<string>,
  isAdmin: boolean,
): boolean {
  if (isAdmin || selectedIds.size === 0) return false;
  return (
    selectedRolesHavePermission(allRoles, selectedIds, "customer:write") ||
    selectedRolesHavePermission(allRoles, selectedIds, "customer:read") ||
    selectedRolesHavePermission(allRoles, selectedIds, "document:assignee")
  );
}
