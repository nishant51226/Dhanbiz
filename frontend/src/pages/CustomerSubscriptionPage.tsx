import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { fetchBundleSubscriptionPlans, patchCustomer } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { BundlePlanListItem } from "../types/api";
import type { CustomerWorkspaceOutletContext } from "./customerWorkspaceContext";

function planIsActive(p: BundlePlanListItem): boolean {
  return p.isActive !== false;
}

function sortBundlePlans(plans: BundlePlanListItem[]): BundlePlanListItem[] {
  return [...plans].sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}

export default function CustomerSubscriptionPage() {
  const { apiBase, authHeaders, authRequired, customerId: jwtCustomerId, hasPermission, isAdmin } = useAuth();
  const { customer, loading, err, reload } = useOutletContext<CustomerWorkspaceOutletContext>();
  const [planName, setPlanName] = useState<string | null>(null);
  const [planErr, setPlanErr] = useState("");
  const [catalogPlans, setCatalogPlans] = useState<BundlePlanListItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogErr, setCatalogErr] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  /** Practice staff only: portal logins (JWT `customerId`) may view subscription, not assign plans. */
  const isPortalCustomerLogin = Boolean(authRequired && jwtCustomerId && !isAdmin);
  const canAssignPlan = hasPermission("customer:write") && !isPortalCustomerLogin;

  const currentPlanId = useMemo(() => {
    const raw = customer?.planId;
    return typeof raw === "string" && raw.trim() ? raw.trim() : "";
  }, [customer?.planId]);

  const resolvePlan = useCallback(async () => {
    if (!currentPlanId) {
      setPlanName(null);
      return;
    }
    setPlanErr("");
    try {
      const plans = await fetchBundleSubscriptionPlans(apiBase, authHeaders());
      const p = plans.find((x) => x.id === currentPlanId);
      setPlanName(p?.name ?? null);
    } catch (e) {
      setPlanErr(e instanceof Error ? e.message : "Could not load plans");
      setPlanName(null);
    }
  }, [apiBase, authHeaders, currentPlanId]);

  useEffect(() => {
    void resolvePlan();
  }, [resolvePlan]);

  useEffect(() => {
    setSelectedPlanId(currentPlanId);
  }, [currentPlanId]);

  const loadCatalog = useCallback(async () => {
    if (!canAssignPlan) return;
    setCatalogErr("");
    setCatalogLoading(true);
    try {
      const raw = await fetchBundleSubscriptionPlans(apiBase, authHeaders());
      const assignable = raw.filter(
        (p) => planIsActive(p) || (currentPlanId && p.id === currentPlanId),
      );
      setCatalogPlans(sortBundlePlans(assignable));
    } catch (e) {
      setCatalogErr(e instanceof Error ? e.message : "Could not load plans");
      setCatalogPlans([]);
    } finally {
      setCatalogLoading(false);
    }
  }, [apiBase, authHeaders, canAssignPlan, currentPlanId]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const dirty = selectedPlanId !== currentPlanId;

  const saveAssignment = async () => {
    if (!customer?.id || !dirty || !canAssignPlan) return;
    setSaving(true);
    setSaveErr("");
    try {
      await patchCustomer(apiBase, authHeaders(), customer.id, {
        planId: selectedPlanId.trim() === "" ? null : selectedPlanId.trim(),
      });
      await reload();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !customer) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (err) {
    return <p className="text-sm text-red-400">{err}</p>;
  }

  const turnover = customer?.annualTurnoverGbp;
  const turnoverDisplay =
    turnover === null || turnover === undefined || turnover === ""
      ? "—"
      : typeof turnover === "number"
        ? `£${turnover.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
        : String(turnover);

  const displayPlanName =
    planName ??
    (typeof customer?.plan?.name === "string" && customer.plan.name.trim() ? customer.plan.name.trim() : null);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Subscription</h1>
        <p className="mt-1 text-sm text-muted">Matrix plan and commercial terms for this customer.</p>
      </div>

      <section className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Current plan</h2>
        <p className="mt-3 text-lg font-semibold text-ink">
          {displayPlanName ?? (currentPlanId ? "Unknown plan" : "No plan assigned")}
        </p>
        {planErr ? <p className="mt-2 text-sm text-red-400">{planErr}</p> : null}
      </section>

      {canAssignPlan ? (
        <section className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Assign plan</h2>
          <p className="mt-2 text-sm text-muted">
            Choose a matrix bundle for this customer, or clear the assignment. Archived plans are not listed.
          </p>
          {catalogErr ? <p className="mt-2 text-sm text-red-400">{catalogErr}</p> : null}
          {catalogLoading ? (
            <p className="mt-3 text-sm text-muted">Loading plans…</p>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-ink" htmlFor="customer-subscription-plan">
                Subscription plan
              </label>
              <select
                id="customer-subscription-plan"
                className="w-full max-w-xl rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink shadow-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(e.target.value)}
                disabled={saving}
              >
                <option value="">No plan (clear)</option>
                {catalogPlans.map((p) => {
                  const priceFrom =
                    typeof p.priceFrom === "number" && Number.isFinite(p.priceFrom)
                      ? p.priceFrom.toLocaleString("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                      : "—";
                  const archived = !planIsActive(p);
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {archived ? " (archived)" : ""} — from £{priceFrom} / {p.billingCycle || "monthly"}
                    </option>
                  );
                })}
              </select>
              {saveErr ? <p className="text-sm text-red-400">{saveErr}</p> : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={!dirty || saving || !customer?.id}
                  onClick={() => void saveAssignment()}
                  className="btn btn-primary btn-md shadow-sm disabled:opacity-45"
                >
                  {saving ? "Saving…" : "Save assignment"}
                </button>
                {dirty ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setSelectedPlanId(currentPlanId)}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-45"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </section>
      ) : null}

      <section className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Estimated annual turnover</h2>
        <p className="mt-3 text-lg font-semibold text-ink">{turnoverDisplay}</p>
      </section>

      {!isPortalCustomerLogin ? (
        <p className="text-sm text-muted">
          Staff manage matrix bundles under{" "}
          <Link to="/settings/subscription" className="font-semibold text-brand hover:underline">
            Subscription plans
          </Link>
          .
        </p>
      ) : (
        <p className="text-sm text-muted">Contact your practice if you need to change your subscription plan.</p>
      )}
    </div>
  );
}
