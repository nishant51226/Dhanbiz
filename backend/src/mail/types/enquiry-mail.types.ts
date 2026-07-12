/** Enquiry / lead form payload — not persisted; used only to compose notification emails. */
export type EnquiryMailPayload = {
  email: string;
  fullName: string;
  interest: string;
  phone: string;
  phoneCountryCode?: string;
};
