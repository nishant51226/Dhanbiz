import type { Repository } from "typeorm";
import { RoleEntity } from "../entities/role.entity";
import type { RoleType } from "./role-types.js";

export function roleHasPermission(permissions: unknown, key: string): boolean {
  if (!Array.isArray(permissions)) return false;
  const want = key.trim().toLowerCase();
  return permissions.some((p) => typeof p === "string" && p.trim().toLowerCase() === want);
}

export function filterRolesByPermission(
  roles: Pick<RoleEntity, "id" | "permissions" | "roleType">[],
  permission: string,
  opts?: { roleType?: RoleType; excludePermissions?: string[] },
): string[] {
  const exclude = new Set((opts?.excludePermissions ?? []).map((p) => p.toLowerCase()));
  return roles
    .filter((r) => (opts?.roleType ? r.roleType === opts.roleType : true))
    .filter((r) => roleHasPermission(r.permissions, permission))
    .filter((r) => {
      if (exclude.size === 0) return true;
      if (!Array.isArray(r.permissions)) return true;
      return !r.permissions.some(
        (p) => typeof p === "string" && exclude.has(p.trim().toLowerCase()),
      );
    })
    .map((r) => r.id);
}

export async function findRoleIdsByPermission(
  rolesRepo: Repository<RoleEntity>,
  permission: string,
  opts?: { roleType?: RoleType; excludePermissions?: string[] },
): Promise<string[]> {
  const rows = await rolesRepo.find({
    where: opts?.roleType ? { roleType: opts.roleType } : undefined,
    select: { id: true, permissions: true, roleType: true },
  });
  return filterRolesByPermission(rows, permission, opts);
}
