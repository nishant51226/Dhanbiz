/**
 * Public registration payload (mobile / lead forms).
 * `phoneCountryCode` is optional (e.g. "+44"); combine with `phone` for full dial string when persisting.
 */
export type RegisterPayload = {
  email: string;
  fullName: string;
  interest: string;
  phone: string;
  phoneCountryCode?: string;
  /** Snake_case alias for `phoneCountryCode`; stored on `enquiry_user.country_code`. */
  country_code?: string;
  /** When omitted, the API may generate a password server-side for account creation. */
  password?: string;
};
