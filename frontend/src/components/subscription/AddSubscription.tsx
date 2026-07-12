import AddIcon from "@mui/icons-material/Add";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import GridViewOutlinedIcon from "@mui/icons-material/GridViewOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import RocketLaunchOutlinedIcon from "@mui/icons-material/RocketLaunchOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  attachServiceToPlanForBundle,
  createStaffSubscriptionBundle,
  fetchBundleSubscriptionPlanById,
  fetchSubscriptionCatalogServices,
  putStaffSubscriptionBundle,
  removePlanServiceLink,
} from "../../api/client";
import type { BundlePlanDetail, CatalogServiceListItem, PlanBundleServiceRow } from "../../types/api";
import { isMatrixYearlyBilling } from "../../utils/subscriptionPlanUi";

export type AddSubscriptionProps = {
  apiBase: string;
  authHeaders: () => HeadersInit;
  onCreated?: () => void | Promise<void>;
  /** When set, loads this plan and saves with PUT instead of POST. */
  editPlanId?: string | null;
  onUpdated?: () => void | Promise<void>;
  backHref?: string;
};

const CUSTOMER_TYPES = ["Solo", "Partnership", "Limited Company"] as const;
type CustomerTypeName = (typeof CUSTOMER_TYPES)[number];

function newKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Keeps turnover inputs within [0, cap] when a plan max is set. Preserves empty max when `allowEmpty`.
 */
function clampNumericStringToRange(
  raw: string,
  minBound: number,
  maxBound: number,
  opts?: { allowEmpty?: boolean },
): string {
  const allowEmpty = opts?.allowEmpty ?? false;
  const t = raw.trim();
  if (t === "" && allowEmpty) return "";
  if (t === "") return String(minBound);
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return raw;
  const x = Math.min(maxBound, Math.max(minBound, n));
  if (x === n) return raw;
  return String(x);
}

/** Suggested first turnover for the band after one that ends at `maxStr` (non-overlapping: floor(max)+1). */
function nextBandMinFromClosedMax(maxStr: string, planCap: number | null): string | null {
  const t = maxStr.trim();
  if (t === "") return null;
  const m = Number.parseFloat(t);
  if (!Number.isFinite(m) || m < 0) return null;
  const sugg = String(Math.floor(m) + 1);
  if (planCap === null) return sugg;
  return clampNumericStringToRange(sugg, 0, planCap, { allowEmpty: false });
}

function SectionCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-brand">
          {icon}
        </span>
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function AddSubscription({
  apiBase,
  authHeaders,
  onCreated,
  editPlanId = null,
  onUpdated,
  backHref = "/settings/subscription",
}: AddSubscriptionProps) {
  const [planName, setPlanName] = useState("");
  const [customerTypes, setCustomerTypes] = useState<CustomerTypeName[]>([]);
  const [billingCycle, setBillingCycle] = useState("");
  const [maxTurnover, setMaxTurnover] = useState("");

  const [matrixRows, setMatrixRows] = useState(() => [{ key: newKey(), min: "", max: "", price: "" }]);

  const [extendable, setExtendable] = useState(false);
  const [incrementStep, setIncrementStep] = useState("");
  const [incrementCost, setIncrementCost] = useState("");

  const [vatPercent, setVatPercent] = useState("");
  const [freePayrollLimit, setFreePayrollLimit] = useState("");

  const [taxFillingVatEnable, setTaxFillingVatEnable] = useState(false);
  const [dormantEnable, setDormantEnable] = useState(false);
  const [dormantCost, setDormantCost] = useState("");
  const [extraEmployeeCost, setExtraEmployeeCost] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const [loadError, setLoadError] = useState("");
  const [initialLoadDone, setInitialLoadDone] = useState(!editPlanId);

  const [planServices, setPlanServices] = useState<PlanBundleServiceRow[]>([]);
  const [catalogServices, setCatalogServices] = useState<CatalogServiceListItem[] | null>(null);
  const [togglingServiceId, setTogglingServiceId] = useState<string | null>(null);
  const [servicesErr, setServicesErr] = useState("");

  const planServiceByServiceId = useMemo(() => {
    const m = new Map<string, PlanBundleServiceRow>();
    for (const row of planServices) {
      m.set(row.serviceId, row);
    }
    return m;
  }, [planServices]);

  const fieldClass =
    "w-full rounded-lg border border-border bg-surface-input px-3 py-2.5 text-sm text-ink shadow-sm outline-none transition placeholder:text-muted-soft focus:border-brand focus:ring-2 focus:ring-brand/25";

  const billingIsYearly = isMatrixYearlyBilling(billingCycle);

  /** Parsed plan-level max turnover cap (£); when set, pricing bands cannot exceed it. */
  const planMaxCap = useMemo(() => {
    const t = maxTurnover.trim();
    if (t === "") return null;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [maxTurnover]);

  useEffect(() => {
    if (!editPlanId) {
      setInitialLoadDone(true);
      setLoadError("");
      return;
    }
    let cancelled = false;
    setInitialLoadDone(false);
    setLoadError("");
    void (async () => {
      try {
        const d: BundlePlanDetail = await fetchBundleSubscriptionPlanById(
          apiBase,
          authHeaders(),
          editPlanId,
        );
        if (cancelled) return;
        setPlanName(d.name);
        setCustomerTypes(CUSTOMER_TYPES.filter((t) => d.customerTypes.includes(t)));
        setBillingCycle(d.billingCycle);
        setMaxTurnover(d.maxTurnover === null || d.maxTurnover === undefined ? "" : String(d.maxTurnover));
        setMatrixRows(
          d.pricingMatrix.length
            ? d.pricingMatrix.map((row) => ({
                key: newKey(),
                min: String(row.minTurnover),
                max:
                  row.maxTurnover === null || row.maxTurnover === undefined ? "" : String(row.maxTurnover),
                price: String(row.price),
              }))
            : [{ key: newKey(), min: "0", max: "", price: "0" }],
        );
        const ext = Boolean(d.rules.extendable);
        setExtendable(ext);
        if (ext) {
          setIncrementStep(String(d.rules.incrementStep ?? 0));
          setIncrementCost(String(d.rules.incrementCost ?? 0));
        } else {
          setIncrementStep("");
          setIncrementCost("");
        }
        setFreePayrollLimit(String(d.limits.freePayrollLimit ?? 0));
        const a = d.addons;
        const yearly = isMatrixYearlyBilling(d.billingCycle);
        if (a) {
          setVatPercent(String(a.vatPercent));
          setTaxFillingVatEnable(a.taxFilingVatEnabled);
          setDormantEnable(yearly && Boolean(a.dormantEnabled));
          setDormantCost(yearly ? String(a.dormantCost ?? 0) : "0");
          setExtraEmployeeCost(String(a.extraEmployeeCost));
        }
        setPlanServices(Array.isArray(d.planServices) ? d.planServices : []);
        setInitialLoadDone(true);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Could not load plan");
          setInitialLoadDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, editPlanId]);

  useEffect(() => {
    if (!editPlanId || !initialLoadDone) {
      setCatalogServices(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const all = await fetchSubscriptionCatalogServices(apiBase, authHeaders());
        if (!cancelled) setCatalogServices(all);
      } catch {
        if (!cancelled) setCatalogServices([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, editPlanId, initialLoadDone]);

  /** When plan max changes, tighten numeric matrix values that would exceed it (leave blank cells unchanged). */
  useEffect(() => {
    if (planMaxCap === null) return;
    setMatrixRows((prev) =>
      prev.map((r) => ({
        ...r,
        min:
          r.min.trim() === ""
            ? r.min
            : clampNumericStringToRange(r.min, 0, planMaxCap, { allowEmpty: false }),
        max:
          r.max.trim() === ""
            ? r.max
            : clampNumericStringToRange(r.max, 0, planMaxCap, { allowEmpty: true }),
      })),
    );
  }, [planMaxCap]);

  const previewNumbers = useMemo(() => {
    const bands = matrixRows.map((r) => ({
      min: Number.parseFloat(r.min),
      max: r.max.trim() === "" ? null : Number.parseFloat(r.max),
      price: Number.parseFloat(r.price),
    }));
    const validPrices = bands.filter((b) => Number.isFinite(b.price) && b.price >= 0).map((b) => b.price);
    const baseMin = validPrices.length ? Math.min(...validPrices) : 0;
    const dormantC = billingIsYearly && dormantEnable ? (Number.parseFloat(dormantCost) || 0) : 0;
    const extraEmp = Number.parseFloat(extraEmployeeCost);
    const extraEmpN = Number.isFinite(extraEmp) && extraEmp >= 0 ? extraEmp : 0;
    const addonsTotal = dormantC + extraEmpN;
    const subtotal = baseMin + addonsTotal;
    const vat = Number.parseFloat(vatPercent);
    const vatMul = Number.isFinite(vat) && vat >= 0 ? vat / 100 : 0;
    const withVat = subtotal * (1 + vatMul);
    return { baseMin, addonsTotal, startingAt: withVat };
  }, [matrixRows, vatPercent, billingIsYearly, dormantEnable, dormantCost, extraEmployeeCost]);

  const addMatrixRow = () => {
    setMatrixRows((prev) => {
      const last = prev[prev.length - 1];
      let minStr = "";
      if (last) {
        const sugg = nextBandMinFromClosedMax(last.max, planMaxCap);
        if (sugg !== null) minStr = sugg;
      }
      return [...prev, { key: newKey(), min: minStr, max: "", price: "" }];
    });
  };

  const removeMatrixRow = (key: string) => {
    setMatrixRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)));
  };

  const updateMatrixRow = (key: string, patch: Partial<{ min: string; max: string; price: string }>) => {
    setMatrixRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  /** After max is finalized (blur), set the following band’s min to floor(max)+1 when max is numeric. */
  const toggleCustomerType = (t: CustomerTypeName) => {
    setCustomerTypes((prev) => {
      if (prev.includes(t)) {
        return prev.filter((x) => x !== t);
      }
      return [...prev, t];
    });
  };

  const syncNextBandMinAfterMaxBlur = (key: string, raw: string) => {
    setMatrixRows((prev) => {
      const idx = prev.findIndex((r) => r.key === key);
      if (idx === -1) return prev;
      const nextMax =
        planMaxCap === null
          ? raw
          : clampNumericStringToRange(raw, 0, planMaxCap, { allowEmpty: true });
      const nextMinSuggestion = nextBandMinFromClosedMax(nextMax, planMaxCap);
      return prev.map((r, i) => {
        if (i === idx) return { ...r, max: nextMax };
        if (i === idx + 1 && nextMinSuggestion !== null) return { ...r, min: nextMinSuggestion };
        return r;
      });
    });
  };

  const submit = async () => {
    setErr("");
    if (editPlanId && loadError) {
      setErr("This plan could not be loaded. Go back to the list and try again.");
      return;
    }
    const nameTrim = planName.trim();
    if (!nameTrim) {
      setErr("Plan name is required.");
      return;
    }

    const customerTypesOrdered = CUSTOMER_TYPES.filter((t) => customerTypes.includes(t));
    if (!customerTypesOrdered.length) {
      setErr("Select at least one customer type.");
      return;
    }

    if (!billingCycle.trim()) {
      setErr("Select a billing cycle.");
      return;
    }

    const planMaxNum = maxTurnover.trim() === "" ? null : Number.parseFloat(maxTurnover);
    if (planMaxNum !== null && (!Number.isFinite(planMaxNum) || planMaxNum < 0)) {
      setErr("Max turnover must be empty or a valid number ≥ 0.");
      return;
    }

    const pricingMatrix: { minTurnover: number; maxTurnover: number | null; price: number }[] = [];
    for (let i = 0; i < matrixRows.length; i++) {
      const r = matrixRows[i]!;
      const min = Number.parseFloat(r.min);
      const price = Number.parseFloat(r.price);
      if (!Number.isFinite(min) || min < 0) {
        setErr("Each pricing band needs a valid min turnover (≥ 0).");
        return;
      }
      if (!Number.isFinite(price) || price < 0) {
        setErr("Each pricing band needs a valid price (≥ 0).");
        return;
      }
      let max: number | null = null;
      if (r.max.trim() !== "") {
        const m = Number.parseFloat(r.max);
        if (!Number.isFinite(m) || m < min) {
          setErr("Max turnover must be a number ≥ min, or leave empty for no upper cap.");
          return;
        }
        max = m;
      }
      if (planMaxNum !== null) {
        if (min > planMaxNum) {
          setErr(
            `Band ${i + 1}: min turnover cannot exceed plan max (£${planMaxNum.toLocaleString("en-GB")}).`,
          );
          return;
        }
        if (max !== null) {
          if (max > planMaxNum) {
            setErr(
              `Band ${i + 1}: max turnover cannot exceed plan max (£${planMaxNum.toLocaleString("en-GB")}).`,
            );
            return;
          }
        } else {
          max = planMaxNum;
        }
      }
      pricingMatrix.push({ minTurnover: min, maxTurnover: max, price });
    }

    let step = 0;
    let cost = 0;
    if (extendable) {
      step = Number.parseFloat(incrementStep.trim() || "0");
      cost = Number.parseFloat(incrementCost.trim() || "0");
      if (!Number.isFinite(step) || step < 0) {
        setErr("When extendable is on, increment step must be a valid number ≥ 0.");
        return;
      }
      if (!Number.isFinite(cost) || cost < 0) {
        setErr("When extendable is on, increment cost must be a valid number ≥ 0.");
        return;
      }
    }

    const payrollRaw = freePayrollLimit.trim();
    const payroll = payrollRaw === "" ? 0 : Number.parseInt(payrollRaw, 10);
    if (payrollRaw !== "" && (!Number.isFinite(payroll) || payroll < 0)) {
      setErr("Free payroll users must be a non-negative whole number.");
      return;
    }

    const vatRaw = vatPercent.trim();
    const vatN = vatRaw === "" ? 0 : Number.parseFloat(vatRaw);
    if (vatRaw !== "" && (!Number.isFinite(vatN) || vatN < 0)) {
      setErr("VAT % must be a valid number ≥ 0.");
      return;
    }
    const dormantC = dormantCost.trim() === "" ? 0 : Number.parseFloat(dormantCost);
    const extraEmpRaw = extraEmployeeCost.trim();
    const extraEmp = extraEmpRaw === "" ? 0 : Number.parseFloat(extraEmpRaw);
    if (
      isMatrixYearlyBilling(billingCycle) &&
      dormantEnable &&
      (!Number.isFinite(dormantC) || dormantC < 0)
    ) {
      setErr("Dormant cost must be a valid number ≥ 0.");
      return;
    }
    if (!Number.isFinite(extraEmp) || extraEmp < 0) {
      setErr("Extra employee cost must be a valid number ≥ 0.");
      return;
    }

    setSubmitting(true);
    try {
      const body = {
        name: nameTrim,
        customerTypes: customerTypesOrdered,
        billingCycle,
        maxTurnover: planMaxNum,
        pricingMatrix,
        rules: extendable
          ? { extendable, incrementStep: step, incrementCost: cost }
          : { extendable: false },
        limits: { freePayrollLimit: payroll },
        addons: {
          vatPercent: vatN,
          taxFilingVatEnabled: taxFillingVatEnable,
          dormantEnabled: isMatrixYearlyBilling(billingCycle) && dormantEnable,
          dormantCost: isMatrixYearlyBilling(billingCycle) ? dormantC : 0,
          extraEmployeeCost: extraEmp,
        },
      };
      if (editPlanId) {
        await putStaffSubscriptionBundle(apiBase, authHeaders(), editPlanId, body);
        await onUpdated?.();
      } else {
        await createStaffSubscriptionBundle(apiBase, authHeaders(), body);
        await onCreated?.();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create subscription plan");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl pb-12">
      <header className="sticky top-0 z-10 -mx-1 mb-6 flex items-center justify-between gap-3 border-b border-border-subtle bg-surface/95 px-1 py-3 backdrop-blur-sm">
        <Link
          to={backHref}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-muted hover:bg-surface-muted hover:text-ink"
        >
          <ArrowBackIosNewIcon sx={{ fontSize: 14 }} />
          Back
        </Link>
        <h1 className="text-center text-base font-semibold text-ink sm:text-lg">
          {editPlanId ? "Edit subscription plan" : "Create subscription plan"}
        </h1>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || !initialLoadDone}
          className="btn btn-primary btn-sm shrink-0 shadow-sm"
        >
          {submitting ? "Saving…" : editPlanId ? "Save changes" : "Save plan"}
        </button>
      </header>

      {err ? (
        <p className="mb-6 alert-error-compact" role="alert">
          {err}
        </p>
      ) : null}
      {loadError ? (
        <p className="mb-6 alert-error-compact" role="alert">
          {loadError}
        </p>
      ) : null}
      {!initialLoadDone && editPlanId ? (
        <p className="mb-6 text-sm text-muted">Loading plan…</p>
      ) : null}

      <div
        className={`flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,1fr)_min(360px,34%)] lg:items-start lg:gap-10 ${
          !initialLoadDone && editPlanId ? "pointer-events-none opacity-40" : ""
        }`}
      >
        <div className="min-w-0 space-y-6">
          <SectionCard icon={<InfoOutlinedIcon sx={{ fontSize: 20 }} />} title="Basic info">
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Plan name</span>
                <input
                  className={fieldClass}
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder="e.g. Enterprise"
                  autoComplete="off"
                />
              </label>
              <div>
                <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Customer types
                </span>
                <p className="mb-2 text-xs text-muted">Select one or more. The same pricing matrix applies to each.</p>
                <div className="flex flex-wrap gap-2">
                  {CUSTOMER_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleCustomerType(t)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        customerTypes.includes(t)
                          ? "border-brand bg-brand/15 text-brand ring-2 ring-brand/25"
                          : "border-border bg-surface-muted text-ink-soft hover:border-border-subtle hover:bg-surface-input"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Billing cycle</span>
                  <select
                    className={fieldClass}
                    value={billingCycle}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBillingCycle(v);
                      if (!isMatrixYearlyBilling(v)) setDormantEnable(false);
                    }}
                  >
                    <option value="">Select billing cycle…</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Max turnover (£)
                  </span>
                  <input
                    className={fieldClass}
                    value={maxTurnover}
                    onChange={(e) => setMaxTurnover(e.target.value)}
                    placeholder="Optional — plan cap"
                    inputMode="decimal"
                  />
                </label>
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={<GridViewOutlinedIcon sx={{ fontSize: 20 }} />} title="Pricing matrix">
            {planMaxCap !== null ? (
              <p className="mb-3 text-xs text-ink-soft">
                Turnover bands (GBP). Plan max is{" "}
                <span className="font-semibold text-brand">£{planMaxCap.toLocaleString("en-GB")}</span> — every band&apos;s
                min and max must stay within that range. An empty max on a band uses the plan max as the upper bound.
              </p>
            ) : (
              <p className="mb-3 text-xs text-muted">
                Turnover bands (GBP). Set plan max turnover above to cap bands; leave max empty on a band for an open-ended
                top band (only when plan max is unset).
              </p>
            )}
            <div className="overflow-x-auto rounded-xl border border-border-subtle">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/80 text-left text-[10px] font-bold uppercase tracking-wider text-muted">
                    <th className="px-3 py-2.5">Min turnover (£)</th>
                    <th className="px-3 py-2.5">Max turnover (£)</th>
                    <th className="px-3 py-2.5">Price (£)</th>
                    <th className="w-10 px-2 py-2.5" aria-label="Remove row" />
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.map((r) => (
                    <tr key={r.key} className="border-b border-border-subtle last:border-0">
                      <td className="p-2">
                        <input
                          className={`${fieldClass} py-2`}
                          value={r.min}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const next =
                              planMaxCap === null
                                ? raw
                                : clampNumericStringToRange(raw, 0, planMaxCap, { allowEmpty: false });
                            updateMatrixRow(r.key, { min: next });
                          }}
                          inputMode="decimal"
                          aria-label="Min turnover"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className={`${fieldClass} py-2`}
                          value={r.max}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const next =
                              planMaxCap === null
                                ? raw
                                : clampNumericStringToRange(raw, 0, planMaxCap, { allowEmpty: true });
                            updateMatrixRow(r.key, { max: next });
                          }}
                          onBlur={(e) => {
                            syncNextBandMinAfterMaxBlur(r.key, e.target.value);
                          }}
                          placeholder="∞"
                          inputMode="decimal"
                          aria-label="Max turnover"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className={`${fieldClass} py-2`}
                          value={r.price}
                          onChange={(e) => updateMatrixRow(r.key, { price: e.target.value })}
                          inputMode="decimal"
                        />
                      </td>
                      <td className="p-1 text-center">
                        <button
                          type="button"
                          onClick={() => removeMatrixRow(r.key)}
                          disabled={matrixRows.length <= 1}
                          className="rounded-lg p-1.5 text-muted hover:bg-surface-muted hover:text-red-600 disabled:opacity-30"
                          aria-label="Remove band"
                        >
                          <DeleteOutlinedIcon sx={{ fontSize: 20 }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              onClick={addMatrixRow}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-brand hover:bg-brand/10"
            >
              <AddIcon sx={{ fontSize: 18 }} />
              Add band
            </button>
          </SectionCard>

          <SectionCard icon={<ExtensionOutlinedIcon sx={{ fontSize: 20 }} />} title="Plan services">
            {!editPlanId ? (
              <p className="text-sm text-muted">
                Save the plan first, then use <strong>Edit</strong> from the list to tick services for this bundle.
              </p>
            ) : (
              <div className="space-y-4">
                {servicesErr ? (
                  <p className="alert-error-compact" role="alert">
                    {servicesErr}
                  </p>
                ) : null}
                <p className="text-xs text-muted">
                  Tick the services included in this plan. To add a new service to the catalogue, use the{" "}
                  <Link to="/settings/subscription?tab=services" className="font-medium text-brand hover:underline">
                    Services tab
                  </Link>{" "}
                  under Subscription management.
                </p>
                {catalogServices === null ? (
                  <p className="text-sm text-muted">Loading services…</p>
                ) : catalogServices.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border bg-surface-muted/40 px-4 py-6 text-sm text-muted">
                    No services in the catalogue yet.{" "}
                    <Link to="/settings/subscription?tab=services" className="font-medium text-brand hover:underline">
                      Add services
                    </Link>{" "}
                    first, then return here to assign them to this plan.
                  </p>
                ) : (
                  <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
                    {catalogServices.map((svc) => {
                      const linked = planServiceByServiceId.get(svc.serviceId);
                      const checked = Boolean(linked);
                      return (
                        <li key={svc.serviceId} className="flex items-start gap-3 px-4 py-3">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-brand focus:ring-brand disabled:opacity-50"
                            checked={checked}
                            disabled={togglingServiceId === svc.serviceId || (!svc.isActive && !checked)}
                            onChange={(e) => {
                              const wantLinked = e.target.checked;
                              void (async () => {
                                if (!editPlanId) return;
                                setServicesErr("");
                                setTogglingServiceId(svc.serviceId);
                                const snapshot = planServices;
                                try {
                                  if (wantLinked) {
                                    setPlanServices((prev) => {
                                      if (prev.some((p) => p.serviceId === svc.serviceId)) return prev;
                                      return [
                                        ...prev,
                                        {
                                          planServiceId: "",
                                          serviceId: svc.serviceId,
                                          name: svc.name,
                                          description: svc.description,
                                          price: svc.price,
                                          isActive: svc.isActive,
                                          isIncluded: true,
                                        },
                                      ];
                                    });
                                    const result = await attachServiceToPlanForBundle(
                                      apiBase,
                                      authHeaders(),
                                      editPlanId,
                                      { serviceId: svc.serviceId, isIncluded: true },
                                    );
                                    setPlanServices((prev) =>
                                      prev.map((p) =>
                                        p.serviceId === svc.serviceId
                                          ? { ...p, planServiceId: result.planServiceId, isIncluded: result.isIncluded }
                                          : p,
                                      ),
                                    );
                                  } else if (linked) {
                                    const planServiceId = linked.planServiceId;
                                    setPlanServices((prev) => prev.filter((p) => p.serviceId !== svc.serviceId));
                                    await removePlanServiceLink(apiBase, authHeaders(), planServiceId);
                                  }
                                } catch (ex) {
                                  setPlanServices(snapshot);
                                  setServicesErr(ex instanceof Error ? ex.message : "Could not update services");
                                } finally {
                                  setTogglingServiceId(null);
                                }
                              })();
                            }}
                          />
                          <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-sm font-medium ${svc.isActive ? "text-ink" : "text-muted"}`}>
                                  {svc.name}
                                </span>
                                {!svc.isActive ? (
                                  <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted">
                                    Inactive
                                  </span>
                                ) : null}
                              </div>
                              {svc.description ? (
                                <p className="mt-0.5 text-xs text-muted line-clamp-2">{svc.description}</p>
                              ) : null}
                            </div>
                            <span className="shrink-0 tabular-nums text-sm font-medium text-muted">
                              £{Number(svc.price).toFixed(2)}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard icon={<TuneOutlinedIcon sx={{ fontSize: 20 }} />} title="Billing rules">
            <div className="space-y-4">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-subtle bg-surface-muted/50 px-3 py-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-border text-brand focus:ring-brand"
                  checked={extendable}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setExtendable(v);
                    if (!v) {
                      setIncrementStep("");
                      setIncrementCost("");
                    }
                  }}
                />
                <span>
                  <span className="block text-sm font-medium text-ink">Extendable plan</span>
                  <span className="mt-0.5 block text-xs text-muted">Allow stepping beyond published bands using increment rules.</span>
                </span>
              </label>
              <div className={`grid gap-4 sm:grid-cols-2 ${!extendable ? "opacity-50" : ""}`}>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Increment step (£)
                  </span>
                  <input
                    className={fieldClass}
                    value={incrementStep}
                    onChange={(e) => setIncrementStep(e.target.value)}
                    inputMode="decimal"
                    disabled={!extendable}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Increment cost (£)
                  </span>
                  <input
                    className={fieldClass}
                    value={incrementCost}
                    onChange={(e) => setIncrementCost(e.target.value)}
                    inputMode="decimal"
                    disabled={!extendable}
                  />
                </label>
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={<ExtensionOutlinedIcon sx={{ fontSize: 20 }} />} title="Payroll, limits & plan add-ons">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Free payroll users</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className={fieldClass}
                  value={freePayrollLimit}
                  onChange={(e) => setFreePayrollLimit(e.target.value)}
                />
              </label>
            </div>

            <div className="mt-6 border-t border-border-subtle pt-5">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Plan add-ons (saved to plan)</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">VAT %</span>
                  <input className={fieldClass} value={vatPercent} onChange={(e) => setVatPercent(e.target.value)} inputMode="decimal" />
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-subtle bg-surface-muted/50 px-3 py-3 sm:col-span-2">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 rounded border-border text-brand focus:ring-brand"
                    checked={taxFillingVatEnable}
                    onChange={(e) => setTaxFillingVatEnable(e.target.checked)}
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink">Tax filing VAT enabled</span>
                    <span className="mt-0.5 block text-xs text-muted">Stored as tax_filling_vat_enable on plan add-ons.</span>
                  </span>
                </label>
                {billingIsYearly ? (
                  <>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border-subtle bg-surface-muted/50 px-3 py-3 sm:col-span-2">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 shrink-0 rounded border-border text-brand focus:ring-brand"
                        checked={dormantEnable}
                        onChange={(e) => setDormantEnable(e.target.checked)}
                      />
                      <span>
                        <span className="block text-sm font-medium text-ink">Dormant company pricing</span>
                        <span className="mt-0.5 block text-xs text-muted">
                          Yearly plans only. When on, dormant cost below applies in previews and onboarding.
                        </span>
                      </span>
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">
                        Dormant cost (£)
                      </span>
                      <input
                        className={fieldClass}
                        value={dormantCost}
                        onChange={(e) => setDormantCost(e.target.value)}
                        inputMode="decimal"
                        disabled={!dormantEnable}
                      />
                    </label>
                  </>
                ) : null}
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted">Extra employee cost (£)</span>
                  <input
                    className={fieldClass}
                    value={extraEmployeeCost}
                    onChange={(e) => setExtraEmployeeCost(e.target.value)}
                    inputMode="decimal"
                  />
                </label>
              </div>
            </div>
          </SectionCard>

          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="btn btn-primary btn-lg w-full gap-2 rounded-xl py-3.5 font-bold shadow-md"
          >
            <RocketLaunchOutlinedIcon fontSize="small" />
            {submitting ? "Creating…" : "Create plan"}
          </button>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-brand/30 bg-gradient-to-br from-brand to-brand-hover text-brand-foreground shadow-card">
            <div className="p-5">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-foreground/80">Plan preview</p>
              <h2 className="mt-1 text-lg font-semibold">Starting price</h2>
              <p className="mt-4 text-3xl font-bold tracking-tight">£{previewNumbers.startingAt.toFixed(2)}</p>
              <p className="mt-1 text-xs text-brand-foreground/80">
                Lowest band price plus VAT. Extra costs from add-ons are listed below when configured.
              </p>
              <dl className="mt-6 space-y-3 border-t border-white/20 pt-4 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-brand-foreground/85">Base (lowest band)</dt>
                  <dd className="font-semibold">£{previewNumbers.baseMin.toFixed(2)}</dd>
                </div>
                {previewNumbers.addonsTotal > 0 ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-brand-foreground/85">Extra costs</dt>
                    <dd className="font-semibold">£{previewNumbers.addonsTotal.toFixed(2)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface-raised p-5 shadow-card">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Summary</p>
            <h3 className="mt-1 text-base font-semibold text-ink">Configuration</h3>
            <dl className="mt-4 space-y-0 text-sm">
              <div className="flex justify-between gap-3 border-b border-border-subtle py-2.5">
                <dt className="text-muted">Name</dt>
                <dd className="max-w-[55%] text-right font-medium text-ink">{planName.trim() || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-border-subtle py-2.5">
                <dt className="text-muted">Customer types</dt>
                <dd className="max-w-[55%] text-right font-medium text-ink">
                  {CUSTOMER_TYPES.filter((t) => customerTypes.includes(t)).join(", ") || "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-border-subtle py-2.5">
                <dt className="text-muted">Billing</dt>
                <dd className="text-right font-medium capitalize text-ink">{billingCycle || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-border-subtle py-2.5">
                <dt className="text-muted">Bands</dt>
                <dd className="text-right font-medium text-ink">{matrixRows.length}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-border-subtle py-2.5">
                <dt className="text-muted">Free payroll</dt>
                <dd className="text-right font-medium text-ink">{freePayrollLimit.trim() || "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-border-subtle py-2.5">
                <dt className="text-muted">VAT %</dt>
                <dd className="text-right font-medium text-ink">{vatPercent.trim() ? `${vatPercent}%` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-3 py-2.5">
                <dt className="text-muted">Tax filing VAT</dt>
                <dd className="text-right font-medium text-ink">{taxFillingVatEnable ? "Yes" : "No"}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-border-subtle bg-surface-muted/40 p-5 shadow-card">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Customer view</p>
            <h3 className="mt-1 text-lg font-semibold text-ink">{planName.trim() || "New plan"}</h3>
            <p className="mt-2 text-sm text-ink-soft">
              {CUSTOMER_TYPES.filter((t) => customerTypes.includes(t)).join(" · ") || "—"}
              {billingCycle ? ` · ${billingCycle} billing` : ""}
              {maxTurnover.trim() ? ` · cap £${Number.parseFloat(maxTurnover).toLocaleString("en-GB")}` : ""}
            </p>
            <div className="mt-4 rounded-xl border border-border-subtle bg-surface-raised p-4 text-xs leading-relaxed text-muted">
              Pricing follows your turnover bands. Add-ons and payroll limits apply at checkout.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
