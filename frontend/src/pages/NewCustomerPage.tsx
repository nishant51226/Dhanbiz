import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { portalRoleDisplayLabel } from "../utils/portalRoleLabel";
import { roleDisplayDescription } from "../utils/roleDescriptions";
import {
  createCustomer,
  createCustomerPortalUser,
  createCustomerFormSubmission,
  fetchCustomerPortalAssignableRoles,
  type PortalAssignableRoleRow,
  fetchCompaniesHouseSearch,
  fetchCompanyLookupByNumber,
  fetchCompanyRegistrationConflict,
  fetchCustomer,
  fetchLatestCustomerFormSubmission,
  fetchRecommendSubscriptionPlans,
  fetchSubscriptionCatalogServices,
  patchCustomer,
  patchCustomerFormSubmission,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { CustomerOnboardingWizard } from "../components/customer-onboarding/CustomerOnboardingWizard";
import {
  createEmptyCustomerOnboardingData,
  companyTypeFromOnboardingUrl,
  mergeCompanyLookup,
  reviveCustomerOnboarding,
  type CompaniesHouseSearchItem,
  type CompanyLookupPatch,
  type CustomerOnboardingData,
} from "../types/customerOnboarding";
import {
  createChangeAccountantPreviewUrl,
  createDirectDebitPreviewUrl,
  createHmrc648PreviewUrl,
  createOnboardingPdfPreviewUrl,
  downloadChangeAccountantPdf,
  downloadDirectDebitPdf,
  downloadHmrc648Pdf,
  downloadOnboardingPdf,
  onboardingPreviewStepForSignatureSlot,
} from "../utils/onboardingExportPdf";
import { normalizeOnboardingDataForPersist } from "../utils/onboardingSignatureFile";
import { isMatrixYearlyBilling } from "../utils/subscriptionPlanUi";
import { canFinishOnboarding, mergeDocusealSignaturesFromServer } from "../utils/onboardingSigningGate";
import type {
  CatalogServiceListItem,
  CustomerFormSubmission,
  OnboardingDocusealSignatureTarget,
  OnboardingSubscriptionPlanCard,
} from "../types/api";

const DRAFT_KEY = "newCustomerOnboardingDraft";

/** Persist matrix `plans.id` on the customer row (`plan_id`); onboarding JSON still keeps matrix/legacy fields. */
function matrixPlanIdForApi(data: CustomerOnboardingData): string | undefined {
  const mid = String(data.subscription_matrix_plan_id ?? "").trim();
  if (mid) return mid;
  return undefined;
}

function annualTurnoverGbpForCustomerApi(d: CustomerOnboardingData): number | undefined {
  const v = d.annual_turnover_gbp;
  if (v === null || v === undefined) return undefined;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

type StepExportAuth = { apiBase: string; headers: HeadersInit };

const STEP_EXPORT_CONFIG: Record<
  number,
  {
    title: string;
    previewUrl: (d: CustomerOnboardingData, auth?: StepExportAuth) => Promise<string>;
    download: (
      d: CustomerOnboardingData,
      auth?: StepExportAuth,
      options?: { blank?: boolean },
    ) => Promise<void>;
  }
> = {
  2: { title: "HMRC 64-8 Preview", previewUrl: createHmrc648PreviewUrl, download: downloadHmrc648Pdf },
  3: { title: "Change of Accountant Preview", previewUrl: createChangeAccountantPreviewUrl, download: downloadChangeAccountantPdf },
  4: { title: "Direct Debit Preview", previewUrl: createDirectDebitPreviewUrl, download: downloadDirectDebitPdf },
};

const stepExport = {
  async preview(
    apiBase: string,
    getHeaders: () => HeadersInit,
    data: CustomerOnboardingData,
    step: number,
  ): Promise<{ title: string; url: string }> {
    const auth: StepExportAuth = { apiBase, headers: getHeaders() };
    if (step === 1) {
      return {
        title: "Registration Form Preview",
        url: await createOnboardingPdfPreviewUrl(data, auth),
      };
    }
    const cfg = STEP_EXPORT_CONFIG[step] ?? STEP_EXPORT_CONFIG[2];
    return { title: cfg.title, url: await cfg.previewUrl(data, auth) };
  },
  async download(
    apiBase: string,
    getHeaders: () => HeadersInit,
    data: CustomerOnboardingData,
    step: number,
    options?: { blank?: boolean },
  ): Promise<void> {
    const auth: StepExportAuth = { apiBase, headers: getHeaders() };
    if (step === 1) {
      return downloadOnboardingPdf(data, auth, options);
    }
    const cfg = STEP_EXPORT_CONFIG[step] ?? STEP_EXPORT_CONFIG[2];
    return cfg.download(data, auth, options);
  },
};

function isCustomerPortalEmailOk(email: string): boolean {
  const t = email.trim().toLowerCase();
  if (t.length < 5 || t.length > 320) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function saveDraftBlob(
  step: number,
  data: CustomerOnboardingData,
  customerId?: string,
  submissionId?: string,
) {
  const payload: Record<string, unknown> = { step, data };
  if (customerId) payload.customerId = customerId;
  if (submissionId) payload.submissionId = submissionId;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
}

function looksLikeUkCompanyNumber(raw: string): boolean {
  const t = raw.replace(/\s/g, "").toUpperCase();
  if (/^\d{6,8}$/.test(t)) return true;
  return /^[A-Z]{2}\d{6}$/.test(t);
}

function normalizeChCompanyNumber(raw: string): string {
  const t = raw.replace(/\s/g, "").toUpperCase();
  if (/^\d+$/.test(t)) return t.padStart(8, "0");
  return t;
}

/** Companies House search page size (backend max 100). */
const CH_SEARCH_PAGE_SIZE = 50;
/** Companies House caps how far you can paginate search results. */
const CH_SEARCH_BROWSE_LIMIT = 5000;

function mergeCompanySearchItems(
  prev: CompaniesHouseSearchItem[],
  incoming: CompaniesHouseSearchItem[],
): CompaniesHouseSearchItem[] {
  const seen = new Set(prev.map((i) => normalizeChCompanyNumber(i.company_number)));
  const merged = [...prev];
  for (const item of incoming) {
    const key = normalizeChCompanyNumber(item.company_number);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

function companySearchHasMorePages(nextStartIndex: number, chTotalHits: number): boolean {
  return nextStartIndex < chTotalHits && nextStartIndex < CH_SEARCH_BROWSE_LIMIT;
}

function companySearchSummaryLabel(companyCount: number, chTotalHits: number, hasMore: boolean): string {
  const companies = `${companyCount} compan${companyCount === 1 ? "y" : "ies"}`;
  if (!hasMore) {
    return `Showing ${companies} (all loaded from Companies House)`;
  }
  return `Showing ${companies} (${chTotalHits.toLocaleString()} hits on Companies House — load more)`;
}

function companySearchListMessage(companyCount: number, chTotalHits: number, hasMore: boolean): string {
  if (hasMore) {
    return `${companySearchSummaryLabel(companyCount, chTotalHits, true)}. Select one to load the full profile.`;
  }
  return `Select a company to load the full profile (${companyCount} compan${companyCount === 1 ? "y" : "ies"}).`;
}

function chPatchHasMergeableData(patch: CompanyLookupPatch): boolean {
  const co = patch.company;
  const hasCo =
    !!co &&
    Object.values(co).some((v) =>
      typeof v === "string" ? v.trim().length > 0 : Boolean(v && typeof v === "object"),
    );
  const ch = patch.companies_house;
  return Boolean(hasCo || (ch && Object.keys(ch).length > 0));
}

export default function NewCustomerPage() {
  const [searchParams] = useSearchParams();
  const businessType = searchParams.get("type");
  const isSoleTrader = businessType === "sole_trader";
  const { customerId: resumeCustomerId } = useParams<{ customerId?: string }>();
  const isResume = Boolean(resumeCustomerId);
  const { apiBase, authHeaders, authRequired, customerId: portalCustomerId, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");
  const [lookupErr, setLookupErr] = useState("");
  const [companySearchResults, setCompanySearchResults] = useState<CompaniesHouseSearchItem[] | null>(null);
  const [companySearchTotal, setCompanySearchTotal] = useState<number | null>(null);
  /** CH `/search` start_index for the next page (raw hits, not company-only row count). */
  const [companySearchNextStartIndex, setCompanySearchNextStartIndex] = useState(0);
  const [companySearchLoadingMore, setCompanySearchLoadingMore] = useState(false);
  const [step, setStep] = useState(1);
  /** Step 5 review tab — drives which form Preview / Download PDF opens. */
  const [reviewSignatureForm, setReviewSignatureForm] =
    useState<OnboardingDocusealSignatureTarget>("client_registration");
  const [data, setData] = useState<CustomerOnboardingData>(() => {
    const base = createEmptyCustomerOnboardingData();
    if (isResume) return base;
    const fromUrl = companyTypeFromOnboardingUrl(businessType);
    if (!fromUrl || base.company.type.trim()) return base;
    return { ...base, company: { ...base.company, type: fromUrl } };
  });
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  /** Latest server form submission row (DocuSeal progress under `metadata.form_1`…`form_4`; status is draft | completed). */
  const [formSubmissionRow, setFormSubmissionRow] = useState<CustomerFormSubmission | null>(null);
  const [saveHint, setSaveHint] = useState("");
  const [draftErr, setDraftErr] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Shown after validations pass when the user clicks Create customer. */
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [err, setErr] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewTitle, setPreviewTitle] = useState("Preview");
  /** After successful registration: show portal credentials before navigating away. */
  const [postCreatePortal, setPostCreatePortal] = useState<{
    customerId: string;
    creds: { email: string; password: string } | null;
    credsErr: string;
  } | null>(null);
  const [resumeLoading, setResumeLoading] = useState(isResume);
  const [resumeErr, setResumeErr] = useState("");
  const [exportErr, setExportErr] = useState("");
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [subscriptionPlansForTurnover, setSubscriptionPlansForTurnover] = useState<
    OnboardingSubscriptionPlanCard[] | null
  >(null);
  const [subscriptionPlansForTurnoverLoading, setSubscriptionPlansForTurnoverLoading] = useState(false);
  const [subscriptionPlansForTurnoverErr, setSubscriptionPlansForTurnoverErr] = useState("");
  const [subscriptionPlansBillingCycleFallback, setSubscriptionPlansBillingCycleFallback] = useState(false);
  const [subscriptionFeaturesCatalog, setSubscriptionFeaturesCatalog] = useState<CatalogServiceListItem[] | null>(
    null,
  );
  const [subscriptionFeaturesLoading, setSubscriptionFeaturesLoading] = useState(true);
  const [subscriptionFeaturesErr, setSubscriptionFeaturesErr] = useState("");
  const [portalAssignableRoles, setPortalAssignableRoles] = useState<PortalAssignableRoleRow[]>([]);
  const [portalRolesLoading, setPortalRolesLoading] = useState(true);
  const [portalRolesErr, setPortalRolesErr] = useState("");
  const [portalUserRoleId, setPortalUserRoleId] = useState("");
  const [portalUserPassword, setPortalUserPassword] = useState("");
  const [companyRegConflict, setCompanyRegConflict] = useState<{ id: string; name: string } | null>(null);
  const [companyRegConflictLoading, setCompanyRegConflictLoading] = useState(false);
  const [companyRegConflictErr, setCompanyRegConflictErr] = useState("");
  const companyRegConflictRef = useRef<{ id: string; name: string } | null>(null);
  /** Serialize draft writes so autosave cannot overwrite an in-flight signature upload. */
  const saveDraftChainRef = useRef<Promise<boolean>>(Promise.resolve(true));

  const companyNameOk = data.company.name.trim().length > 0;

  const dataRef = useRef(data);
  const stepRef = useRef(step);
  const customerIdRef = useRef(customerId);
  const submissionIdRef = useRef(submissionId);
  /** Dedupes concurrent “create customer + submission” work from name debounce vs save paths. */
  const customerEnsurePromiseRef = useRef<Promise<boolean> | null>(null);
  dataRef.current = data;
  stepRef.current = step;
  customerIdRef.current = customerId;
  submissionIdRef.current = submissionId;
  companyRegConflictRef.current = companyRegConflict;

  useEffect(() => {
    let cancelled = false;
    setSubscriptionFeaturesLoading(true);
    setSubscriptionFeaturesErr("");
    void (async () => {
      try {
        const rows = await fetchSubscriptionCatalogServices(apiBase, authHeaders(), null, { activeOnly: true });
        if (!cancelled) setSubscriptionFeaturesCatalog(rows);
      } catch (e) {
        if (!cancelled) {
          setSubscriptionFeaturesCatalog([]);
          setSubscriptionFeaturesErr(e instanceof Error ? e.message : "Could not load subscription services");
        }
      } finally {
        if (!cancelled) setSubscriptionFeaturesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders]);

  const subscriptionSelectedServiceIdsKey = useMemo(
    () =>
      (data.subscription_selected_service_ids ?? [])
        .map((x) => String(x).trim())
        .filter(Boolean)
        .sort()
        .join("|"),
    [data.subscription_selected_service_ids],
  );

  /** Keep denormalised service names in sync with ids when the catalogue is available (PDF / exports). */
  useEffect(() => {
    const catalog = subscriptionFeaturesCatalog;
    if (!catalog?.length) return;
    setData((d) => {
      const ids = (d.subscription_selected_service_ids ?? []).map((x) => String(x).trim()).filter(Boolean);
      if (!ids.length) {
        if (!(d.subscription_selected_services ?? []).length) return d;
        return { ...d, subscription_selected_services: [] };
      }
      const services = ids.map((id) => {
        const row = catalog.find((c) => c.serviceId === id);
        return { id, name: (row?.name ?? "").trim() || id };
      });
      const prev = d.subscription_selected_services ?? [];
      const same =
        prev.length === services.length &&
        services.every((s, i) => prev[i]?.id === s.id && (prev[i]?.name ?? "") === s.name);
      if (same) return d;
      return { ...d, subscription_selected_services: services };
    });
  }, [subscriptionFeaturesCatalog, subscriptionSelectedServiceIdsKey]);

  /**
   * Deep links: `?type=partnership`, `?type=sole_trader`, `?type=limited`, … pre-fill `company.type`
   * when still empty (mirrors sole-trader behaviour so subscription matching and the plans button work).
   */
  useEffect(() => {
    if (isResume) return;
    const next = companyTypeFromOnboardingUrl(businessType);
    if (!next) return;
    setData((d) => {
      if (d.company.type.trim()) return d;
      return { ...d, company: { ...d.company, type: next } };
    });
  }, [businessType, isResume, setData]);

  const loadSubscriptionPlansForTurnover = useCallback(async () => {
    const t = data.annual_turnover_gbp;
    if (t === null || t === undefined || !Number.isFinite(t) || t < 0) return;
    const customerType = data.company.type.trim();
    if (!customerType) {
      setSubscriptionPlansForTurnoverErr("Choose a business / company type before loading plans.");
      return;
    }
    setSubscriptionPlansForTurnoverLoading(true);
    setSubscriptionPlansForTurnoverErr("");
    setSubscriptionPlansBillingCycleFallback(false);
    try {
      const billingRaw = String(data.subscription_billing_cycle ?? "monthly").trim().toLowerCase();
      const billingCycle = billingRaw === "yearly" || billingRaw === "monthly" ? billingRaw : "monthly";
      const payeeRaw = data.subscription_payee_users;
      const payeeUsers =
        payeeRaw === null || payeeRaw === undefined || !Number.isFinite(Number(payeeRaw))
          ? 0
          : Math.max(0, Math.floor(Number(payeeRaw)));
      const svcIds = (data.subscription_selected_service_ids ?? []).map((x) => String(x).trim()).filter(Boolean);
      const res = await fetchRecommendSubscriptionPlans(apiBase, authHeaders(), {
        customerType,
        billingCycle,
        turnover: t,
        payeeUsers,
        isDormant: isMatrixYearlyBilling(data.subscription_billing_cycle) && Boolean(data.subscription_is_dormant),
        ...(svcIds.length ? { serviceIds: [...new Set(svcIds)] } : {}),
      });
      const list: OnboardingSubscriptionPlanCard[] = res.plans.map((p) => ({
        id: p.planId,
        name: p.plan,
        recommended: Boolean(res.recommendedPlan && p.plan === res.recommendedPlan),
        payrollLimit: p.payrollLimit,
        pricing: p.pricing,
        featureMatrix: p.featureMatrix,
      }));
      setSubscriptionPlansForTurnover(list);
      setSubscriptionPlansBillingCycleFallback(Boolean(res.billingCycleFallback));
      setData((d) => {
        const mid = String(d.subscription_matrix_plan_id ?? "").trim();
        const legacy = String(d.subscription_plan_id ?? "").trim();
        const id = mid || legacy;
        if (!id) return d;
        if (!list.some((p) => p.id === id)) {
          return {
            ...d,
            subscription_matrix_plan_id: "",
            subscription_matrix_plan_name: "",
            subscription_matrix_plan_price_inc_vat_gbp: null,
            subscription_plan_id: "",
            subscription_plan_name: "",
          };
        }
        return d;
      });
    } catch (e) {
      setSubscriptionPlansForTurnoverErr(
        e instanceof Error ? e.message : "Could not load subscription plans",
      );
      setSubscriptionPlansForTurnover(null);
      setSubscriptionPlansBillingCycleFallback(false);
    } finally {
      setSubscriptionPlansForTurnoverLoading(false);
    }
  }, [
    apiBase,
    authHeaders,
    data.annual_turnover_gbp,
    data.company.type,
    data.subscription_billing_cycle,
    data.subscription_payee_users,
    data.subscription_is_dormant,
    data.subscription_selected_service_ids,
    setData,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPortalRolesLoading(true);
      setPortalRolesErr("");
      try {
        const list = await fetchCustomerPortalAssignableRoles(apiBase, authHeaders());
        if (!cancelled) {
          setPortalAssignableRoles(list);
          const preferred = list.find((r) => r.name === "customer_admin") ?? list[0];
          setPortalUserRoleId((id) => id || preferred?.id || "");
        }
      } catch (e) {
        if (!cancelled) {
          setPortalRolesErr(e instanceof Error ? e.message : "Could not load portal roles");
          setPortalAssignableRoles([]);
        }
      } finally {
        if (!cancelled) setPortalRolesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders]);

  /** When matrix recommend plans load, keep denormalised plan name in sync with the selected id. */
  useEffect(() => {
    if (!subscriptionPlansForTurnover?.length) return;
    setData((d) => {
      const mid = String(d.subscription_matrix_plan_id ?? "").trim();
      const legacy = String(d.subscription_plan_id ?? "").trim();
      const id = mid || legacy;
      if (!id) return d;
      const p = subscriptionPlansForTurnover.find((x) => x.id === id);
      if (!p) return d;
      const nm = p.name.trim();
      const final = p.pricing?.final;
      const quoted =
        typeof final === "number" && Number.isFinite(final) ? final : (d.subscription_matrix_plan_price_inc_vat_gbp ?? null);
      if (mid) {
        if (
          String(d.subscription_matrix_plan_name ?? "").trim() === nm &&
          String(d.subscription_plan_name ?? "").trim() === nm &&
          (d.subscription_matrix_plan_price_inc_vat_gbp ?? null) === (quoted ?? null)
        ) {
          return d;
        }
        return {
          ...d,
          subscription_matrix_plan_name: nm,
          subscription_plan_name: nm,
          ...(typeof final === "number" && Number.isFinite(final)
            ? { subscription_matrix_plan_price_inc_vat_gbp: final }
            : {}),
        };
      }
      if (String(d.subscription_plan_name ?? "").trim() === nm) return d;
      return { ...d, subscription_plan_name: nm };
    });
  }, [subscriptionPlansForTurnover, setData]);

  const refreshFormSubmissionRow = useCallback(async () => {
    if (!customerId) return;
    try {
      const latest = await fetchLatestCustomerFormSubmission(apiBase, authHeaders(), customerId);
      setFormSubmissionRow(latest);
      if (latest?.id) setSubmissionId(latest.id);

      /**
       * The DocuSeal webhook merges signed slots into `customer_form_submission.data.signatures`
       * on the server. Without copying that subtree into the wizard's local `data` state,
       * `signatureForSlot(data, slot)` keeps returning the empty pre-sign value and the Final
       * Review page sticks on "Not signed yet" until a full page reload. We only sync the
       * `signatures` subtree (and not the rest of `data`) so any unsaved field edits the user
       * is making elsewhere on the wizard are not clobbered.
       */
      const serverSignatures = (latest?.data as Record<string, unknown> | undefined)?.signatures;
      if (
        serverSignatures !== undefined &&
        serverSignatures !== null &&
        typeof serverSignatures === "object" &&
        !Array.isArray(serverSignatures)
      ) {
        setData((d) => ({
          ...d,
          signatures: mergeDocusealSignaturesFromServer(d.signatures, serverSignatures),
        }));
      }
    } catch {
      /* keep previous row */
    }
  }, [apiBase, authHeaders, customerId]);

  useEffect(() => {
    if (resumeCustomerId) {
      let cancelled = false;
      (async () => {
        setResumeErr("");
        setResumeLoading(true);
        try {
          const headers = authHeaders();
          const customer = await fetchCustomer(apiBase, headers, resumeCustomerId);
          if (cancelled) return;
          const latest = await fetchLatestCustomerFormSubmission(apiBase, headers, resumeCustomerId);
          if (cancelled) return;
          if (latest?.status === "completed") {
            navigate(`/customers/${resumeCustomerId}`, { replace: true });
            return;
          }
          setCustomerId(resumeCustomerId);
          if (latest) {
            setSubmissionId(latest.id);
            setFormSubmissionRow(latest);
            let revived = reviveCustomerOnboarding(latest.data);
            const fromCustomerPlan =
              typeof customer.planId === "string" && customer.planId.trim()
                ? customer.planId.trim()
                : typeof (customer as { subscriptionPlanId?: string }).subscriptionPlanId === "string"
                  ? String((customer as { subscriptionPlanId?: string }).subscriptionPlanId).trim()
                  : "";
            if (fromCustomerPlan && !String(revived.subscription_matrix_plan_id ?? "").trim()) {
              const nm =
                typeof customer.plan?.name === "string" && customer.plan.name.trim()
                  ? customer.plan.name.trim()
                  : "";
              revived = {
                ...revived,
                subscription_matrix_plan_id: fromCustomerPlan,
                ...(nm ? { subscription_matrix_plan_name: nm, subscription_plan_name: nm } : {}),
              };
            }
            const atRaw = customer.annualTurnoverGbp;
            if (atRaw !== null && atRaw !== undefined) {
              const atn = typeof atRaw === "number" ? atRaw : Number(atRaw);
              if (
                Number.isFinite(atn) &&
                atn >= 0 &&
                (revived.annual_turnover_gbp === null || revived.annual_turnover_gbp === undefined)
              ) {
                revived = { ...revived, annual_turnover_gbp: atn };
              }
            }
            setData(revived);
            const t = revived.annual_turnover_gbp;
            const ct = revived.company.type.trim();
            const billingRaw = String(revived.subscription_billing_cycle ?? "monthly").trim().toLowerCase();
            const billingCycle = billingRaw === "yearly" ? "yearly" : "monthly";
            const payeeRaw = revived.subscription_payee_users;
            const payeeUsers =
              payeeRaw === null || payeeRaw === undefined || !Number.isFinite(Number(payeeRaw))
                ? 0
                : Math.max(0, Math.floor(Number(payeeRaw)));
            if (typeof t === "number" && Number.isFinite(t) && t >= 0 && ct) {
              try {
                const svcIds = (revived.subscription_selected_service_ids ?? [])
                  .map((x) => String(x).trim())
                  .filter(Boolean);
                const res = await fetchRecommendSubscriptionPlans(apiBase, headers, {
                  customerType: ct,
                  billingCycle,
                  turnover: t,
                  payeeUsers,
                  isDormant:
                    isMatrixYearlyBilling(revived.subscription_billing_cycle) &&
                    Boolean(revived.subscription_is_dormant),
                  ...(svcIds.length ? { serviceIds: [...new Set(svcIds)] } : {}),
                });
                const list: OnboardingSubscriptionPlanCard[] = res.plans.map((p) => ({
                  id: p.planId,
                  name: p.plan,
                  recommended: Boolean(res.recommendedPlan && p.plan === res.recommendedPlan),
                  payrollLimit: p.payrollLimit,
                  pricing: p.pricing,
                  featureMatrix: p.featureMatrix,
                }));
                if (!cancelled) {
                  setSubscriptionPlansForTurnover(list);
                  setSubscriptionPlansForTurnoverErr("");
                }
              } catch (e) {
                if (!cancelled) {
                  setSubscriptionPlansForTurnover(null);
                  setSubscriptionPlansForTurnoverErr(
                    e instanceof Error ? e.message : "Could not load subscription plans",
                  );
                }
              }
            }
          } else {
            setFormSubmissionRow(null);
            const empty = createEmptyCustomerOnboardingData();
            setData({
              ...empty,
              company: { ...empty.company, name: customer.name ?? "" },
            });
          }
        } catch (e) {
          if (!cancelled) {
            setResumeErr(e instanceof Error ? e.message : "Could not load customer");
          }
        } finally {
          if (!cancelled) setResumeLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    return undefined;
  }, [apiBase, authHeaders, navigate, resumeCustomerId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(previewUrl);
        } catch {
          /* ignore revoke errors */
        }
      }
    };
  }, [previewUrl]);

  const refreshCompanyRegConflict = useCallback(
    async (numberRaw: string) => {
      if (isSoleTrader) {
        setCompanyRegConflict(null);
        setCompanyRegConflictErr("");
        companyRegConflictRef.current = null;
        return;
      }
      const num = numberRaw.replace(/\s/g, "").trim();
      if (!looksLikeUkCompanyNumber(num)) {
        setCompanyRegConflict(null);
        setCompanyRegConflictErr("");
        companyRegConflictRef.current = null;
        return;
      }
      setCompanyRegConflictLoading(true);
      setCompanyRegConflictErr("");
      try {
        const exclude = customerIdRef.current ?? resumeCustomerId ?? undefined;
        const r = await fetchCompanyRegistrationConflict(apiBase, authHeaders(), num, exclude);
        if (r.conflict && r.customerId) {
          const row = {
            id: r.customerId,
            name: (r.customerName ?? "Existing customer").trim() || "Existing customer",
          };
          setCompanyRegConflict(row);
          companyRegConflictRef.current = row;
        } else {
          setCompanyRegConflict(null);
          companyRegConflictRef.current = null;
        }
      } catch (e) {
        setCompanyRegConflictErr(e instanceof Error ? e.message : "Could not verify registration number");
        setCompanyRegConflict(null);
        companyRegConflictRef.current = null;
      } finally {
        setCompanyRegConflictLoading(false);
      }
    },
    [apiBase, authHeaders, isSoleTrader, resumeCustomerId],
  );

  useEffect(() => {
    if (isSoleTrader) {
      setCompanyRegConflict(null);
      setCompanyRegConflictErr("");
      setCompanyRegConflictLoading(false);
      companyRegConflictRef.current = null;
      return;
    }
    const num = data.company.number.trim();
    if (!looksLikeUkCompanyNumber(num)) {
      setCompanyRegConflict(null);
      setCompanyRegConflictErr("");
      setCompanyRegConflictLoading(false);
      companyRegConflictRef.current = null;
      return;
    }
    const t = window.setTimeout(() => {
      void refreshCompanyRegConflict(num);
    }, 450);
    return () => window.clearTimeout(t);
  }, [data.company.number, isSoleTrader, refreshCompanyRegConflict, customerId, resumeCustomerId]);

  const runCompanyLookup = useCallback(async () => {
    const q = searchQuery.trim();
    setLookupErr("");
    setLookupMsg("");
    setCompanySearchResults(null);
    setCompanySearchTotal(null);
    setCompanySearchNextStartIndex(0);
    if (q.length < 2) {
      setLookupErr("Enter at least 2 characters to search.");
      return;
    }
    setLookupLoading(true);
    try {
      const search = await fetchCompaniesHouseSearch(apiBase, authHeaders(), q, {
        itemsPerPage: CH_SEARCH_PAGE_SIZE,
      });
      const items = search.items;

      let profileNumber: string | null = null;
      if (items.length === 1 && search.total_results === 1) {
        profileNumber = items[0].company_number.trim();
      } else if (looksLikeUkCompanyNumber(q)) {
        const want = normalizeChCompanyNumber(q);
        const hit = items.find((i) => normalizeChCompanyNumber(i.company_number) === want);
        if (hit) profileNumber = hit.company_number.trim();
      }

      let profileFetchFailed = false;
      let profileReturnedEmpty = false;
      if (profileNumber) {
        try {
          const patch = await fetchCompanyLookupByNumber(apiBase, authHeaders(), profileNumber);
          if (chPatchHasMergeableData(patch)) {
            setData((d) => mergeCompanyLookup(d, patch));
            setCompanySearchResults(null);
            setCompanySearchTotal(null);
            setCompanySearchNextStartIndex(0);
            await refreshCompanyRegConflict(profileNumber);
            setLookupMsg(
              "Companies House search and full company profile loaded — form fields updated below.",
            );
            return;
          }
          profileReturnedEmpty = true;
        } catch (e) {
          setLookupErr(e instanceof Error ? e.message : "Company profile request failed");
          profileFetchFailed = true;
        }
      }

      setCompanySearchResults(items);
      setCompanySearchTotal(search.total_results);
      setCompanySearchNextStartIndex(search.next_start_index);
      if (items.length === 0) {
        setLookupMsg("No companies matched. Try another search term.");
      } else if (profileFetchFailed) {
        setLookupMsg("Search completed. Select a company below to load the full profile.");
      } else if (profileReturnedEmpty) {
        setLookupMsg("Search OK, but the company profile had no usable fields. Select a row below.");
      } else {
        setLookupMsg(
          companySearchListMessage(
            items.length,
            search.total_results,
            companySearchHasMorePages(search.next_start_index, search.total_results),
          ),
        );
      }
    } catch (e) {
      setLookupErr(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLookupLoading(false);
    }
  }, [apiBase, authHeaders, searchQuery, refreshCompanyRegConflict]);

  const companySearchHasMore = useMemo(() => {
    if (companySearchTotal == null) return false;
    return companySearchHasMorePages(companySearchNextStartIndex, companySearchTotal);
  }, [companySearchNextStartIndex, companySearchTotal]);

  const loadMoreCompanySearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (q.length < 2 || !companySearchResults?.length || companySearchLoadingMore) return;
    if (companySearchTotal == null || !companySearchHasMorePages(companySearchNextStartIndex, companySearchTotal)) {
      return;
    }
    setCompanySearchLoadingMore(true);
    setLookupErr("");
    try {
      let merged = companySearchResults;
      let nextIndex = companySearchNextStartIndex;
      let chTotal = companySearchTotal;
      const before = merged.length;
      /** Skip CH pages that only contain officers / other non-company hits. */
      const maxPages = 20;
      for (let page = 0; page < maxPages && companySearchHasMorePages(nextIndex, chTotal); page += 1) {
        const search = await fetchCompaniesHouseSearch(apiBase, authHeaders(), q, {
          startIndex: nextIndex,
          itemsPerPage: CH_SEARCH_PAGE_SIZE,
        });
        chTotal = search.total_results;
        merged = mergeCompanySearchItems(merged, search.items);
        nextIndex = search.next_start_index;
        if (merged.length > before) break;
        if (search.items.length === 0 && nextIndex >= chTotal) break;
      }
      setCompanySearchTotal(chTotal);
      setCompanySearchNextStartIndex(nextIndex);
      setCompanySearchResults(merged);
      const hasMore = companySearchHasMorePages(nextIndex, chTotal);
      setLookupMsg(companySearchListMessage(merged.length, chTotal, hasMore));
    } catch (e) {
      setLookupErr(e instanceof Error ? e.message : "Could not load more results");
    } finally {
      setCompanySearchLoadingMore(false);
    }
  }, [
    apiBase,
    authHeaders,
    companySearchResults,
    companySearchLoadingMore,
    companySearchNextStartIndex,
    companySearchTotal,
    searchQuery,
  ]);

  const applyCompanyFromSearch = useCallback(
    async (companyNumber: string) => {
      const num = companyNumber.replace(/\s/g, "").toUpperCase();
      if (!num) return;
      setLookupErr("");
      setLookupMsg("");
      setLookupLoading(true);
      try {
        const patch = await fetchCompanyLookupByNumber(apiBase, authHeaders(), num);
        if (!chPatchHasMergeableData(patch)) {
          setLookupMsg("No company details returned.");
          return;
        }
        setData((d) => mergeCompanyLookup(d, patch));
        setCompanySearchResults(null);
        setCompanySearchTotal(null);
        setCompanySearchNextStartIndex(0);
        await refreshCompanyRegConflict(num);
        setLookupMsg("Company details applied to the form below.");
      } catch (e) {
        setLookupErr(e instanceof Error ? e.message : "Could not load company");
      } finally {
        setLookupLoading(false);
      }
    },
    [apiBase, authHeaders, refreshCompanyRegConflict],
  );

  /**
   * Creates the server customer + form submission once the company name is set (no draft before that).
   * Idempotent; concurrent callers share one in-flight promise.
   */
  const ensureCustomerRowExists = useCallback(async (): Promise<boolean> => {
    if (customerIdRef.current && submissionIdRef.current) return true;

    if (!customerEnsurePromiseRef.current) {
      customerEnsurePromiseRef.current = (async (): Promise<boolean> => {
        try {
          const raw = dataRef.current;
          const nm = raw.company.name.trim();
          if (!nm) return false;

          const headers = authHeaders();

          const num = raw.company.number?.replace(/\s/g, "").trim() ?? "";
          if (!isSoleTrader && num && looksLikeUkCompanyNumber(num)) {
            const exclude = customerIdRef.current ?? resumeCustomerId ?? undefined;
            const r = await fetchCompanyRegistrationConflict(apiBase, headers, num, exclude);
            if (r.conflict && r.customerId) {
              const row = {
                id: r.customerId,
                name: (r.customerName ?? "Existing customer").trim() || "Existing customer",
              };
              setCompanyRegConflict(row);
              companyRegConflictRef.current = row;
              return false;
            }
          }

          if (!customerIdRef.current) {
            const created = await createCustomer(apiBase, headers, {
              name: nm,
              planId: matrixPlanIdForApi(raw),
              ...(annualTurnoverGbpForCustomerApi(raw) !== undefined
                ? { annualTurnoverGbp: annualTurnoverGbpForCustomerApi(raw) }
                : {}),
            });
            const cid = created.id;
            customerIdRef.current = cid;
            setCustomerId(cid);
            const payload = await normalizeOnboardingDataForPersist(apiBase, headers, cid, raw);
            setData(payload);
            const submission = await createCustomerFormSubmission(apiBase, headers, cid, payload, {
              wizardStep: stepRef.current,
            });
            submissionIdRef.current = submission.id;
            setSubmissionId(submission.id);
            setFormSubmissionRow(submission);
            saveDraftBlob(stepRef.current, payload, cid, submission.id);
            return true;
          }

          if (!submissionIdRef.current) {
            const cid = customerIdRef.current!;
            const raw2 = dataRef.current;
            const payload = await normalizeOnboardingDataForPersist(apiBase, headers, cid, raw2);
            setData(payload);
            const submission = await createCustomerFormSubmission(apiBase, headers, cid, payload, {
              wizardStep: stepRef.current,
            });
            submissionIdRef.current = submission.id;
            setSubmissionId(submission.id);
            setFormSubmissionRow(submission);
            saveDraftBlob(stepRef.current, payload, cid, submission.id);
            return true;
          }

          return true;
        } catch {
          return false;
        } finally {
          customerEnsurePromiseRef.current = null;
        }
      })();
    }

    return customerEnsurePromiseRef.current!;
  }, [apiBase, authHeaders, isSoleTrader, resumeCustomerId]);

  /** Minimal server row for DocuSeal remote signing (name + submission only). */
  const ensureServerCustomerAndSubmission = useCallback(async (): Promise<{
    customerId: string;
    submissionId: string;
  } | null> => {
    const ok = await ensureCustomerRowExists();
    const cid = customerIdRef.current;
    const sid = submissionIdRef.current;
    if (!ok || !cid || !sid) return null;
    return { customerId: cid, submissionId: sid };
  }, [ensureCustomerRowExists]);

  const saveDraftCore = useCallback(
    async (
      wizardStep: number,
      source: CustomerOnboardingData,
      opts?: { silent?: boolean },
    ): Promise<boolean> => {
      const run = async (): Promise<boolean> => {
        const silent = Boolean(opts?.silent);
        const name = source.company.name.trim();

        if (!name) {
          if (silent) return true;
          setDraftErr("Enter a company name before saving a draft.");
          return false;
        }

        if (!silent) setDraftErr("");

        if (!isSoleTrader && companyRegConflictRef.current) {
          if (!silent) {
            setDraftErr(
              "This company registration number is already in use by another customer. Change it before saving, or open the existing customer.",
            );
          }
          return false;
        }

        try {
          const okEnsure = await ensureCustomerRowExists();
          const cid = customerIdRef.current;
          const sid = submissionIdRef.current;
          if (!okEnsure || !cid || !sid) {
            if (!silent) setDraftErr("Could not create or load the customer draft on the server.");
            return false;
          }

          const headers = authHeaders();
          let payload = source;

          payload = await normalizeOnboardingDataForPersist(apiBase, headers, cid, payload);
          setData(payload);
          dataRef.current = payload;
          await patchCustomer(apiBase, headers, cid, {
            name,
            onboardingData: payload,
            planId: matrixPlanIdForApi(source),
            ...(annualTurnoverGbpForCustomerApi(source) !== undefined
              ? { annualTurnoverGbp: annualTurnoverGbpForCustomerApi(source) }
              : {}),
          });

          const updated = await patchCustomerFormSubmission(apiBase, headers, cid, sid, {
            data: payload,
            wizardStep: wizardStep,
          });
          setFormSubmissionRow(updated);

          saveDraftBlob(wizardStep, payload, cid, sid);
          if (!silent) {
            setSaveHint("Draft saved");
            window.setTimeout(() => setSaveHint(""), 2500);
          }
          return true;
        } catch (e) {
          if (!silent) setDraftErr(e instanceof Error ? e.message : "Could not save draft");
          return false;
        }
      };

      const chained = saveDraftChainRef.current.catch(() => false).then(run);
      saveDraftChainRef.current = chained;
      return chained;
    },
    [apiBase, authHeaders, ensureCustomerRowExists, isSoleTrader],
  );

  const handleSaveDraft = async (dataOverride?: CustomerOnboardingData): Promise<boolean> => {
    setDraftErr("");
    setDraftSaving(true);
    try {
      return await saveDraftCore(step, dataOverride ?? data, { silent: false });
    } finally {
      setDraftSaving(false);
    }
  };

  const handleWizardStepChange = useCallback(
    (nextStep: number) => {
      if (
        nextStep > stepRef.current &&
        stepRef.current === 1 &&
        !isSoleTrader &&
        (companyRegConflictRef.current || companyRegConflictLoading)
      ) {
        return;
      }
      setStep(nextStep);
      if (!dataRef.current.company.name.trim()) return;
      if (!customerIdRef.current) return;
      void saveDraftCore(nextStep, dataRef.current, { silent: true });
    },
    [saveDraftCore, isSoleTrader, companyRegConflictLoading],
  );

  /** Create server customer + submission once the company name is present (new registration only). */
  useEffect(() => {
    if (isResume || resumeLoading) return;
    if (customerId) return;
    if (!data.company.name.trim()) return;
    const id = window.setTimeout(() => {
      void ensureCustomerRowExists();
    }, 700);
    return () => window.clearTimeout(id);
  }, [data, isResume, resumeLoading, customerId, ensureCustomerRowExists]);

  /** Debounced server + device draft after a customer row exists (silent; no “Saving…” on toolbar). */
  useEffect(() => {
    if (resumeLoading) return;
    if (!customerId) return;
    if (!data.company.name.trim()) return;
    const id = window.setTimeout(() => {
      void saveDraftCore(stepRef.current, dataRef.current, { silent: true });
    }, 1600);
    return () => window.clearTimeout(id);
  }, [data, step, customerId, resumeLoading, saveDraftCore]);

  /** Flush device draft on close/hide only once a server customer exists (no persistence before name). */
  useEffect(() => {
    const flushLocal = () => {
      if (!dataRef.current.company.name.trim()) return;
      if (!customerIdRef.current) return;
      saveDraftBlob(
        stepRef.current,
        dataRef.current,
        customerIdRef.current,
        submissionIdRef.current ?? undefined,
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushLocal();
    };
    window.addEventListener("pagehide", flushLocal);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushLocal);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const getFinishBlocker = (): { message: string; step?: number } | null => {
    if (step !== 5) {
      return { message: "Use Review & Sign to complete signatures and create the customer.", step: 5 };
    }
    const name = data.company.name.trim();
    if (!name) {
      return { message: "Company name is required (step 1).", step: 1 };
    }
    if (!isSoleTrader && companyRegConflict) {
      return {
        message: `This registration number is already used by “${companyRegConflict.name}”. Change it on step 1 or open that customer — you cannot create a duplicate.`,
        step: 1,
      };
    }
    if (!canFinishOnboarding(data, formSubmissionRow?.metadata, formSubmissionRow?.data)) {
      return {
        message: "Complete all four signatures on step 5 (on-device or via DocuSeal) before finishing.",
      };
    }
    if (!isCustomerPortalEmailOk(data.contact.email)) {
      return { message: "Enter a valid customer portal email on this step before creating the customer." };
    }
    if (!portalUserRoleId) {
      return { message: "Select a portal user role on step 5 before finishing." };
    }
    if (portalRolesErr) {
      return { message: "Portal roles could not be loaded. Refresh the page and try again." };
    }
    const pw = portalUserPassword.trim();
    if (pw.length > 0 && pw.length < 8) {
      return { message: "Portal password must be at least 8 characters, or leave it blank to generate one." };
    }
    return null;
  };

  const handleFinishRequest = () => {
    const blocker = getFinishBlocker();
    if (blocker) {
      setErr(blocker.message);
      if (blocker.step !== undefined) handleWizardStepChange(blocker.step);
      return;
    }
    setErr("");
    setConfirmCreateOpen(true);
  };

  const executeFinish = async () => {
    setConfirmCreateOpen(false);
    setErr("");
    setSaving(true);
    try {
      const name = data.company.name.trim();
      const headers = authHeaders();
      const reg = data.company.number.replace(/\s/g, "").trim();
      if (!isSoleTrader && reg && looksLikeUkCompanyNumber(reg)) {
        const exclude = customerId ?? resumeCustomerId ?? undefined;
        const r = await fetchCompanyRegistrationConflict(apiBase, headers, reg, exclude);
        if (r.conflict && r.customerId) {
          setCompanyRegConflict({
            id: r.customerId,
            name: (r.customerName ?? "Existing customer").trim() || "Existing customer",
          });
          setErr(
            `This registration number is already used by “${r.customerName ?? "another customer"}”. Resolve it on step 1 before creating.`,
          );
          setSaving(false);
          return;
        }
      }
      let cid = customerId;
      let sid = submissionId;
      let payload = data;

      if (!cid) {
        const created = await createCustomer(apiBase, headers, {
          name,
          planId: matrixPlanIdForApi(payload),
          ...(annualTurnoverGbpForCustomerApi(payload) !== undefined
            ? { annualTurnoverGbp: annualTurnoverGbpForCustomerApi(payload) }
            : {}),
        });
        cid = created.id;
        setCustomerId(cid);
        payload = await normalizeOnboardingDataForPersist(apiBase, headers, cid, payload);
        setData(payload);
        await patchCustomer(apiBase, headers, cid, {
          name,
          onboardingData: payload,
          planId: matrixPlanIdForApi(payload),
          ...(annualTurnoverGbpForCustomerApi(payload) !== undefined
            ? { annualTurnoverGbp: annualTurnoverGbpForCustomerApi(payload) }
            : {}),
        });
      } else {
        payload = await normalizeOnboardingDataForPersist(apiBase, headers, cid, payload);
        setData(payload);
        await patchCustomer(apiBase, headers, cid, {
          name,
          onboardingData: payload,
          planId: matrixPlanIdForApi(payload),
          ...(annualTurnoverGbpForCustomerApi(payload) !== undefined
            ? { annualTurnoverGbp: annualTurnoverGbpForCustomerApi(payload) }
            : {}),
        });
      }

      if (!sid) {
        const sub = await createCustomerFormSubmission(apiBase, headers, cid, payload, { wizardStep: 5 });
        sid = sub.id;
        setSubmissionId(sid);
      }

      await patchCustomerFormSubmission(apiBase, headers, cid, sid, {
        data: payload,
        status: "completed",
        wizardStep: 5,
      });

      localStorage.removeItem(DRAFT_KEY);

      let creds: { email: string; password: string } | null = null;
      let credsErr = "";
      try {
        creds = await createCustomerPortalUser(apiBase, headers, cid, {
          email: payload.contact.email.trim().toLowerCase(),
          roleId: portalUserRoleId,
          password: portalUserPassword.trim() || undefined,
        });
      } catch (e) {
        credsErr = e instanceof Error ? e.message : "Could not create portal login";
      }
      setPostCreatePortal({ customerId: cid, creds, credsErr });
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!confirmCreateOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmCreateOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmCreateOpen]);

  if (resumeLoading) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <Link to="/customers" className="text-sm text-brand hover:underline">
          ← Customers
        </Link>
        <p className="text-sm text-muted">Loading registration…</p>
      </div>
    );
  }

  if (resumeErr) {
    return (
      <div className="w-full min-w-0 space-y-4">
        <Link to="/customers" className="text-sm text-brand hover:underline">
          ← Customers
        </Link>
        <p className="text-sm text-red-400">{resumeErr}</p>
      </div>
    );
  }

  const signaturesComplete = canFinishOnboarding(data, formSubmissionRow?.metadata, formSubmissionRow?.data);
  const portalEmailOk = isCustomerPortalEmailOk(data.contact.email);
  const postSignatureContent = (
    <section className="space-y-3 rounded-xl border border-border bg-surface-raised p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-ink">Customer Portal Email</h2>
      <p className="text-sm text-muted">
        This address is used to create the customer&apos;s own login (not a staff admin). Choose their role and an
        optional password; if you leave password blank, a generated one is shown after registration.
      </p>
      <label className="block max-w-md">
        <span className="mb-1 block text-sm font-medium text-ink-soft">Email for Customer Login</span>
        <input
          type="text"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          value={data.contact.email}
          onChange={(e) =>
            setData((d) => ({
              ...d,
              contact: { ...d.contact, email: e.target.value },
            }))
          }
          className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          placeholder="name@company.com"
        />
      </label>
      {!portalEmailOk ? (
        <p className="text-sm text-amber-200">Enter a valid email before creating the customer.</p>
      ) : null}
      {portalRolesLoading ? <p className="text-sm text-muted">Loading portal roles…</p> : null}
      {portalRolesErr ? <p className="text-sm text-red-400">{portalRolesErr}</p> : null}
      {!portalRolesLoading && portalAssignableRoles.length === 0 && !portalRolesErr ? (
        <p className="text-sm text-amber-200">No assignable portal roles. Add roles in Settings, then refresh.</p>
      ) : null}
      <label className="block max-w-md">
        <span className="mb-1 block text-sm font-medium text-ink-soft">Portal role</span>
        <select
          value={portalUserRoleId}
          onChange={(e) => setPortalUserRoleId(e.target.value)}
          disabled={portalRolesLoading || portalAssignableRoles.length === 0}
          className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {portalAssignableRoles.map((r) => (
            <option key={r.id} value={r.id}>
              {portalRoleDisplayLabel(r.name, r.permissions)}
            </option>
          ))}
        </select>
        {portalUserRoleId ? (
          <p className="mt-1 text-xs text-muted">
            {roleDisplayDescription(
              portalAssignableRoles.find((r) => r.id === portalUserRoleId) ?? { name: "", description: null },
            ) ?? "Standard portal access."}
          </p>
        ) : null}
      </label>
      <label className="block max-w-md">
        <span className="mb-1 block text-sm font-medium text-ink-soft">Password (optional)</span>
        <input
          type="password"
          autoComplete="new-password"
          value={portalUserPassword}
          onChange={(e) => setPortalUserPassword(e.target.value)}
          placeholder="At least 8 characters, or leave blank to generate"
          className="w-full rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </label>
    </section>
  );

  const finishDisabled =
    step !== 5 ||
    saving ||
    !signaturesComplete ||
    !portalEmailOk ||
    !portalUserRoleId ||
    portalRolesLoading ||
    Boolean(portalRolesErr) ||
    (portalUserPassword.trim().length > 0 && portalUserPassword.trim().length < 8) ||
    Boolean(!isSoleTrader && companyRegConflict);

  const nextDisabled =
    step === 1 &&
    !isSoleTrader &&
    (Boolean(companyRegConflict) || companyRegConflictLoading);

  if (authRequired && portalCustomerId && !isAdmin) {
    if (!resumeCustomerId || resumeCustomerId !== portalCustomerId) {
      return <Navigate to="/portal" replace />;
    }
  }

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/customers" className="text-sm text-brand hover:underline">
          ← Customers
        </Link>
        <h1 className="text-xl font-semibold text-ink">
          {isResume ? "Continue registration" : "New customer"}
        </h1>
        <div className="ml-auto flex flex-col items-end gap-1">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setExportErr("");
                void (async () => {
                  try {
                    const previewStep =
                      step === 5 ? onboardingPreviewStepForSignatureSlot(reviewSignatureForm) : step;
                    const { title, url } = await stepExport.preview(
                      apiBase,
                      authHeaders,
                      dataRef.current,
                      previewStep,
                    );
                    if (url.startsWith("blob:")) {
                      if (previewUrl && previewUrl !== url && previewUrl.startsWith("blob:")) {
                        try {
                          URL.revokeObjectURL(previewUrl);
                        } catch {
                          /* ignore revoke errors */
                        }
                      }
                      setPreviewTitle(title);
                      setPreviewUrl(url);
                      setPreviewOpen(true);
                    } else {
                      navigate("/customers/onboarding-preview", {
                        state: { title, url },
                      });
                    }
                  } catch (e) {
                    setExportErr(e instanceof Error ? e.message : "Preview failed");
                  }
                })();
              }}
              className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted"
            >
              Preview
            </button>
            <button
              type="button"
              disabled={pdfDownloading}
              onClick={() => {
                setExportErr("");
                setPdfDownloading(true);
                const downloadStep =
                  step === 5 ? onboardingPreviewStepForSignatureSlot(reviewSignatureForm) : step;
                void stepExport
                  .download(apiBase, authHeaders, dataRef.current, downloadStep)
                  .catch((e) => setExportErr(e instanceof Error ? e.message : "PDF download failed"))
                  .finally(() => setPdfDownloading(false));
              }}
              className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted disabled:opacity-50"
            >
              {pdfDownloading ? "Preparing\u2026" : "Download PDF"}
            </button>
            <button
              type="button"
              disabled={pdfDownloading}
              title="Empty layout with no prefilled values — upload to DocuSeal to build your template"
              onClick={() => {
                setExportErr("");
                setPdfDownloading(true);
                const downloadStep =
                  step === 5 ? onboardingPreviewStepForSignatureSlot(reviewSignatureForm) : step;
                void stepExport
                  .download(apiBase, authHeaders, dataRef.current, downloadStep, { blank: true })
                  .catch((e) =>
                    setExportErr(e instanceof Error ? e.message : "Blank template download failed"),
                  )
                  .finally(() => setPdfDownloading(false));
              }}
              className="rounded-lg border border-dashed border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-muted hover:text-ink disabled:opacity-50"
            >
              {pdfDownloading ? "Preparing\u2026" : "Download blank template"}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              disabled={!companyNameOk || draftSaving}
              title={
                !companyNameOk && !draftSaving
                  ? "Enter the company name in step 1 to save a draft"
                  : undefined
              }
              className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {draftSaving ? "Saving…" : "Save draft"}
            </button>
          </div>
          {saveHint ? <span className="text-xs font-medium text-emerald-400">{saveHint}</span> : null}
        </div>
      </div>
      {exportErr ? <p className="text-sm text-red-400">{exportErr}</p> : null}

      {!isSoleTrader && step === 1 ? (
      <section className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm sm:p-5">
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-sm font-medium text-ink-soft">Company name or registration</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void runCompanyLookup();
                }
              }}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              placeholder="e.g. Acme Ltd or 04910341"
            />
          </label>
          <button
            type="button"
            onClick={() => void runCompanyLookup()}
            disabled={lookupLoading}
            className="shrink-0 btn btn-primary btn-md"
          >
            {lookupLoading ? "Searching…" : "Search"}
          </button>
        </div>
        {lookupErr ? <p className="mt-2 text-sm text-red-400">{lookupErr}</p> : null}
        {lookupMsg ? <p className="mt-2 text-sm text-emerald-400">{lookupMsg}</p> : null}
        {companySearchResults && companySearchResults.length > 0 ? (
          <div className="mt-3">
            <p className="mb-2 px-0.5 text-xs text-muted">
              {companySearchTotal != null
                ? companySearchSummaryLabel(
                    companySearchResults.length,
                    companySearchTotal,
                    companySearchHasMore,
                  )
                : `${companySearchResults.length} match${companySearchResults.length === 1 ? "" : "es"}`}
            </p>
            <div className="overflow-hidden rounded-lg border border-border bg-surface-muted/90">
              <ul className="max-h-72 space-y-1 overflow-y-auto p-2">
                {companySearchResults.map((row) => (
                  <li key={`${row.company_number}-${row.title}`}>
                    <button
                      type="button"
                      disabled={lookupLoading || companySearchLoadingMore}
                      onClick={() => void applyCompanyFromSearch(row.company_number)}
                      className="w-full rounded-md border border-transparent px-2 py-2 text-left text-sm transition-colors hover:border-border hover:bg-surface-raised disabled:opacity-50"
                    >
                      <span className="font-medium text-ink">{row.title}</span>
                      <span className="ml-2 font-mono text-muted">{row.company_number}</span>
                      <span className="ml-2 text-xs uppercase text-muted">{row.company_status}</span>
                      {row.address_snippet ? (
                        <div className="mt-0.5 text-xs text-muted">{row.address_snippet}</div>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
              {companySearchHasMore ? (
                <div className="flex justify-center border-t border-border bg-surface-muted/95 px-3 py-2.5">
                  <button
                    type="button"
                    disabled={lookupLoading || companySearchLoadingMore}
                    onClick={() => void loadMoreCompanySearch()}
                    className="rounded-lg border border-border bg-surface-raised px-5 py-1.5 text-sm font-semibold text-ink shadow-sm hover:bg-surface-muted disabled:opacity-50"
                  >
                    {companySearchLoadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              ) : null}
            </div>
            {companySearchTotal != null &&
            companySearchResults.length >= CH_SEARCH_BROWSE_LIMIT &&
            companySearchResults.length < companySearchTotal ? (
              <p className="mt-2 text-xs text-amber-600">
                Companies House limits browsing to {CH_SEARCH_BROWSE_LIMIT.toLocaleString()} results. Refine your
                search to find a specific company.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
      ) : null}

      <CustomerOnboardingWizard
        step={step}
        onStepChange={handleWizardStepChange}
        data={data}
        setData={setData}
        apiBase={apiBase}
        customerId={customerId}
        authHeaders={authHeaders}
        submissionId={submissionId}
        formSubmissionRow={formSubmissionRow}
        onSubmissionRefresh={() => void refreshFormSubmissionRow()}
        onSaveDraft={handleSaveDraft}
        saveDraftDisabled={!companyNameOk || draftSaving}
        saveDraftLoading={draftSaving}
        draftSaveError={draftErr}
        saveMessage={saveHint}
        hideFooterSaveDraft
        signaturesComplete={signaturesComplete}
        postSignatureContent={postSignatureContent}
        ensureServerDraft={isResume ? undefined : ensureServerCustomerAndSubmission}
        onFinish={handleFinishRequest}
        finishDisabled={finishDisabled}
        nextDisabled={nextDisabled}
        finishLabel={saving ? "Creating…" : "Create customer"}
        subscriptionPlansForTurnover={subscriptionPlansForTurnover}
        subscriptionPlansForTurnoverLoading={subscriptionPlansForTurnoverLoading}
        subscriptionPlansForTurnoverErr={subscriptionPlansForTurnoverErr}
        subscriptionPlansBillingCycleFallback={subscriptionPlansBillingCycleFallback}
        onLoadSubscriptionPlansForTurnover={loadSubscriptionPlansForTurnover}
        subscriptionFeaturesCatalog={subscriptionFeaturesCatalog}
        subscriptionFeaturesLoading={subscriptionFeaturesLoading}
        subscriptionFeaturesErr={subscriptionFeaturesErr}
        companyRegConflict={companyRegConflict}
        companyRegConflictLoading={companyRegConflictLoading}
        companyRegConflictErr={companyRegConflictErr}
        onReviewSignatureFormChange={setReviewSignatureForm}
      />

      {draftErr ? <p className="text-sm text-red-400">{draftErr}</p> : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      {confirmCreateOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-create-customer-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-5 shadow-xl">
            <h2 id="confirm-create-customer-title" className="text-lg font-semibold text-ink">
              Create customer?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Are you sure you want to create{" "}
              <span className="font-medium text-ink">{data.company.name.trim() || "this customer"}</span>? This
              completes registration, saves the signed forms, and creates their portal login.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                className="rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
                onClick={() => setConfirmCreateOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                className="btn btn-primary btn-md"
                onClick={() => void executeFinish()}
              >
                {saving ? "Creating…" : "Yes, create customer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {previewOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={previewTitle}
        >
          <div className="flex h-[85vh] w-full max-w-5xl flex-col rounded-xl border border-border bg-surface-raised shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-ink">{previewTitle}</h3>
              <button
                type="button"
                onClick={() => {
                  setPreviewOpen(false);
                  if (previewUrl.startsWith("blob:")) {
                    try {
                      URL.revokeObjectURL(previewUrl);
                    } catch {
                      /* ignore revoke errors */
                    }
                  }
                  setPreviewUrl("");
                }}
                className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted"
              >
                Close
              </button>
            </div>
            <div className="min-h-0 flex-1 p-3">
              <iframe title={previewTitle} src={previewUrl} className="h-full w-full rounded-md border border-border" />
            </div>
          </div>
        </div>
      ) : null}

      {postCreatePortal ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="portal-creds-title"
        >
          <div className="relative w-full max-w-lg rounded-xl border border-border bg-surface-raised p-5 pt-6 shadow-xl">
            <button
              type="button"
              aria-label="Close dialog"
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted transition hover:bg-surface-muted hover:text-ink"
              onClick={() => setPostCreatePortal(null)}
            >
              <span className="sr-only">Close</span>
              <span className="text-xl leading-none" aria-hidden>
                ×
              </span>
            </button>
            <h2 id="portal-creds-title" className="pr-10 text-lg font-semibold text-ink">
              Customer created
            </h2>
            <p className="mt-2 text-sm text-muted">
              A portal account was created for this customer (not an admin user). They sign in with email and
              password on the login page; their access is limited to their own customer data.
            </p>
            {postCreatePortal.creds ? (
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                    Email
                  </span>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      className="min-w-0 flex-1 rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-sm"
                      value={postCreatePortal.creds.email}
                    />
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
                      onClick={() =>
                        void navigator.clipboard.writeText(postCreatePortal.creds!.email).catch(() => undefined)
                      }
                    >
                      Copy
                    </button>
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
                    Password
                  </span>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      className="min-w-0 flex-1 rounded-lg border border-border bg-surface-muted px-3 py-2 font-mono text-sm"
                      value={postCreatePortal.creds.password}
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      className="shrink-0 rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-ink hover:bg-surface-muted"
                      onClick={() =>
                        void navigator.clipboard.writeText(postCreatePortal.creds!.password).catch(() => undefined)
                      }
                    >
                      Copy
                    </button>
                  </div>
                </label>
                <p className="text-xs text-amber-200">
                  This password is shown only once. Store it securely or have the customer reset it if you add that
                  flow later.
                </p>
              </div>
            ) : null}
            {postCreatePortal.credsErr ? (
              <p className="mt-3 rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
                {postCreatePortal.credsErr}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              <Link
                to="/dashboard"
                className="rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted"
                onClick={() => setPostCreatePortal(null)}
              >
                Go to Dashboard
              </Link>
              <button
                type="button"
                className="btn btn-primary btn-md"
                onClick={() => {
                  const id = postCreatePortal.customerId;
                  setPostCreatePortal(null);
                  navigate(`/customers/${id}`);
                }}
              >
                Go to customer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
