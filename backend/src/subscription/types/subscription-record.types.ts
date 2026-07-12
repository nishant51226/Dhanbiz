/** Body for `plan_rules` (use with `addPlanRules(planId, [rule])` — one row per plan). */
export type PlanRuleBodyInput = {
  extendable: boolean;
  /** When `extendable` is false, omitted or ignored (stored as 0). */
  incrementStep?: number;
  incrementCost?: number;
};

/** One row in `plan_addons` (VAT, tax filing, dormant, extra employee). */
export type PlanAddonSettingsInput = {
  vatPercent: number;
  taxFillingVatEnable: boolean;
  dormantEnable: boolean;
  dormantCost: number;
  extraEmployeeCost: number;
};

/** One turnover band for `plan_pricing_matrix` (maps to `turnover_min`, `turnover_max`, `price`). */
export type PlanPricingMatrixBandInput = {
  min: number;
  /** Upper bound inclusive; omit or `null` for no cap (open-ended band). */
  max?: number | null;
  price: number;
};

/** Response shape from `SubscriptionService.createSubscription`. */
export type CreateSubscriptionResult = {
  planId: string;
  pricingMatrixIds: string[];
  planRulesId: string;
  planLimitId: string;
  addonIds: string[];
};

/** One catalogue service, optionally scoped to a plan (`planServiceId` set when filtered by plan). */
export type CatalogServiceListItem = {
  planServiceId: string | null;
  serviceId: string;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  /** From `plan_service.is_included` when `planId` query is set; else from `services.is_included`. */
  isIncluded: boolean;
};

/** Services attached to a bundle plan (`GET /api/subscriptions/:planId`). */
export type PlanBundleServiceRow = {
  planServiceId: string;
  serviceId: string;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  isIncluded: boolean;
};

/** Full bundle plan for `GET /api/subscriptions/:planId` (edit form). */
export type BundlePlanDetailResponse = {
  id: string;
  isActive: boolean;
  name: string;
  customerTypes: string[];
  billingCycle: string;
  maxTurnover: number | null;
  pricingMatrix: { minTurnover: number; maxTurnover: number | null; price: number }[];
  rules: { extendable: boolean; incrementStep?: number; incrementCost?: number };
  limits: { freePayrollLimit: number };
  addons: {
    vatPercent: number;
    taxFilingVatEnabled: boolean;
    dormantEnabled: boolean;
    dormantCost: number;
    extraEmployeeCost: number;
  };
  /** Linked `services` for this plan (`plan_service` + catalogue fields). */
  planServices: PlanBundleServiceRow[];
};

/** One row from `GET /api/subscriptions` — `plans` + joined summary for staff UI. */
export type BundlePlanListItem = {
  id: string;
  name: string;
  billingCycle: string;
  /** Customer types this plan applies to (canonical names). */
  customerTypeNames: string[];
  maxTurnover: number | null;
  pricingBandCount: number;
  priceFrom: number;
  extendable: boolean;
  freePayrollLimit: number | null;
  isActive: boolean;
  /** Customers with `customers.plan_id` set to this plan. */
  assignedCustomerCount: number;
};

/** `GET /api/subscriptions/:planId/assigned-customers` */
export type PlanAssignedCustomerRow = {
  id: string;
  name: string;
  accountStatus: string;
};

/** Payload for inserting a row into `plans`. */
export type AddPlanInput = {
  name: string;
  billingCycle: string;
  /** One or more `customer_type.name` values (or aliases); deduped after resolve. */
  customerTypeNames: string[];
  maxTurnover: number | null;
  /** Defaults to true when omitted. */
  isActive?: boolean;
};

/** Fields persisted on `plan` only (no pricing, features, or turnover rows). */
export type CreatePlanRecordInput = {
  name: string;
  code: string;
  description?: string | null;
  sortOrder: number;
  billingCycle: string;
  isActive: boolean;
};

/** One row in `plan_pricing` for a given `plan_id`. */
export type CreatePlanPricingRecordInput = {
  planId: string;
  basePrice: number;
  freePayeeUsers: number;
  perExtraPayeeCost: number;
};

/** One element of `plan_features` before resolve to `feature_id` (use feature UUID or `code`). */
export type PlanFeatureItemInput = {
  feature: string;
  isActive: boolean;
};

/** Batch input for `plan_features`: one `plan_id` plus rows to insert (feature + included flag). */
export type CreatePlanFeaturesRecordInput = {
  planId: string;
  plan_features: PlanFeatureItemInput[];
};

/** One row in `turnover_rules` for a `plan_id` (optional open-ended band when `maxTurnover` is null). */
export type CreateTurnoverRuleRecordInput = {
  planId: string;
  minTurnover: number;
  maxTurnover?: number | null;
};

/** VAT-inclusive line items for onboarding recommend (`POST /api/subscriptions/recommend`). */
export type SubscriptionPlanPricingBreakdown = {
  base: number;
  turnoverExtra: number;
  payrollExtra: number;
  dormant: number;
  vat: number;
  final: number;
  /** Addon VAT % used for this plan (0 when unknown). */
  vatPercent?: number;
  /** Sum of monetary lines before VAT (base + extras + dormant). */
  subtotalBeforeVat?: number;
  /** Present when turnover extension blocks apply (`turnoverExtra` > 0). */
  turnoverExtensionDetail?: {
    blocks: number;
    step: number;
    costPerBlock: number;
    bandCeiling: number;
  };
  /** Present when extra payee charges apply (`payrollExtra` > 0). */
  payrollExtraDetail?: { extraPayees: number; ratePerPayee: number };
  /** Present when dormant flat fee applies (`dormant` > 0). */
  dormantDetail?: { flatFee: number };
};

/** Services linked to the plan on recommend (`included` | `addon`). Full-catalog `not_offered` rows are not returned. */
export type PlanRecommendFeatureRow = {
  serviceId: string;
  name: string;
  status: "included" | "addon" | "not_offered";
};

export type RecommendedSubscriptionPlanOption = {
  planId: string;
  plan: string;
  payrollLimit: number;
  pricing: SubscriptionPlanPricingBreakdown;
  /** All active catalogue services vs this plan’s `plan_service` links (onboarding cards). */
  featureMatrix?: PlanRecommendFeatureRow[];
};

export type RecommendSubscriptionPlansResponse = {
  recommendedPlan: string;
  plans: RecommendedSubscriptionPlanOption[];
  /**
   * True when strict matrix filters matched nothing; response lists every active plan for the requested
   * billing cycle with indicative pricing (lowest matrix band when turnover does not match a band).
   */
  billingCycleFallback?: boolean;
};
