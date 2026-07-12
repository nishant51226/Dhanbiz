/** `customerId` is the tenant / company scope for all API entities; future RLS will key off this. */

/** Lifecycle on the customer row (`customers.account_status`), separate from form submission `draft`/`completed`. */
export type CustomerAccountStatus = "draft" | "active" | "inactive" | "proposed";

/** Row from `customer_users` on `GET /api/customers/:id` (`portalUsers`). */
export type CustomerPortalUserAssignment = {
  id: string;
  customerId: string;
  userId: string;
  roleId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    customerId: string | null;
    phoneNumber: string | null;
    isAdmin: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
  role: {
    id: string;
    name: string;
    permissions: string[];
    createdAt: string;
    updatedAt: string;
  } | null;
};

export type Customer = {
  id: string;
  name: string;
  /** Registration / staff lifecycle: draft until onboarding completes, then active; inactive and proposed are staff-set. */
  accountStatus?: CustomerAccountStatus;
  /**
   * Canonical onboarding JSON after the wizard is **finished** (`PATCH` with `onboardingData`).
   * While registration is in progress, use `customer_form_submission.data` only.
   */
  onboardingData?: Record<string, unknown> | null;
  /** Estimated annual turnover (GBP) captured at registration. */
  annualTurnoverGbp?: number | string | null;
  /** Matrix bundle `plans.id` assigned to the customer. */
  planId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** Present on `GET /api/customers/:id` with nested user (no password) and role. */
  portalUsers?: CustomerPortalUserAssignment[];
  /** Matrix plan row when `planId` is set. */
  plan?: { id?: string; name?: string; billingCycle?: string; maxTurnover?: number | null; isActive?: boolean } | null;
  /**
   * Four onboarding PDFs (`01-client-registration.pdf` … `04-direct-debit.pdf`):
   * presigned S3 GET when the bucket is configured (refresh customer to renew links).
   */
  onboardingFormPdfDownloads?: CustomerOnboardingFormPdfDownload[];
};

export type OnboardingDocusealSignatureTarget =
  | "client_registration"
  | "hmrc_64_8"
  | "change_accountant"
  | "direct_debit";

/** Wizard step 1–4 buckets in `customer_form_submission.metadata` (each may hold `docuseal`, `status`, …). */
export type CustomerFormSubmissionFormKey = "form_1" | "form_2" | "form_3" | "form_4";

/** One of the four fixed onboarding step PDFs; presigned URLs from `GET /api/customers/:id`. */
export type CustomerOnboardingFormPdfDownload = {
  formKey: CustomerFormSubmissionFormKey;
  filename: string;
  title: string;
  fileId: string | null;
  downloadUrl: string | null;
  urlExpiresAt: string | null;
};

export type CustomerFormSubmissionFormDocuseal = {
  submissionId?: string | null;
  target?: OnboardingDocusealSignatureTarget;
  phase?: "email_sent" | "link_viewed" | "signed";
  emailedAt?: string;
  viewedAt?: string;
  signedAt?: string;
};

export type CustomerFormSubmissionStepMeta = {
  lastUpdatedAt?: string;
};

export type CustomerFormSubmissionFormBucket = {
  docuseal?: CustomerFormSubmissionFormDocuseal | Record<string, never>;
  metadata?: CustomerFormSubmissionStepMeta;
  status?: string;
  [key: string]: unknown;
};

/**
 * Per-form metadata (`form_1` = client registration … `form_4` = direct debit).
 * Legacy API responses may still include a root `docuseal` object; the UI normalizes that in memory.
 */
export type CustomerFormSubmissionMetadata = {
  form_1?: CustomerFormSubmissionFormBucket;
  form_2?: CustomerFormSubmissionFormBucket;
  form_3?: CustomerFormSubmissionFormBucket;
  form_4?: CustomerFormSubmissionFormBucket;
  /** @deprecated Prefer `form_1`…`form_4`; normalized client-side when present. */
  docuseal?: CustomerFormSubmissionFormDocuseal;
} & Record<string, unknown>;

export type CustomerFormSubmission = {
  id: string;
  customerId: string;
  data: Record<string, unknown>;
  /** `draft` = onboarding in progress (DocuSeal state is under `metadata.form_*`). `completed` = active / done. */
  status: "draft" | "completed";
  metadata?: CustomerFormSubmissionMetadata;
  createdAt?: string;
  updatedAt?: string;
};

/** Latest submission per customer from batch API (missing id => treat as pending). */
export type CustomerFormSubmissionStatusesResponse = {
  statuses: Record<string, "draft" | "completed">;
};

/** One row from `GET /api/customers/page-with-submission-data` (list + latest form `data`). */
export type CustomerPageLatestFormSubmission = {
  id: string;
  status: "draft" | "completed";
  data: Record<string, unknown>;
  updatedAt: string;
};

export type CustomerPageRowWithSubmission = {
  id: string;
  name: string;
  accountStatus?: CustomerAccountStatus;
  createdAt: string;
  updatedAt: string;
  onboardingData: Record<string, unknown> | null;
  latestFormSubmission: CustomerPageLatestFormSubmission | null;
  /** Matrix catalogue plan assigned on `customers.plan_id`. */
  planId?: string | null;
  planName?: string | null;
};

export type CustomerPageWithSubmissionResponse = {
  data: CustomerPageRowWithSubmission[];
  total: number;
  page: number;
  pageCount: number;
  limit: number;
};

/** `GET /api/customers/onboarding-dashboard-sort-fields` */
export type OnboardingDashboardSortFieldMeta = {
  id: string;
  label: string;
};

export type OnboardingDashboardSortFieldsResponse = {
  fields: OnboardingDashboardSortFieldMeta[];
};

export type CompaniesHouseDashboardBucket = { label: string; count: number };
export type CompaniesHouseDashboardYearBucket = { year: string; count: number };

/** `GET /api/customers/companies-house-dashboard-aggregates` */
export type CompaniesHouseDashboardAggregatesResponse = {
  totalCustomersInScope: number;
  customersWithChSnapshot: number;
  byCompanyStatus: CompaniesHouseDashboardBucket[];
  byChType: CompaniesHouseDashboardBucket[];
  byOnboardingCompanyType: CompaniesHouseDashboardBucket[];
  byCreationYear: CompaniesHouseDashboardYearBucket[];
  byCessationYear: CompaniesHouseDashboardYearBucket[];
};

export type DriveFile = {
  id: string;
  customerId: string;
  parentId: string | null;
  fileType: "folder" | "file";
  name: string;
  mimeType: string | null;
  sizeBytes: string | null;
  storageRelativePath: string | null;
  /** JSONB; supplier folders use `{ isSupplier: true }` only. */
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
};

export type PortalLibrarySection = "invoices" | "statements" | "files";

/** `POST /api/folders/global` — root/system folder (no customer scope). */
export type GlobalFolderRow = {
  id: string;
  name: string;
  parentId: string | null;
  type: PortalLibrarySection;
  customerId: string | null;
  isGlobal: boolean;
  isDefault?: boolean;
  createdAt?: string;
};

export type AdminDefaultFolderCandidate = {
  id: string;
  name: string;
  isGlobal: boolean;
  customerId: string | null;
  isCurrentDefault: boolean;
};

export type AdminDefaultFolderAssignment = {
  scope: "global" | "customer";
  customerId: string | null;
  customerName: string | null;
  folderId: string;
  folderName: string;
  folderIsGlobal: boolean;
};

export type AdminRestrictedFolderCandidate = {
  id: string;
  name: string;
  isGlobal: boolean;
  customerId: string | null;
  isCurrentRestricted: boolean;
};

export type AdminRestrictedFolderAssignment = AdminDefaultFolderAssignment;

export type PortalSupplierOption = {
  folderId: string;
  label: string;
  disambiguation: string;
  /** True when this folder is the configured default for this library kind (customer override, else global). */
  isDefault?: boolean;
  /** Staff-only uploads: folder marked restricted in settings (`folders.is_restricted`). */
  isRestricted?: boolean;
  /** Which portal library tree this folder belongs to (`folders.type`). */
  libraryKind?: PortalLibrarySection;
};

/** `GET /api/customer-portal/:customerId/:section/folders` — `folders` table rows. */
export type PortalLibraryFolderRow = {
  id: string;
  name: string;
  parentId: string | null;
  type: PortalLibrarySection;
  customerId: string | null;
  customer?: { id: string; name: string } | null;
  isGlobal?: boolean;
  isRestricted?: boolean;
};

export type LibraryFolderBrowseScope = "global" | "customer" | "all";

export type LibraryDateBrowseLevel = "years" | "months" | "days" | "dates" | "customers" | "folders" | "documents";

export type LibraryDateBrowseYearRow = { year: number; count: number };
/** `month` is calendar month 1–12 (January = 1). Scope with `year` query param. */
export type LibraryDateBrowseMonthRow = { month: number; count: number };
export type LibraryDateBrowseDayRow = { day: number; count: number };
export type LibraryDateBrowseDateRow = { dateKey: string; count: number };
export type LibraryDateBrowseCustomerRow = { customerId: string; customerName: string; count: number };

/** `GET /api/documents/dashboard/customer-uploads` — staff dashboard aggregates by upload time. */
export type CustomerDocumentUploadDashboardResponse = {
  total: number;
  byCustomer: Array<{ customerId: string; customerName: string; count: number }>;
  byCustomerDate: Array<{
    customerId: string;
    customerName: string;
    uploadDateKey: string;
    count: number;
  }>;
  byCustomerDateTotal: number;
  byCustomerDatePage: number;
  byCustomerDatePageCount: number;
  byCustomerDateLimit: number;
  byLibraryKind: Array<{ libraryKind: string; count: number }>;
};

export type LibraryDateBrowseFolderRow = {
  folderId: string;
  folderName: string;
  libraryKind: PortalLibrarySection;
  count: number;
};

export type PortalLibraryDocumentRow = {
  id: string;
  folderId: string;
  name: string;
  fileUrl: string;
  metadata: Record<string, unknown>;
  mimeType?: string | null;
  documentDate?: string | null;
  uploadedAt?: string;
  createdAt?: string;
  /** Present when `GET /api/jobs` includes `document.folder` (admin jobs list). */
  folder?: Pick<PortalLibraryFolderRow, "id" | "type" | "name"> | null;
};

export type FileDocumentAccessActor = {
  displayName: string | null;
  actorKind: string;
  at: string;
};

export type FileDocumentAccessSummary = {
  /** First upload event for the document (original uploader). */
  uploadedBy: FileDocumentAccessActor | null;
  lastViewedBy: FileDocumentAccessActor | null;
  lastDownloadedBy: FileDocumentAccessActor | null;
};

/** `GET /api/documents` — full folder + customer joins. */
export type AdminLibraryDocumentRow = PortalLibraryDocumentRow & {
  customerId?: string;
  customer?: { id: string; name: string } | null;
  folder?: (Pick<PortalLibraryFolderRow, "id" | "name" | "type" | "customerId"> & {
    customer?: { id: string; name: string };
  }) | null;
  /** Superadmin only — latest view/download from file activity log (Files library docs). */
  fileAccess?: FileDocumentAccessSummary;
  documentType?: string;
};

/** `GET /api/customer-portal/:customerId/:section/library` — full graph for Miller UI. */
export type PortalLibraryTreeResponse = {
  folders: PortalLibraryFolderRow[];
  documents: PortalLibraryDocumentRow[];
};

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "cancelled";

export type PgBossQueueStateCount = {
  queueName: string;
  state: string;
  count: number;
};

export type PgBossQueueJobRow = {
  pgBossId: string;
  queueName: string;
  state: string;
  createdOn: string;
  startedOn: string | null;
  completedOn: string | null;
  payload: Record<string, unknown>;
  jobId: string | null;
  jobStatus: string | null;
  percentCompleted: number | null;
  documentName: string | null;
  customerName: string | null;
};

export type PgBossJobMismatch = {
  jobId: string;
  jobStatus: string;
  percentCompleted: number;
  pgBossJobId: string | null;
  issue: string;
};

export type PgBossDashboard = {
  workerRunning: boolean;
  queueNames: string[];
  stateCounts: PgBossQueueStateCount[];
  liveJobs: PgBossQueueJobRow[];
  recentCompleted: PgBossQueueJobRow[];
  mismatches: PgBossJobMismatch[];
  fetchedAt: string;
};

export type AiProviderId = "ollama" | "openai" | "bedrock";

export type ExtractProviderOption = {
  id: AiProviderId;
  visionModelDefault: string;
  structureModelDefault: string;
};

/** From `GET /api/jobs/counts-by-status` — aggregates `jobs.status`. */
export type JobStatusCounts = {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
};

export type JobRow = {
  id: string;
  customerId: string;
  /** Legacy drive file (`files` table). */
  fileId: string | null;
  /** Portal library row (`documents` table). */
  documentId?: string | null;
  type: string;
  status: JobStatus;
  percentCompleted: number;
  result: Record<string, unknown> | null;
  error: string | null;
  visionPrompt: string | null;
  structurePrompt: string | null;
  visionModel: string | null;
  structureModel: string | null;
  aiProvider?: AiProviderId | null;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  processingDurationMs?: number | null;
  customer?: { id: string; name: string };
  file?: DriveFile | null;
  document?: PortalLibraryDocumentRow | null;
};

export type ExtractConfig = {
  visionModel: string;
  structureModel: string;
  defaultProvider?: AiProviderId;
  providers?: ExtractProviderOption[];
  visionPromptDefault: string;
  structurePromptDefault: string;
};

export type CrudListResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageCount: number;
};

/** Stored in `subscription_plans.features` JSONB. */
export type SubscriptionPlanFeatures = {
  included?: string[];
  not_included?: string[];
  [key: string]: unknown;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  price: number;
  billing_cycle: string;
  features: SubscriptionPlanFeatures | Record<string, unknown> | null;
  turnoverMinGbp?: number | string | null;
  turnoverMaxGbp?: number | string | null;
  sortOrder?: number;
  isActive?: boolean;
  is_active?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

/** From `POST /api/subscription-plans/by-turnover` — band match for the given turnover. */
export type SubscriptionPlanWithRecommendation = SubscriptionPlan & { recommended: boolean };

/** From `POST /api/subscriptions/recommend` — matrix bundle pricing breakdown. */
export type SubscriptionPlanPricingBreakdown = {
  base: number;
  turnoverExtra: number;
  payrollExtra: number;
  dormant: number;
  vat: number;
  final: number;
  vatPercent?: number;
  subtotalBeforeVat?: number;
  turnoverExtensionDetail?: {
    blocks: number;
    step: number;
    costPerBlock: number;
    bandCeiling: number;
  };
  payrollExtraDetail?: { extraPayees: number; ratePerPayee: number };
  dormantDetail?: { flatFee: number };
};

/** Plan-linked services on recommend cards (`included` / `addon` only from API). */
export type PlanRecommendFeatureRow = {
  serviceId: string;
  name: string;
  status: "included" | "addon" | "not_offered";
};

export type RecommendedSubscriptionPlanRow = {
  planId: string;
  plan: string;
  payrollLimit: number;
  pricing: SubscriptionPlanPricingBreakdown;
  featureMatrix?: PlanRecommendFeatureRow[];
};

export type RecommendSubscriptionPlansResponse = {
  recommendedPlan: string;
  plans: RecommendedSubscriptionPlanRow[];
  /** True when strict filters matched nothing; all active plans for the billing cycle are listed. */
  billingCycleFallback?: boolean;
};

/** Step 1 subscription cards after matrix recommend (distinct from legacy `SubscriptionPlan`). */
export type OnboardingSubscriptionPlanCard = {
  id: string;
  name: string;
  recommended: boolean;
  payrollLimit: number;
  pricing: SubscriptionPlanPricingBreakdown;
  featureMatrix?: PlanRecommendFeatureRow[];
};

export type CreateSubscriptionPlanPayload = {
  name: string;
  code: string;
  description?: string;
  price?: number;
  billing_cycle?: string;
  features?: SubscriptionPlanFeatures | Record<string, unknown>;
  turnoverMinGbp?: number;
  turnoverMaxGbp?: number | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type UpdateSubscriptionPlanPayload = Partial<CreateSubscriptionPlanPayload>;

/** `POST /api/subscriptions` — new `plans` (+ customer types), matrix, rules, limit, optional add-ons bundle. */
export type CreateSubscriptionBundlePricingMatrixRow = {
  minTurnover: number;
  maxTurnover?: number | null;
  price: number;
};

export type CreateSubscriptionBundleRule = {
  extendable: boolean;
  /** Omitted or 0 when `extendable` is false. */
  incrementStep?: number;
  incrementCost?: number;
};

export type CreateSubscriptionBundleLimits = {
  freePayrollLimit?: number;
  freePayrollUsers?: number;
};

export type CreateSubscriptionBundleAddons = {
  vatPercent: number;
  taxFilingVatEnabled: boolean;
  dormantEnabled: boolean;
  dormantCost: number;
  extraEmployeeCost: number;
};

export type CreateSubscriptionBundlePayload = {
  name: string;
  /** One or more customer type labels (e.g. Solo, Partnership, Limited Company). */
  customerTypes: string[];
  billingCycle: string;
  maxTurnover?: number | null;
  pricingMatrix: CreateSubscriptionBundlePricingMatrixRow[];
  rules: CreateSubscriptionBundleRule;
  limits: CreateSubscriptionBundleLimits;
  addons?: CreateSubscriptionBundleAddons;
};

export type CreateSubscriptionBundleResponse = {
  planId: string;
  pricingMatrixIds: string[];
  planRulesId: string;
  planLimitId: string;
  addonIds: string[];
};

/** `GET /api/subscriptions/services` — catalogue or plan-scoped list. */
export type CatalogServiceListItem = {
  planServiceId: string | null;
  serviceId: string;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  isIncluded: boolean;
};

/** Row from `GET /api/subscriptions/:planId` → `planServices`. */
export type PlanBundleServiceRow = {
  planServiceId: string;
  serviceId: string;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  isIncluded: boolean;
};

/** `GET /api/subscriptions/:planId` — full bundle for edit form. */
export type BundlePlanDetail = {
  id: string;
  isActive: boolean;
  name: string;
  customerTypes: string[];
  billingCycle: string;
  maxTurnover: number | null;
  pricingMatrix: CreateSubscriptionBundlePricingMatrixRow[];
  rules: CreateSubscriptionBundleRule;
  limits: { freePayrollLimit: number };
  addons: CreateSubscriptionBundleAddons;
  planServices?: PlanBundleServiceRow[];
};

/** `GET /api/subscriptions` — rows from `plans` plus summary for staff settings. */
export type BundlePlanListItem = {
  id: string;
  name: string;
  billingCycle: string;
  customerTypeNames: string[];
  maxTurnover: number | null;
  pricingBandCount: number;
  priceFrom: number;
  extendable: boolean;
  freePayrollLimit: number | null;
  isActive: boolean;
  assignedCustomerCount?: number;
};

/** `GET /api/subscriptions/:planId/assigned-customers` */
export type PlanAssignedCustomerRow = {
  id: string;
  name: string;
  accountStatus: string;
};

export type JobCostByProvider = {
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number | null;
  currency: string | null;
};

export type JobCostLine = {
  provider: string;
  model: string;
  tokenType: "input" | "output";
  tokens: number;
  pricePerMillion: number | null;
  currency: string | null;
  actualCost: number | null;
};

export type JobCostSummary = {
  byProvider: JobCostByProvider[];
  lines: JobCostLine[];
  totalEstimatedCost: number | null;
  currency: string | null;
  unpricedModelKeys: string[];
  executionCount: number;
};

export type TokenBurnModelRow = {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  executionCount: number;
  estimatedCost: number | null;
  currency: string | null;
};

export type TokenBurnCustomerRow = {
  customerId: string;
  customerName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  executionCount: number;
  estimatedCost: number | null;
  currency: string | null;
};

export type TokenBurnFileRow = {
  fileId: string | null;
  fileName: string | null;
  jobId: string;
  customerId: string;
  customerName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  executionCount: number;
  estimatedCost: number | null;
  currency: string | null;
};

export type TokenBurnPageRow = {
  jobId: string;
  fileId: string | null;
  fileName: string | null;
  pageNumber: number;
  customerId: string;
  customerName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  executionCount: number;
  estimatedCost: number | null;
  currency: string | null;
};

export type UnpricedModelRef = {
  provider: string;
  model: string;
};

export type TokenBurnReport = {
  from: string;
  to: string;
  customerId: string | null;
  byModel: TokenBurnModelRow[];
  byCustomer: TokenBurnCustomerRow[];
  byFile: TokenBurnFileRow[];
  byPage: TokenBurnPageRow[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    executionCount: number;
    estimatedCost: number | null;
    currency: string | null;
  };
  costIncomplete: boolean;
  unpricedModelKeys: string[];
  unpricedModels: UnpricedModelRef[];
};

export type AiPricingRow = {
  id: string;
  provider: string;
  model: string;
  inputTokenPrice: string;
  outputTokenPrice: string;
  currency: string;
  effectiveUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Persisted invoice row for customer listing (from `/api/customers/:id/invoices`). */
export type CustomerInvoiceRow = {
  financialDocumentId: string;
  jobId: string;
  fileId: string | null;
  documentId: string | null;
  fileName: string;
  pageStart: number;
  pageEnd: number;
  vendor: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  /** Sum of line amounts (null if no lines). */
  amount: number | null;
  /** Sum of line discounts (null if no lines). */
  discount: number | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string | null;
  status: string;
};

export type CustomerInvoiceLineRow = {
  lineIndex: number;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  discount: number | null;
  taxAmount: number | null;
};

/** Full invoice + lines from `GET /api/customers/:id/invoices/:financialDocumentId`. */
export type CustomerInvoiceDetail = CustomerInvoiceRow & {
  dueDate: string | null;
  notes: string | null;
  lineItemsDescription: string | null;
  customerName: string | null;
  customerAddress: string | null;
  validationJson: Record<string, unknown> | null;
  lineItems: CustomerInvoiceLineRow[];
};

/** Persisted statement row for customer listing (from `/api/customers/:id/statements`). */
export type CustomerStatementRow = {
  financialDocumentId: string;
  jobId: string;
  fileId: string | null;
  documentId: string | null;
  fileName: string;
  pageStart: number;
  pageEnd: number;
  accountHolder: string | null;
  bankName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  closingBalance: number | null;
  currency: string | null;
  status: string;
};

export type CustomerStatementLineRow = {
  lineIndex: number;
  date: string | null;
  description: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
};

/** Full statement + lines from `GET /api/customers/:id/statements/:financialDocumentId`. */
export type CustomerStatementDetail = CustomerStatementRow & {
  accountNumber: string | null;
  openingBalance: number | null;
  notes: string | null;
  validationJson: Record<string, unknown> | null;
  lineItems: CustomerStatementLineRow[];
};

export type PageTrace = { page: number; source: string; preview: string };

/** Multi-page financial pipeline (matches backend `FinancialJobResult`). */
export type DocumentValidation = {
  errors: string[];
  warnings: string[];
  codes?: string[];
};

export type FinancialDocumentRow = {
  id: string;
  type: "invoice" | "statement";
  metadata: {
    pageRange: { start: number; end: number };
    jobId: string;
    /** Legacy drive file; document-only jobs may omit. */
    fileId?: string | null;
    customerId: string;
  };
  status: string;
  invoice: unknown | null;
  statement: unknown | null;
};

export type SegmentRow = {
  id: string;
  jobId: string;
  fileId: string;
  customerId: string;
  pageNumber: number;
  text: string;
  textSource: string;
  type: string | null;
  classification: unknown | null;
  extractedData: unknown | null;
  status: string;
  financialDocumentId: string | null;
};

export type PipelineCheckpoint =
  | "text_layer_done"
  | "text_in_progress"
  | "text_extracted"
  | "llm_in_progress"
  | "structured"
  | "merged"
  | "complete";

export type JobDiagnosticEntry = {
  at: string;
  phase: string;
  message: string;
  meta?: Record<string, unknown>;
};

export type ExtractResponse = {
  pipelineCheckpoint?: PipelineCheckpoint;
  llmNextSegmentIndex?: number;
  textNextPageIndex?: number;
  combinedText?: string;
  pages?: PageTrace[];
  structured?: unknown;
  structuredRaw?: string;
  structuredParseError?: string | null;
  warnings?: string[];
  error?: string;
  detail?: string;
  /** Tenant / company scope (RLS). */
  customerId?: string;
  pipelineVersion?: 1;
  segments?: SegmentRow[];
  financialDocuments?: FinancialDocumentRow[];
  automatedSnapshot?: { segments: SegmentRow[]; financialDocuments: FinancialDocumentRow[] } | null;
  manualOverride?: { appliedAt?: string; note?: string } | null;
  /** Chronological extraction trace (also in server logs). */
  diagnosticLog?: JobDiagnosticEntry[];
};

/** Superadmin role editor: known API permission strings. */
export type PermissionCatalogEntry = {
  id: string;
  label: string;
  group: string;
};

export type AdminPermissionCatalogResponse = {
  entries: PermissionCatalogEntry[];
};

export type RoleType = "staff" | "portal";

export type AdminRoleRow = {
  id: string;
  name: string;
  roleType: RoleType;
  isSystem: boolean;
  description: string | null;
  permissions: string[];
  assignedUserCount: number;
  createdAt: string;
  updatedAt: string;
};

/** Staff directory: practice users (`customer_id` null), not customer portal logins. */
export type AdminPracticeUserRow = {
  id: string;
  email: string;
  isAdmin: boolean;
  phoneNumber: string | null;
  createdAt: string;
  roles: { id: string; name: string }[];
};

/** Returned when the server generated a password for a new practice user. */
export type AdminPracticeUserCreatedResponse = AdminPracticeUserRow & {
  initialPassword?: string;
};

export type DocumentAssigneeCandidate = {
  id: string;
  email: string;
  roleNames: string[];
};

export type DocumentAssigneeRow = {
  userId: string;
  email: string;
  roleNames: string[];
};

/** Manager/customer assignment row from `GET /api/admin/users/:id/customer-assignments`. */
export type AdminPracticeUserCustomerAssignmentRow = {
  customerId: string;
  customerName: string;
  assignedAt: string;
};

export type NotificationAudienceType =
  | "context_customer_portal_users"
  | "context_customer_admins"
  | "context_practice_staff_on_customer"
  | "all_portal_users"
  | "role"
  | "all_practice_staff_with_role";

export type NotificationAudienceRow = {
  id?: string;
  audience_type: NotificationAudienceType;
  role_id: string | null;
  role_name?: string | null;
};

export type NotificationEventConfigRow = {
  id: string;
  event_key: string;
  label: string;
  description: string | null;
  trigger_type: "event" | "manual";
  title_template: string;
  body_template: string;
  image_url_template: string | null;
  default_link_url: string | null;
  is_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  available_placeholders: string[];
  sort_order: number;
  audiences: NotificationAudienceRow[];
  created_at: string;
  updated_at: string;
};

export type DeadlineCampaignScheduleMode = "once" | "daily_once" | "daily_multi";

export type DeadlineCampaignRow = {
  id: string;
  name: string;
  date_field_id: string;
  date_field_label: string;
  schedule_mode: DeadlineCampaignScheduleMode;
  send_start_time: string;
  send_count_per_day: number;
  send_interval_hours: number;
  send_times: string[];
  schedule_summary: string;
  upcoming_enabled: boolean;
  upcoming_lead_days: number;
  overdue_enabled: boolean;
  overdue_lead_days: number;
  default_link_url: string | null;
  group_ids: string[];
  is_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  sort_order: number;
  audiences: NotificationAudienceRow[];
  created_at: string;
  updated_at: string;
};

export type DeadlineCampaignDateFieldOption = {
  id: string;
  label: string;
};

export type DeadlineCampaignPreviewCustomer = {
  customer_id: string;
  customer_name: string;
  due_date: string;
  phase: "upcoming" | "overdue";
  days_remaining: number | null;
  days_overdue: number | null;
};

export type DeadlineCampaignPreviewResult = {
  upcoming: DeadlineCampaignPreviewCustomer[];
  overdue: DeadlineCampaignPreviewCustomer[];
};

export type DeadlineEventRow = {
  date_field_id: string;
  label: string;
  sort_order: number;
  campaign: DeadlineCampaignRow | null;
};

export type InboxNotificationRow = {
  id: string;
  name: string;
  body: string;
  type: string;
  image_url: string | null;
  data: Record<string, unknown>;
  event_key: string | null;
  read_at: string | null;
  created_at: string;
};
