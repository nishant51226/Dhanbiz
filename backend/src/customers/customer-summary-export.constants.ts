export type CustomerSummaryExportColumnId = (typeof CUSTOMER_SUMMARY_EXPORT_CATALOG)[number]["id"];

export const CUSTOMER_SUMMARY_EXPORT_CATALOG: readonly {
  id: string;
  label: string;
  /** Pre-selected when opening the export dialog */
  defaultOn: boolean;
}[] = [
  { id: "name", label: "Client name", defaultOn: true },
  { id: "annualTurnoverGbp", label: "Annual turnover (GBP)", defaultOn: true },
  { id: "subscriptionPlan", label: "Subscription plan", defaultOn: true },
  { id: "planId", label: "Matrix plan ID", defaultOn: false },
  { id: "portalUsers", label: "Portal users", defaultOn: true },
  { id: "threeKRef", label: "Client reference", defaultOn: true },
  { id: "entityType", label: "Entity type", defaultOn: true },
  { id: "industryGroup", label: "Industry group", defaultOn: true },
  { id: "joiningMonth", label: "Joining month", defaultOn: true },
  { id: "numberOfStores", label: "No. of stores", defaultOn: true },
  { id: "clearance", label: "Clearance", defaultOn: false },
  { id: "formStatus", label: "Onboarding status", defaultOn: true },
  { id: "kycStatus", label: "KYC status", defaultOn: true },
  { id: "contactEmail", label: "Contact email", defaultOn: true },
  { id: "contactPhone", label: "Contact phone", defaultOn: true },
  { id: "registeredLine1", label: "Registered address line 1", defaultOn: true },
  { id: "registeredCity", label: "Registered city", defaultOn: true },
  { id: "registeredPostcode", label: "Registered post code", defaultOn: true },
  { id: "registeredCountry", label: "Registered country", defaultOn: true },
  { id: "tradingSameAsRegistered", label: "Trading same as registered", defaultOn: false },
  { id: "tradingLine1", label: "Trading address line 1", defaultOn: false },
  { id: "tradingCity", label: "Trading city", defaultOn: false },
  { id: "tradingPostcode", label: "Trading post code", defaultOn: false },
  { id: "tradingCountry", label: "Trading country", defaultOn: false },
  { id: "companyStatus", label: "Company status", defaultOn: false },
  { id: "jurisdiction", label: "Jurisdiction", defaultOn: false },
  { id: "vatNumber", label: "VAT number", defaultOn: true },
  { id: "vatRegDate", label: "VAT reg date", defaultOn: false },
  { id: "vatQuarterEnd", label: "Next VAT quarter end", defaultOn: false },
  { id: "niNumber", label: "PAYE Ref", defaultOn: false },
  { id: "cisReference", label: "CIS reference", defaultOn: false },
  { id: "paye", label: "PAYE", defaultOn: true },
  { id: "payeFrequency", label: "PAYE frequency", defaultOn: false },
  { id: "payeReference", label: "PAYE reference", defaultOn: false },
  { id: "companyRegNo", label: "Company reg no", defaultOn: true },
  { id: "companyRegDate", label: "Reg date", defaultOn: false },
  { id: "chEmail", label: "CH email", defaultOn: false },
  { id: "utr", label: "UTR", defaultOn: true },
  { id: "authCode", label: "Auth code", defaultOn: false },
  { id: "yearEnd", label: "Year end", defaultOn: false },
  { id: "filingMonth", label: "Filing month", defaultOn: false },
  { id: "accountsFilingDue", label: "Accounts filing due", defaultOn: false },
  { id: "confirmationStatement", label: "Confirmation statement due", defaultOn: false },
  { id: "agentName", label: "Agent name", defaultOn: false },
  { id: "agentAddress", label: "Agent address", defaultOn: false },
  { id: "agentPostcode", label: "Agent postcode", defaultOn: false },
  { id: "agentPhone", label: "Agent phone", defaultOn: false },
  { id: "agentCodeSa", label: "Agent code (SA)", defaultOn: false },
  { id: "agentCodeCt", label: "Agent code (CT)", defaultOn: false },
  { id: "agentClientReference", label: "Agent / client reference", defaultOn: true },
  { id: "bankAccountHolder", label: "Bank account holder", defaultOn: false },
  { id: "bankSortCode", label: "Bank sort code", defaultOn: false },
  { id: "bankAccountNumber", label: "Bank account number", defaultOn: false },
  { id: "bankAddress", label: "Bank address", defaultOn: false },
  { id: "previousAccountant", label: "Previous accountant", defaultOn: false },
  { id: "previousAccountantAddress", label: "Previous accountant address", defaultOn: false },
  { id: "taxAuthSelfAssessment", label: "Tax auth — Self Assessment", defaultOn: false },
  { id: "taxAuthPartnership", label: "Tax auth — Partnership", defaultOn: false },
  { id: "taxAuthTrust", label: "Tax auth — Trust", defaultOn: false },
  { id: "taxAuthVat", label: "Tax auth — VAT", defaultOn: false },
  { id: "taxAuthPaye", label: "Tax auth — PAYE", defaultOn: false },
  { id: "servicesInPack", label: "Services in pack", defaultOn: true },
  { id: "director1Name", label: "Director 1 name", defaultOn: false },
  { id: "customerId", label: "Customer ID", defaultOn: false },
  { id: "createdAt", label: "Created at", defaultOn: false },
  { id: "updatedAt", label: "Updated at", defaultOn: false },
] as const;

const CATALOG_IDS = new Set(CUSTOMER_SUMMARY_EXPORT_CATALOG.map((c) => c.id));

const LABEL_BY_ID = new Map(CUSTOMER_SUMMARY_EXPORT_CATALOG.map((c) => [c.id, c.label]));

export function isSummaryExportColumnId(id: string): id is CustomerSummaryExportColumnId {
  return CATALOG_IDS.has(id);
}

export function summaryExportLabel(id: string): string {
  return LABEL_BY_ID.get(id) ?? id;
}

export function defaultSummaryExportColumnIds(): string[] {
  return CUSTOMER_SUMMARY_EXPORT_CATALOG.filter((c) => c.defaultOn).map((c) => c.id);
}
