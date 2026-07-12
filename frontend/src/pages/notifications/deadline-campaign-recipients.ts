import type { AdminRoleRow, NotificationAudienceRow } from "../../types/api";

export type DeadlineRecipientKey =
  | "practice_staff"
  | "customer_admins"
  | "managers"
  | "accountants";

export const DEADLINE_RECIPIENT_CHOICES: {
  key: DeadlineRecipientKey;
  label: string;
  hint?: string;
}[] = [
  {
    key: "practice_staff",
    label: "Practice staff on customer",
    hint: "Staff assigned to each matching customer",
  },
  {
    key: "customer_admins",
    label: "Customer admins",
    hint: "Portal admins for each matching customer",
  },
  { key: "managers", label: "All managers", hint: "Every practice manager" },
  { key: "accountants", label: "All accountants", hint: "Every practice accountant" },
];

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

function recipientKeyForRole(role: PresetRoleRow): DeadlineRecipientKey | null {
  if (roleHasPermission(role.permissions, "customer:write")) return "managers";
  if (roleHasPermission(role.permissions, "job:read") && !roleHasPermission(role.permissions, "customer:write")) {
    return "accountants";
  }
  return null;
}

export function deadlineRecipientsFromAudiences(
  audiences: NotificationAudienceRow[],
  roles: PresetRoleRow[],
): Set<DeadlineRecipientKey> {
  const selected = new Set<DeadlineRecipientKey>();
  for (const a of audiences) {
    if (a.audience_type === "context_practice_staff_on_customer") selected.add("practice_staff");
    if (a.audience_type === "context_customer_admins") selected.add("customer_admins");
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

export function deadlineAudiencesFromRecipients(
  selected: Set<DeadlineRecipientKey>,
  roles: PresetRoleRow[],
): NotificationAudienceRow[] {
  const out: NotificationAudienceRow[] = [];
  if (selected.has("practice_staff")) {
    out.push({ audience_type: "context_practice_staff_on_customer", role_id: null });
  }
  if (selected.has("customer_admins")) {
    out.push({ audience_type: "context_customer_admins", role_id: null });
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

export const DEFAULT_UPCOMING_TITLE =
  "{{customerName}} — {{deadlineLabel}} due in {{daysRemaining}} days";
export const DEFAULT_UPCOMING_BODY =
  "{{deadlineLabel}} for {{customerName}} will expire soon — due on {{dueDate}} ({{daysRemaining}} days remaining).";
export const DEFAULT_OVERDUE_TITLE =
  "{{customerName}} — {{deadlineLabel}} overdue by {{daysOverdue}} days";
export const DEFAULT_OVERDUE_BODY =
  "{{deadlineLabel}} for {{customerName}} has expired — was due on {{dueDate}} ({{daysOverdue}} days overdue).";

export const DEADLINE_PLACEHOLDER_HINT =
  "Placeholders: {{customerName}}, {{dueDate}}, {{daysRemaining}}, {{daysOverdue}}, {{deadlineLabel}}, {{companyNumber}}";
