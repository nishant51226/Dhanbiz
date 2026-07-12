import type { Customer } from "../types/api";
import type { CustomerOnboardingData } from "../types/customerOnboarding";

export type PortalProfileFields = {
  email?: string;
  registrationNumber?: string;
  addressLine?: string;
  managedBy?: string;
};

export function portalProfileFromCustomer(c: Customer | null): PortalProfileFields {
  if (!c?.onboardingData || typeof c.onboardingData !== "object") return {};
  const d = c.onboardingData as Partial<CustomerOnboardingData>;
  const ra = d.company?.registeredAddress;
  const addr = [ra?.line1, ra?.city, ra?.postcode].filter((x) => x && String(x).trim()).join(", ");
  return {
    email: d.contact?.email?.trim() || undefined,
    registrationNumber: d.company?.number?.trim() || undefined,
    addressLine: addr || undefined,
    managedBy: d.agent?.name?.trim() || undefined,
  };
}

/** Company name with registration number when available (disambiguates duplicate names). */
export function formatCustomerDisplayLabel(c: Pick<Customer, "name" | "onboardingData">): string {
  const name = c.name.trim() || "Unnamed customer";
  const reg = portalProfileFromCustomer(c as Customer).registrationNumber;
  return reg ? `${name} (${reg})` : name;
}
