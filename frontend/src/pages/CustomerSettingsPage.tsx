import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { patchCustomer } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import type { CustomerWorkspaceOutletContext } from "./customerWorkspaceContext";

function turnoverToInput(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  const s = String(v).trim();
  return s;
}

export default function CustomerSettingsPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { apiBase, authHeaders, isAdmin, hasPermission, hasAnyPermission } = useAuth();
  const { customer, loading, err, reload } = useOutletContext<CustomerWorkspaceOutletContext>();
  const canEdit = isAdmin || hasPermission("customer:write") || hasAnyPermission(["portal:settings:write"]);

  const [name, setName] = useState("");
  const [turnoverDraft, setTurnoverDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  useEffect(() => {
    setName((customer?.name ?? "").trim());
    setTurnoverDraft(turnoverToInput(customer?.annualTurnoverGbp));
  }, [customer]);

  const baselineName = useMemo(() => (customer?.name ?? "").trim(), [customer?.name]);
  const baselineTurnover = useMemo(() => turnoverToInput(customer?.annualTurnoverGbp), [customer?.annualTurnoverGbp]);

  const dirty = name.trim() !== baselineName || turnoverDraft.trim() !== baselineTurnover.trim();

  const save = useCallback(async () => {
    if (!customer?.id || !canEdit || !dirty) return;
    const nextName = name.trim();
    if (!nextName) {
      setSaveErr("Name is required.");
      return;
    }
    const tRaw = turnoverDraft.trim().replace(/,/g, "");
    let annualTurnoverGbp: number | undefined;
    if (tRaw === "") {
      annualTurnoverGbp = undefined;
    } else {
      const n = Number(tRaw);
      if (!Number.isFinite(n) || n < 0) {
        setSaveErr("Annual turnover must be a non-negative number, or leave blank to leave unchanged.");
        return;
      }
      annualTurnoverGbp = n;
    }
    setSaving(true);
    setSaveErr("");
    try {
      const body: { name: string; annualTurnoverGbp?: number } = { name: nextName };
      if (tRaw !== "") {
        body.annualTurnoverGbp = annualTurnoverGbp;
      }
      await patchCustomer(apiBase, authHeaders(), customer.id, body);
      await reload();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [apiBase, authHeaders, canEdit, customer?.id, dirty, name, turnoverDraft, reload]);

  if (loading && !customer) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (err) {
    return <p className="text-sm text-red-400">{err}</p>;
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <section className="rounded-xl border border-border bg-surface-raised px-5 py-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Customer Settings</p>
        <div className="mt-2">
          <h1 className="text-xl font-bold text-ink">{customer?.name ?? "Customer"}</h1>
          <p className="mt-1 text-sm text-muted">Manage profile fields and customer-specific sections from one place.</p>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
        <div className="border-b border-border-subtle px-5 py-3">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Profile</h2>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Display name</span>
            <input
              id="cust-settings-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink disabled:opacity-60"
            />
          </label>
          <label className="block">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Annual turnover (GBP)</span>
            <input
              id="cust-settings-turnover"
              type="text"
              inputMode="decimal"
              value={turnoverDraft}
              onChange={(e) => setTurnoverDraft(e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. 250000"
              className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink disabled:opacity-60"
            />
            <span className="mt-1 block text-xs text-muted-soft">
              Used for plan recommendations. Leave blank to keep current value unchanged.
            </span>
          </label>
        </div>

        <div className="border-t border-border-subtle px-5 py-4">
          {saveErr ? <p className="mb-3 text-sm text-red-400">{saveErr}</p> : null}
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void save()}
                disabled={!dirty || saving}
                className="btn btn-primary btn-md disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
              {!dirty ? <span className="text-xs text-muted">No unsaved changes</span> : null}
            </div>
          ) : (
            <p className="text-sm text-muted">You can view these fields; editing requires settings write permission.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
        <div className="border-b border-border-subtle px-5 py-3">
          <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Sections</h2>
          <p className="mt-1 text-sm text-muted">Open customer-specific sections from here.</p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <Link
            to={`/customers/${customer?.id ?? customerId ?? ""}/subscription`}
            className="rounded-lg border border-border bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:border-brand/40 hover:bg-surface-muted/30"
          >
            Subscription
            <span className="mt-1 block text-xs font-normal text-muted">Plan and billing assignment</span>
          </Link>
          <Link
            to={`/customers/${customer?.id ?? customerId ?? ""}/users`}
            className="rounded-lg border border-border bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:border-brand/40 hover:bg-surface-muted/30"
          >
            Portal users
            <span className="mt-1 block text-xs font-normal text-muted">Manage customer logins</span>
          </Link>
          <Link
            to={`/customers/${customer?.id ?? customerId ?? ""}/forms`}
            className="rounded-lg border border-border bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:border-brand/40 hover:bg-surface-muted/30"
          >
            Forms
            <span className="mt-1 block text-xs font-normal text-muted">Onboarding and submitted forms</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
