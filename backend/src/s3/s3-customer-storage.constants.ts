/**
 * Under each customer id in the bucket:
 * `{customerId}/onboarding-files/…` | `invoices/` | `statements/` | `files/`
 */
export const CUSTOMER_S3_TOP_FOLDERS = [
  "onboarding-files",
  "invoices",
  "statements",
  "files",
] as const;

export type CustomerS3TopFolder = (typeof CUSTOMER_S3_TOP_FOLDERS)[number];
