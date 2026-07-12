import type { AdminRoleRow, NotificationAudienceRow } from "../../types/api";

export type RecipientKey =
  | "customer_admins"
  | "portal_users"
  | "managers"
  | "accountants";

export const RECIPIENT_CHOICES: { key: RecipientKey; label: string; hint?: string }[] = [
  { key: "customer_admins", label: "Customer admins", hint: "All portal admins across customers" },
  {
    key: "portal_users",
    label: "All customer portal users",
    hint: "Standard portal users only (excludes customer admins)",
  },
  { key: "managers", label: "Managers", hint: "Practice managers" },
  { key: "accountants", label: "Accountants", hint: "Practice accountants" },
];

/** Internal event key — not shown in the UI. */
export const FILE_UPLOAD_EVENT_KEY = "file.uploaded";

export const FILE_UPLOAD_EVENT = {
  eventKey: FILE_UPLOAD_EVENT_KEY,
  label: "File upload",
  description:
    "Sent to customer admins when practice staff upload for a customer, or when a customer portal user (not an admin) uploads a file.",
  placeholderHint:
    "You can use {{customerName}}, {{uploadSummary}}, {{fileCount}}, and {{fileName}} in the title and message.",
} as const;

type PresetRoleRow = Pick<AdminRoleRow, "id" | "name" | "roleType" | "permissions" | "isSystem">;

function roleHasPermission(permissions: string[], key: string): boolean {
  return permissions.includes(key);
}

function managerPresetRole(roles: PresetRoleRow[]): PresetRoleRow | undefined {
  return (
    roles.find((r) => r.roleType === "staff" && r.isSystem && r.name === "manager") ??
    roles.find((r) => r.roleType === "staff" && roleHasPermission(r.permissions, "customer:write"))
  );
}

function accountantPresetRole(roles: PresetRoleRow[]): PresetRoleRow | undefined {
  return (
    roles.find((r) => r.roleType === "staff" && r.isSystem && r.name === "accountant") ??
    roles.find(
      (r) =>
        r.roleType === "staff" &&
        roleHasPermission(r.permissions, "job:read") &&
        !roleHasPermission(r.permissions, "customer:write"),
    )
  );
}

function recipientKeyForRole(role: PresetRoleRow): RecipientKey | null {
  if (roleHasPermission(role.permissions, "customer:write")) return "managers";
  if (roleHasPermission(role.permissions, "job:read") && !roleHasPermission(role.permissions, "customer:write")) {
    return "accountants";
  }
  return null;
}

export function recipientsFromAudiences(
  audiences: NotificationAudienceRow[],
  roles: PresetRoleRow[],
): Set<RecipientKey> {
  const selected = new Set<RecipientKey>();
  for (const a of audiences) {
    if (a.audience_type === "context_customer_admins") selected.add("customer_admins");
    if (a.audience_type === "context_customer_portal_users") selected.add("portal_users");
    if (a.audience_type === "all_practice_staff_with_role" && a.role_id) {
      const role = roles.find((r) => r.id === a.role_id);
      if (role) {
        const key = recipientKeyForRole(role);
        if (key) selected.add(key);
      }
    }
  }
  return selected;
}

export function audiencesFromRecipients(
  selected: Set<RecipientKey>,
  roles: PresetRoleRow[],
): NotificationAudienceRow[] {
  const out: NotificationAudienceRow[] = [];
  if (selected.has("customer_admins")) {
    out.push({ audience_type: "context_customer_admins", role_id: null });
  }
  if (selected.has("portal_users")) {
    out.push({ audience_type: "context_customer_portal_users", role_id: null });
  }
  const manager = managerPresetRole(roles);
  const accountant = accountantPresetRole(roles);
  if (selected.has("managers") && manager) {
    out.push({ audience_type: "all_practice_staff_with_role", role_id: manager.id });
  }
  if (selected.has("accountants") && accountant) {
    out.push({ audience_type: "all_practice_staff_with_role", role_id: accountant.id });
  }
  return out;
}

export function broadcastPresetsFromRecipients(selected: Set<RecipientKey>): string[] {
  const presets: string[] = [];
  if (selected.has("portal_users")) presets.push("portal_users");
  if (selected.has("customer_admins")) presets.push("customer_admins");
  if (selected.has("managers") && selected.has("accountants")) {
    presets.push("practice_staff");
  } else {
    if (selected.has("managers")) presets.push("managers");
    if (selected.has("accountants")) presets.push("accountants");
  }
  return presets;
}

export function broadcastAudiencesFromRecipients(
  _selected: Set<RecipientKey>,
): { audience_type: string; role_id: null }[] {
  return [];
}
