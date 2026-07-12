import type { CustomerAccountStatus } from "../types/api";

type CustomerOption = {
  id: string;
  name: string;
  accountStatus?: CustomerAccountStatus;
};

const STATUS_LABEL: Record<CustomerAccountStatus, string> = {
  draft: "Draft",
  active: "Active",
  inactive: "Inactive",
  proposed: "Proposed",
};

/** Label for report customer pickers — appends status when not active. */
export function reportCustomerOptionLabel(customer: CustomerOption): string {
  const name = customer.name.trim() || customer.id;
  const status = customer.accountStatus;
  if (status && status !== "active") {
    return `${name} (${STATUS_LABEL[status] ?? status})`;
  }
  return name;
}
