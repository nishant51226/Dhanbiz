/** Human label for a portal role row in admin UI. */
export function portalRoleDisplayLabel(
  roleName: string | undefined,
  permissions: string[] | undefined,
): string {
  const name = roleName?.trim() || "portal";
  const perms = permissions ?? [];
  const isAdmin = perms.includes("portal:user:write");
  const kind = isAdmin ? "Portal admin" : "Portal user";
  return `${kind} (${name})`;
}

export function portalRoleKindHint(permissions: string[] | undefined): string {
  const perms = permissions ?? [];
  if (perms.includes("portal:user:write")) {
    return "Can manage other portal logins and settings.";
  }
  return "Standard portal access (files and workspace).";
}
