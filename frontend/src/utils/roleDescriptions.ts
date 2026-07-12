/** Default descriptions for built-in roles (used when `roles.description` is empty). */
export const SYSTEM_ROLE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  manager:
    "Practice lead: customers, files, jobs, assignments, and creating customers. Full staff workspace access.",
  accountant:
    "Assigned customers only: read files and jobs. Cannot create customers or delete drive items.",
  customer_admin:
    "Portal administrator: files, settings, and organisation profile for one customer.",
  customer_user: "Portal user: view and upload files in the customer document library.",
};

export function roleDisplayDescription(role: { name: string; description?: string | null }): string | null {
  const custom = role.description?.trim();
  if (custom) return custom;
  const fallback = SYSTEM_ROLE_DESCRIPTIONS[role.name.trim().toLowerCase()];
  return fallback ?? null;
}
