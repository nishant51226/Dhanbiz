import { CUSTOMER_SUMMARY_EXPORT_CATALOG } from "./customer-summary-export.constants";

/** Allowed JSON keys for `POST /customers/export-list` body `columns` (order preserved in file). */
export const CUSTOMER_LIST_EXPORT_COLUMN_KEYS = [
  "id",
  "name",
  "threeKRef",
  "businessType",
  "city",
  "email",
  "vatNumber",
  "servicesInPack",
  "status",
  "createdAt",
  "updatedAt",
  "planId",
  "annualTurnoverGbp",
  "companyRegNo",
  "utr",
  "yearEnd",
  "addressLine1",
  "postCode",
  "director1Name",
  "kycStatus",
] as const;

export type CustomerListExportColumnKey = (typeof CUSTOMER_LIST_EXPORT_COLUMN_KEYS)[number];

/** Legacy list keys + full per-customer summary column ids (same as customer detail export). */
export const CUSTOMERS_EXPORT_ALLOWED_COLUMN_KEYS = Array.from(
  new Set<string>([...CUSTOMER_LIST_EXPORT_COLUMN_KEYS, ...CUSTOMER_SUMMARY_EXPORT_CATALOG.map((c) => c.id)]),
);

export const CUSTOMER_LIST_EXPORT_LABELS: Record<CustomerListExportColumnKey, string> = {
  id: "Customer ID",
  name: "Client name",
  threeKRef: "Client Ref",
  businessType: "Sole / Ltd / Partnership",
  city: "City",
  email: "Email",
  vatNumber: "VAT no",
  servicesInPack: "Services in pack",
  status: "Status",
  createdAt: "Created at",
  updatedAt: "Updated at",
  planId: "Matrix plan ID",
  annualTurnoverGbp: "Annual turnover (GBP)",
  companyRegNo: "Company reg no",
  utr: "UTR",
  yearEnd: "Year end",
  addressLine1: "Address line 1",
  postCode: "Postcode",
  director1Name: "Director 1 name",
  kycStatus: "KYC status",
};
