// src/pages/SubscriptionManagementPage.tsx

import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
import HubOutlinedIcon from "@mui/icons-material/HubOutlined";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  deleteSubscriptionPlan,
  fetchBundlePlanAssignedCustomers,
  fetchBundleSubscriptionPlans,
  fetchSubscriptionPlans,
  patchBundlePlanActive,
  updateSubscriptionPlan,
} from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ModalDialog } from "../components/ui/ModalDialog";
import { SubscriptionServicesTab } from "../components/subscription/SubscriptionServicesTab";
import { useAuth } from "../auth/AuthContext";
import type {
  BundlePlanListItem,
  PlanAssignedCustomerRow,
  SubscriptionPlan,
  SubscriptionPlanFeatures,
} from "../types/api";
import { subscriptionPlanIsListedForCustomers } from "../utils/subscriptionPlanActive";

function formatPrice(p: number | string): string {
  const n = typeof p === "string" ? Number.parseFloat(p) : p;
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function linesToList(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function listFromFeatures(plan: SubscriptionPlan): { included: string[]; not_included: string[] } {
  const f = plan.features as SubscriptionPlanFeatures | null | undefined;
  if (!f || typeof f !== "object") return { included: [], not_included: [] };
  const inc = Array.isArray(f.included) ? f.included.filter((x): x is string => typeof x === "string") : [];
  const exc = Array.isArray(f.not_included)
    ? f.not_included.filter((x): x is string => typeof x === "string")
    : [];
  return { included: inc, not_included: exc };
}

function formatGbp(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `£${Number(n).toLocaleString("en-GB")}`;
}

function formatTurnoverBand(plan: SubscriptionPlan): string {
  const min = plan.turnoverMinGbp != null ? Number(plan.turnoverMinGbp) : 0;
  const maxRaw = plan.turnoverMaxGbp;
  const max = maxRaw != null && String(maxRaw).trim() !== "" ? Number(maxRaw) : null;
  if (!Number.isFinite(min)) return "—";
  if (max == null || !Number.isFinite(max)) return `£${min.toLocaleString("en-GB")}+`;
  return `£${min.toLocaleString("en-GB")} – £${max.toLocaleString("en-GB")}`;
}

function sortOrderFromPlan(plan: SubscriptionPlan): number {
  const p = plan as SubscriptionPlan & { sort_order?: number | string };
  const v: unknown = p.sortOrder ?? p.sort_order;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function accountStatusLabel(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "active") return "Active";
  if (s === "inactive") return "Inactive";
  if (s === "draft") return "Draft";
  if (s === "proposed") return "Proposed";
  return status.trim() || "—";
}

function PlanAssignedCustomersSection({
  planId,
  count,
  apiBase,
  headers,
}: {
  planId: string;
  count: number;
  apiBase: string;
  headers: HeadersInit;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<PlanAssignedCustomerRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const list = await fetchBundlePlanAssignedCustomers(apiBase, headers, planId);
      setRows(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load customers");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, headers, planId]);

  useEffect(() => {
    if (!expanded || rows !== null) return;
    void load();
  }, [expanded, rows, load]);

  return (
    <div className="mt-4 border-t border-border-subtle pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">Assigned customers</p>
          <p className="text-xs text-muted">
            {count === 0
              ? "No customers linked on this plan."
              : `${count} customer${count === 1 ? "" : "s"} opted for this plan`}
          </p>
        </div>
        {count > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface-muted"
          >
            {expanded ? "Hide list" : "View customers"}
          </button>
        ) : null}
      </div>
      {expanded && count > 0 ? (
        <div className="mt-3">
          {loading ? <p className="text-sm text-muted">Loading…</p> : null}
          {err ? <p className="text-sm text-red-400">{err}</p> : null}
          {!loading && rows && rows.length > 0 ? (
            <ul className="max-h-52 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-surface-muted/40 p-2">
              {rows.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/customers/${c.id}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-raised"
                  >
                    <span className="font-medium text-brand">{c.name}</span>
                    <span className="text-xs text-muted">{accountStatusLabel(c.accountStatus)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {!loading && rows && rows.length === 0 && !err ? (
            <p className="text-sm text-muted">No customers found.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function SubscriptionManagementPage() {
  const { apiBase, authHeaders, hasPermission } = useAuth();
  const canWriteSubscriptionPlans = hasPermission("subscription_plan:write");
  const [activeTab, setActiveTab] = useState<"plans" | "services">("plans");
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "services") setActiveTab("services");
  }, [searchParams]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [bundlePlans, setBundlePlans] = useState<BundlePlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [togglingLegacyId, setTogglingLegacyId] = useState<string | null>(null);
  const [formModal, setFormModal] = useState<null | { mode: "edit"; planId: string }>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingBundleId, setDeletingBundleId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { open: false }
    | { open: true; title: string; message: string; kind: "legacy"; planId: string }
    | { open: true; title: string; message: string; kind: "bundle"; planId: string }
  >({ open: false });
  const [deleteConfirmBusy, setDeleteConfirmBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [includedText, setIncludedText] = useState("");
  const [notIncludedText, setNotIncludedText] = useState("");
  const [turnoverMin, setTurnoverMin] = useState("0");
  const [turnoverMax, setTurnoverMax] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  /** When true, plan is flagged for customer-facing listing (`is_active` / `isActive` on API). */
  const [listForNewCustomers, setListForNewCustomers] = useState(true);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [legacy, bundle] = await Promise.all([
        fetchSubscriptionPlans(apiBase, authHeaders()),
        fetchBundleSubscriptionPlans(apiBase, authHeaders()),
      ]);
      setPlans(legacy);
      setBundlePlans(bundle);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void fetchPlans();
  }, [fetchPlans]);

  const toggleLegacyPlanListed = async (plan: SubscriptionPlan, isActive: boolean) => {
    if (!canWriteSubscriptionPlans) return;
    setTogglingLegacyId(plan.id);
    setErr("");
    try {
      await updateSubscriptionPlan(apiBase, authHeaders(), plan.id, { isActive });
      setPlans((prev) =>
        isActive
          ? prev.map((p) => (p.id === plan.id ? { ...p, isActive, is_active: isActive } : p))
          : prev.filter((p) => p.id !== plan.id),
      );
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not update plan");
    } finally {
      setTogglingLegacyId(null);
    }
  };

  const visibleBundlePlans = useMemo(
    () => bundlePlans.filter((p) => p.isActive !== false),
    [bundlePlans],
  );

  const sortedPlans = useMemo(
    () =>
      [...plans]
        .filter((p) => subscriptionPlanIsListedForCustomers(p))
        .sort((a, b) => sortOrderFromPlan(a) - sortOrderFromPlan(b)),
    [plans],
  );

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFormModal(null);
    };
    if (formModal) {
      document.addEventListener("keydown", onEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [formModal]);

  const resetForm = () => {
    setName("");
    setCode("");
    setDescription("");
    setPrice("");
    setBillingCycle("monthly");
    setIncludedText("");
    setNotIncludedText("");
    setTurnoverMin("0");
    setTurnoverMax("");
    setSortOrder("0");
    setListForNewCustomers(true);
    setFormErr("");
  };

  const populateFormFromPlan = (plan: SubscriptionPlan) => {
    const { included, not_included } = listFromFeatures(plan);
    setName(plan.name);
    setCode(plan.code);
    setDescription(plan.description ?? "");
    setPrice(formatPrice(plan.price));
    setBillingCycle(plan.billing_cycle || "monthly");
    setIncludedText(included.join("\n"));
    setNotIncludedText(not_included.join("\n"));
    const min = plan.turnoverMinGbp != null ? Number(plan.turnoverMinGbp) : 0;
    setTurnoverMin(Number.isFinite(min) ? String(min) : "0");
    const maxRaw = plan.turnoverMaxGbp;
    if (maxRaw != null && String(maxRaw).trim() !== "") {
      const m = Number(maxRaw);
      setTurnoverMax(Number.isFinite(m) ? String(m) : "");
    } else {
      setTurnoverMax("");
    }
    setSortOrder(String(sortOrderFromPlan(plan)));
    setListForNewCustomers(subscriptionPlanIsListedForCustomers(plan));
  };

  const openEditModal = (plan: SubscriptionPlan) => {
    setFormErr("");
    populateFormFromPlan(plan);
    setFormModal({ mode: "edit", planId: plan.id });
  };

  const closePlanModal = () => {
    if (!submitting) setFormModal(null);
  };

  const handleDeletePlan = (plan: SubscriptionPlan) => {
    setDeleteConfirm({
      open: true,
      title: `Delete subscription plan "${plan.name}"?`,
      message: `Plan code: ${plan.code}. Customers assigned to this plan will have the plan cleared.`,
      kind: "legacy",
      planId: plan.id,
    });
  };

  const handleDeleteBundlePlan = (plan: BundlePlanListItem) => {
    setDeleteConfirm({
      open: true,
      title: `Archive plan "${plan.name}"?`,
      message:
        "The plan is removed from this screen, onboarding, and recommendations. Customers already assigned keep the same plan (their plan link is not changed).",
      kind: "bundle",
      planId: plan.id,
    });
  };

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm.open) return;
    setDeleteConfirmBusy(true);
    setErr("");
    try {
      if (deleteConfirm.kind === "legacy") {
        setDeletingId(deleteConfirm.planId);
        await deleteSubscriptionPlan(apiBase, authHeaders(), deleteConfirm.planId);
      } else {
        setDeletingBundleId(deleteConfirm.planId);
        await patchBundlePlanActive(apiBase, authHeaders(), deleteConfirm.planId, false);
        setBundlePlans((prev) => prev.filter((p) => p.id !== deleteConfirm.planId));
      }
      if (deleteConfirm.kind === "legacy") {
        await fetchPlans();
      }
      setDeleteConfirm({ open: false });
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not delete plan");
    } finally {
      setDeleteConfirmBusy(false);
      setDeletingId(null);
      setDeletingBundleId(null);
    }
  }, [deleteConfirm, apiBase, authHeaders, fetchPlans]);

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formModal || formModal.mode !== "edit") return;
    setFormErr("");
    const nameTrim = name.trim();
    const codeTrim = code.trim().toLowerCase().replace(/\s+/g, "_");
    if (!nameTrim || !codeTrim) {
      setFormErr("Name and code are required.");
      return;
    }
    const priceNum = price.trim() === "" ? 0 : Number.parseFloat(price.trim());
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      setFormErr("Enter a valid price (0 or greater).");
      return;
    }
    const tMin = turnoverMin.trim() === "" ? 0 : Number.parseFloat(turnoverMin.trim());
    if (!Number.isFinite(tMin) || tMin < 0) {
      setFormErr("Turnover min must be a number ≥ 0.");
      return;
    }
    let tMax: number | null = null;
    if (turnoverMax.trim() !== "") {
      const m = Number.parseFloat(turnoverMax.trim());
      if (!Number.isFinite(m) || m < tMin) {
        setFormErr("Turnover max must be a number ≥ turnover min, or leave empty for no upper limit.");
        return;
      }
      tMax = m;
    }
    const so = sortOrder.trim() === "" ? 0 : Number.parseInt(sortOrder.trim(), 10);
    if (!Number.isFinite(so)) {
      setFormErr("Sort order must be an integer.");
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        name: nameTrim,
        code: codeTrim,
        description: description.trim() || undefined,
        price: priceNum,
        billing_cycle: billingCycle,
        isActive: listForNewCustomers,
        features: {
          included: linesToList(includedText),
          not_included: linesToList(notIncludedText),
        },
        turnoverMinGbp: tMin,
        turnoverMaxGbp: tMax,
        sortOrder: so,
      };
      await updateSubscriptionPlan(apiBase, authHeaders(), formModal.planId, body);
      setFormModal(null);
      resetForm();
      await fetchPlans();
    } catch (error) {
      setFormErr(error instanceof Error ? error.message : "Failed to save plan");
    } finally {
      setSubmitting(false);
    }
  };

  const planIcons = [RocketLaunchOutlinedIcon, StorefrontOutlinedIcon, HubOutlinedIcon] as const;
  const planIconStyles = [
    "bg-surface-muted text-muted",
    "bg-brand/15 text-brand",
    "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  ] as const;

  return (
    <div className="relative w-full min-w-0 space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Subscription management</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Manage pricing-matrix plans, legacy catalogue rows, and the shared service catalogue.
          </p>
        </div>
        {activeTab === "plans" ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-raised text-muted shadow-sm transition hover:border-brand/40 hover:bg-surface-muted hover:text-ink"
              aria-label="Filter plans (coming soon)"
            >
              <FilterListOutlinedIcon fontSize="small" />
            </button>
            <Link
              to="/settings/subscription/new"
              className="btn btn-primary btn-lg rounded-xl shadow-sm"
            >
              Add plan
            </Link>
          </div>
        ) : null}
      </header>

      <div className="flex gap-1 rounded-xl border border-border bg-surface-muted/50 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("plans")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${
            activeTab === "plans"
              ? "bg-surface-raised text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          Plans
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("services")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition sm:flex-none ${
            activeTab === "services"
              ? "bg-surface-raised text-ink shadow-sm"
              : "text-muted hover:text-ink"
          }`}
        >
          Services
        </button>
      </div>

      {activeTab === "services" ? (
        <SubscriptionServicesTab
          apiBase={apiBase}
          authHeaders={authHeaders}
          canWrite={canWriteSubscriptionPlans}
        />
      ) : null}

      {activeTab === "plans" && err ? <p className="text-sm text-red-400">{err}</p> : null}

      {activeTab === "plans" ? (
        loading ? (
        <p className="text-sm text-muted">Loading plans…</p>
      ) : sortedPlans.length === 0 && visibleBundlePlans.length === 0 ? (
        <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-muted/40 px-8 py-16 text-center">
          <p className="text-sm font-medium text-ink">No subscription plans yet</p>
          <p className="mt-2 max-w-sm text-sm text-muted">
            Your catalog is empty. Use <span className="font-semibold text-ink">Add plan</span> above to create your
            first pricing matrix plan.
          </p>
        </div>
      ) : (
        <div className="mx-auto flex max-w-6xl flex-col gap-10">
          {visibleBundlePlans.length > 0 ? (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <GridViewOutlinedIcon className="text-brand" sx={{ fontSize: 22 }} />
                <h2 className="text-base font-semibold text-ink">Pricing matrix plans</h2>
              </div>
              <p className="text-xs text-muted">
                From <span className="font-mono text-ink-soft">POST /api/subscriptions</span> — turnover bands and
                rules live in the matrix tables.
              </p>
              <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap">
                {visibleBundlePlans.map((bp) => (
                  <article
                    key={bp.id}
                    className="w-full min-w-0 flex-1 rounded-2xl border border-border bg-surface-raised p-6 shadow-card lg:min-w-[320px] lg:max-w-md"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-ink">{bp.name}</h3>
                          <span className="shrink-0 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                            Matrix
                          </span>
                        </div>
                      </div>
                      <span className="badge-success shrink-0">
                        Active
                      </span>
                    </div>
                    <dl className="mt-4 grid gap-2 text-sm">
                      <div className="flex justify-between gap-4 border-b border-border-subtle py-1.5">
                        <dt className="text-muted">Customer types</dt>
                        <dd className="text-right font-medium text-ink">
                          {bp.customerTypeNames.length ? bp.customerTypeNames.join(", ") : "—"}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 border-b border-border-subtle py-1.5">
                        <dt className="text-muted">Billing</dt>
                        <dd className="text-right font-medium capitalize text-ink">{bp.billingCycle || "—"}</dd>
                      </div>
                      <div className="flex justify-between gap-4 border-b border-border-subtle py-1.5">
                        <dt className="text-muted">Plan cap</dt>
                        <dd className="text-right font-medium text-ink">
                          {bp.maxTurnover === null ? "—" : formatGbp(bp.maxTurnover)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 border-b border-border-subtle py-1.5">
                        <dt className="text-muted">Pricing bands</dt>
                        <dd className="text-right font-medium text-ink">{bp.pricingBandCount}</dd>
                      </div>
                      <div className="flex justify-between gap-4 border-b border-border-subtle py-1.5">
                        <dt className="text-muted">From (lowest band)</dt>
                        <dd className="text-right font-medium text-ink">£{formatPrice(bp.priceFrom)}</dd>
                      </div>
                      <div className="flex justify-between gap-4 border-b border-border-subtle py-1.5">
                        <dt className="text-muted">Extendable</dt>
                        <dd className="text-right font-medium text-ink">{bp.extendable ? "Yes" : "No"}</dd>
                      </div>
                      <div className="flex justify-between gap-4 py-1.5">
                        <dt className="text-muted">Free payroll users</dt>
                        <dd className="text-right font-medium text-ink">
                          {bp.freePayrollLimit === null ? "—" : String(bp.freePayrollLimit)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 border-t border-border-subtle py-1.5">
                        <dt className="text-muted">Customers on plan</dt>
                        <dd className="text-right font-medium text-ink">
                          {bp.assignedCustomerCount ?? 0}
                        </dd>
                      </div>
                    </dl>
                    <PlanAssignedCustomersSection
                      planId={bp.id}
                      count={bp.assignedCustomerCount ?? 0}
                      apiBase={apiBase}
                      headers={authHeaders()}
                    />
                    <div className="mt-6 flex flex-wrap gap-2">
                      <Link
                        to={`/settings/subscription/edit/${bp.id}`}
                        className="btn btn-accent btn-lg rounded-xl gap-2 bg-surface-raised"
                      >
                        <EditOutlinedIcon sx={{ fontSize: 18 }} />
                        Edit plan
                      </Link>
                      {canWriteSubscriptionPlans ? (
                        <button
                          type="button"
                          className="btn btn-danger btn-lg rounded-xl gap-2 disabled:opacity-50"
                          disabled={deletingBundleId === bp.id}
                          onClick={() => handleDeleteBundlePlan(bp)}
                        >
                          {deletingBundleId === bp.id ? "Archiving…" : "Archive plan"}
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {sortedPlans.length > 0 ? (
            <section className="space-y-4">
              <h2 className="text-base font-semibold text-ink">Legacy catalogue plans</h2>
              <p className="text-xs text-muted">
                Stored in <span className="font-mono text-ink-soft">subscription_plans</span> — used for customer
                assignment and onboarding. Edit or delete here.
              </p>
              <div className="mx-auto flex max-w-xl flex-col gap-4">
                {sortedPlans.map((plan, index) => {
                  const { included, not_included } = listFromFeatures(plan);
                  const listed = subscriptionPlanIsListedForCustomers(plan);
                  const iconIdx = index % planIcons.length;
                  const Icon = planIcons[iconIdx];
                  const iconWrap = planIconStyles[iconIdx];
                  const priceNum = typeof plan.price === "string" ? Number.parseFloat(plan.price) : plan.price;
                  const showContact = Number.isFinite(priceNum) && priceNum <= 0;
                  const isPopular = sortedPlans.length >= 2 && index === 1;

                  return (
                    <article
                      key={plan.id}
                      className="relative overflow-hidden rounded-2xl border border-border bg-surface-raised p-6 shadow-card"
                    >
                      <div className="flex gap-4">
                        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${iconWrap}`}>
                          <Icon fontSize="medium" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <h2 className="text-lg font-semibold text-ink">{plan.name}</h2>
                            <div className="flex flex-col items-end gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {isPopular ? (
                                  <span className="rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-foreground">
                                    Popular
                                  </span>
                                ) : null}
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                    listed
                                      ? "badge-success text-xs font-semibold normal-case tracking-normal"
                                      : "rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-muted"
                                  }`}
                                >
                                  {listed ? "Active" : "Hidden"}
                                </span>
                              </div>
                              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 shrink-0 rounded border-border text-brand focus:ring-brand"
                                  checked={listed}
                                  disabled={!canWriteSubscriptionPlans || togglingLegacyId === plan.id}
                                  onChange={(e) => void toggleLegacyPlanListed(plan, e.target.checked)}
                                />
                                <span>
                                  {togglingLegacyId === plan.id ? "Saving…" : "List for new customers"}
                                </span>
                              </label>
                            </div>
                          </div>
                          <p className="mt-1 font-mono text-xs text-muted">{plan.code}</p>
                          {plan.description ? <p className="mt-2 text-sm text-ink-soft">{plan.description}</p> : null}
                          <dl className="mt-4 grid gap-2 text-sm">
                            <div className="flex justify-between gap-4 border-b border-border-subtle py-1.5">
                              <dt className="text-muted">Payees</dt>
                              <dd className="text-right font-medium text-ink">—</dd>
                            </div>
                            <div className="flex justify-between gap-4 border-b border-border-subtle py-1.5">
                              <dt className="text-muted">Billing cycle</dt>
                              <dd className="text-right font-medium capitalize text-ink">{plan.billing_cycle || "—"}</dd>
                            </div>
                            <div className="flex justify-between gap-4 py-1.5">
                              <dt className="text-muted">Turnover range</dt>
                              <dd className="text-right font-medium text-ink">{formatTurnoverBand(plan)}</dd>
                            </div>
                          </dl>
                          <div className="mt-4">
                            {showContact ? (
                              <p className="text-2xl font-bold text-brand">Contact us</p>
                            ) : (
                              <>
                                <span className="text-2xl font-bold text-brand">£{formatPrice(plan.price)}</span>
                                <span className="text-sm text-muted"> /{plan.billing_cycle || "mo"}</span>
                              </>
                            )}
                          </div>
                          {included.length > 0 ? (
                            <div className="mt-4">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Included</p>
                              <ul className="mt-2 space-y-1">
                                {included.slice(0, 4).map((line) => (
                                  <li key={line} className="flex gap-2 text-sm text-ink-soft">
                                    <span className="text-emerald-600">✓</span>
                                    <span>{line}</span>
                                  </li>
                                ))}
                                {included.length > 4 ? (
                                  <li className="text-xs text-muted">+{included.length - 4} more</li>
                                ) : null}
                              </ul>
                            </div>
                          ) : null}
                          {not_included.length > 0 ? (
                            <div className="mt-3">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">Not included</p>
                              <ul className="mt-2 space-y-1">
                                {not_included.slice(0, 3).map((line) => (
                                  <li key={line} className="flex gap-2 text-sm text-muted line-through">
                                    <span className="text-muted-soft">✕</span>
                                    <span>{line}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              onClick={() => openEditModal(plan)}
                              className="btn btn-accent btn-lg flex-1 rounded-xl bg-surface-raised"
                            >
                              Edit plan
                            </button>
                            <button
                              type="button"
                              disabled={deletingId === plan.id}
                              onClick={() => handleDeletePlan(plan)}
                              className="btn btn-danger btn-lg flex-1 rounded-xl disabled:opacity-50"
                            >
                              {deletingId === plan.id ? "Deleting…" : "Delete"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      )
      ) : null}

      {formModal ? (
        <ModalDialog
          open
          onClose={closePlanModal}
          disabled={submitting}
          titleId="subscription-plan-form-title"
          className="max-h-[90vh] max-w-lg overflow-y-auto"
        >
              <button
                type="button"
                onClick={closePlanModal}
                disabled={submitting}
                className="absolute right-4 top-4 text-muted-soft hover:text-muted disabled:opacity-50"
                aria-label="Close"
              >
                ✕
              </button>
              <h2 id="subscription-plan-form-title" className="text-lg font-semibold text-ink">Edit subscription plan</h2>
              <p className="mt-1 text-sm text-muted">
                Use one line per bullet. Turnover bands drive which plan is highlighted when a customer enters their
                annual turnover.
              </p>
              <form className="mt-4 space-y-4" onSubmit={handleSavePlan}>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    placeholder="e.g. Growth"
                    autoComplete="off"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Code</span>
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono"
                    placeholder="e.g. growth"
                    autoComplete="off"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Description</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    placeholder="Subtitle shown under the plan name"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Included (one per line)</span>
                  <textarea
                    value={includedText}
                    onChange={(e) => setIncludedText(e.target.value)}
                    rows={5}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono"
                    placeholder={"Annual accounts\nTax filing"}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Not included (one per line)</span>
                  <textarea
                    value={notIncludedText}
                    onChange={(e) => setNotIncludedText(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm font-mono"
                    placeholder={"Bookkeeping\nVAT returns"}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Turnover min (£)</span>
                    <input
                      value={turnoverMin}
                      onChange={(e) => setTurnoverMin(e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                      inputMode="decimal"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted">Turnover max (£)</span>
                    <input
                      value={turnoverMax}
                      onChange={(e) => setTurnoverMax(e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                      inputMode="decimal"
                      placeholder="Empty = no limit"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Sort order</span>
                  <input
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    inputMode="numeric"
                  />
                  <span className="mt-0.5 block text-xs text-muted">Lower numbers appear first in lists.</span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Price (£)</span>
                  <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    type="text"
                    inputMode="decimal"
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                    placeholder="0.00"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">Billing cycle</span>
                  <select
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface-muted/80 px-3 py-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-brand focus:ring-brand"
                    checked={listForNewCustomers}
                    onChange={(e) => setListForNewCustomers(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">List for new customers</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      When off, the plan stays in this admin list but is not flagged for customer-facing listing.
                    </span>
                  </span>
                </label>
                {formErr ? <p className="text-sm text-red-400">{formErr}</p> : null}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closePlanModal}
                    disabled={submitting}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-muted disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary btn-md"
                  >
                    {submitting ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
        </ModalDialog>
      ) : null}

      <ConfirmDialog
        open={deleteConfirm.open}
        title={deleteConfirm.open ? deleteConfirm.title : ""}
        message={deleteConfirm.open ? deleteConfirm.message : ""}
        confirmLabel="Delete"
        busy={deleteConfirmBusy}
        onCancel={() => {
          if (deleteConfirmBusy) return;
          setDeleteConfirm({ open: false });
        }}
        onConfirm={() => void handleDeleteConfirm()}
      />
    </div>
  );
}
