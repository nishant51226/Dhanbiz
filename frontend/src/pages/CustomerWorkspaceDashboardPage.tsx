import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { fetchDocumentsList } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { RecentUploadedDocumentsCard } from "../components/RecentUploadedDocumentsCard";
import {
  portalDashboardOnlyFromMe,
  portalSettingsDashboardOnlyFromMe,
} from "../auth/customerWorkspaceNav";
import type { CustomerWorkspaceOutletContext } from "./customerWorkspaceContext";

type CountState = {
  loading: boolean;
  error: string;
  files: number;
};

function truncateCardLabel(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function CountCard({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string;
  href?: string;
  hint?: string;
}) {
  const content = (
    <div className="rounded-xl border border-border bg-surface-raised p-4 shadow-sm transition hover:border-brand/40">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-3xl font-bold text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
  if (!href) return content;
  return (
    <Link to={href} className="block">
      {content}
    </Link>
  );
}

function SectionCard({
  label,
  description,
  href,
  allowed,
}: {
  label: string;
  description: string;
  href: string;
  allowed: boolean;
}) {
  const className =
    "rounded-lg border border-border bg-surface px-4 py-3 text-sm font-semibold text-ink transition";
  if (!allowed) {
    return (
      <div
        className={`${className} cursor-not-allowed opacity-50`}
        title="Requires additional permission on your role"
      >
        {label}
        <span className="mt-1 block text-xs font-normal text-muted">{description}</span>
        <span className="mt-1 block text-[10px] font-normal text-muted-soft">Additional permission required</span>
      </div>
    );
  }
  return (
    <Link to={href} className={`${className} hover:border-brand/40 hover:bg-surface-muted/30`}>
      {label}
      <span className="mt-1 block text-xs font-normal text-muted">{description}</span>
    </Link>
  );
}

export default function CustomerWorkspaceDashboardPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const { customer, loading, err } = useOutletContext<CustomerWorkspaceOutletContext>();
  const {
    apiBase,
    authHeaders,
    authRequired,
    customerId: jwtCustomerId,
    hasPermission,
    hasAnyPermission,
    isAdmin,
    permissions,
  } = useAuth();

  const portalSettingsDashboardOnly =
    Boolean(authRequired && jwtCustomerId && !isAdmin) &&
    portalSettingsDashboardOnlyFromMe(permissions, hasPermission, hasAnyPermission);
  const portalDashboardOnly =
    Boolean(authRequired && jwtCustomerId && !isAdmin) &&
    portalDashboardOnlyFromMe(permissions, hasPermission, hasAnyPermission);
  const minimalPortalDashboard = portalSettingsDashboardOnly || portalDashboardOnly;
  /** Align with workspace Files tab: file permissions suffice without `job:read`. */
  const canFetchFilesCount =
    isAdmin ||
    hasAnyPermission([
      "file:read",
      "file:write",
      "file:delete",
      "portal:file:read",
      "portal:file:write",
      "portal:file:delete",
    ]);
  const canViewSubscription =
    isAdmin ||
    hasPermission("customer:read") ||
    hasPermission("subscription_plan:read") ||
    hasPermission("subscription_plan:write");
  const needsCountsFetch = canFetchFilesCount;

  const [counts, setCounts] = useState<CountState>({
    loading: needsCountsFetch,
    error: "",
    files: 0,
  });

  useEffect(() => {
    if (!customerId || !needsCountsFetch) {
      setCounts({ loading: false, error: "", files: 0 });
      return;
    }
    let cancelled = false;
    setCounts((s) => ({ ...s, loading: true, error: "" }));
    void (async () => {
      try {
        const docs = await fetchDocumentsList(apiBase, authHeaders(), {
          page: 1,
          limit: 1,
          sort: "createdAt,DESC",
          customerId,
        });
        if (cancelled) return;
        setCounts({ loading: false, error: "", files: docs.total });
      } catch (e) {
        if (cancelled) return;
        setCounts({
          loading: false,
          error: e instanceof Error ? e.message : "Could not load customer dashboard counts",
          files: 0,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, canFetchFilesCount, customerId, needsCountsFetch]);

  const usersCount = useMemo(() => customer?.portalUsers?.length ?? 0, [customer?.portalUsers]);

  const canPortalUsers = isAdmin || hasPermission("portal:user:read") || hasPermission("portal:user:write");
  const canForms = isAdmin || hasPermission("customer:read");
  const canSubscription =
    isAdmin || hasPermission("customer:read") || hasPermission("portal:subscription_plan:read");
  const canSettings =
    isAdmin ||
    hasPermission("customer:read") ||
    hasAnyPermission(["portal:settings:read", "portal:settings:write"]);
  const canFilesNav = canFetchFilesCount;

  if (!customerId) return null;
  if (loading && !customer) return <p className="text-sm text-muted">Loading dashboard…</p>;
  if (err) return <p className="text-sm text-red-400">{err}</p>;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <section className="rounded-xl border border-border bg-surface-raised p-5 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Dashboard</p>
        {!isAdmin ? (
          <h1 className="mt-2 text-2xl font-bold text-ink">{customer?.name ?? "Customer"}</h1>
        ) : null}
        <p className={`text-sm text-muted ${isAdmin ? "mt-2" : "mt-1"}`}>
          {minimalPortalDashboard
            ? "Overview for your organisation. Other sections require additional access."
            : "Snapshot of this customer only: users, files, subscription, and quick links."}
        </p>
      </section>

      {minimalPortalDashboard ? (
        <section className="rounded-xl border border-border bg-surface-raised shadow-sm">
          <div className="border-b border-border-subtle px-5 py-3">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Sections</h2>
            <p className="mt-1 text-sm text-muted">
              Shortcuts to other areas. Each section needs its own permission on your role.
            </p>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            <SectionCard
              label="Subscription"
              description="Plan and billing assignment"
              href={`/customers/${customerId}/subscription`}
              allowed={canSubscription}
            />
            <SectionCard
              label="Portal users"
              description="Manage customer logins"
              href={`/customers/${customerId}/users`}
              allowed={canPortalUsers}
            />
            <SectionCard
              label="Forms"
              description="Onboarding and submitted forms"
              href={`/customers/${customerId}/forms`}
              allowed={canForms}
            />
            <SectionCard
              label="Files"
              description="Document library"
              href={`/customers/${customerId}/library-documents`}
              allowed={canFilesNav}
            />
            <SectionCard
              label="Settings"
              description="Profile and organisation settings"
              href={`/customers/${customerId}/settings`}
              allowed={canSettings}
            />
          </div>
        </section>
      ) : null}

      {!minimalPortalDashboard ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <CountCard label="Portal users" value={String(usersCount)} href={`/customers/${customerId}/users`} />
            <CountCard
              label="Files"
              value={canFetchFilesCount ? (counts.loading ? "…" : String(counts.files)) : "—"}
              href={canFetchFilesCount ? `/customers/${customerId}/library-documents` : undefined}
              hint={!canFetchFilesCount ? "Requires files or jobs access" : undefined}
            />
            <CountCard
              label="Subscription"
              value={
                !canViewSubscription
                  ? "—"
                  : (() => {
                      const n = typeof customer?.plan?.name === "string" ? customer.plan.name.trim() : "";
                      if (n) return truncateCardLabel(n, 36);
                      const pid = typeof customer?.planId === "string" ? customer.planId.trim() : "";
                      return pid ? "Plan assigned" : "No plan";
                    })()
              }
              href={canViewSubscription ? `/customers/${customerId}/subscription` : undefined}
              hint={!canViewSubscription ? "Requires customer access" : "Plan and billing"}
            />
            <CountCard label="Forms" value="View" href={`/customers/${customerId}/forms`} />
          </section>

          {counts.error ? <p className="text-sm text-feedback-warning">{counts.error}</p> : null}

          {canFetchFilesCount ? (
            <RecentUploadedDocumentsCard
              apiBase={apiBase}
              authHeaders={authHeaders}
              customerId={customerId}
              onOpenDocument={(documentId) => navigate(`/files/documents/${documentId}`)}
              viewAllHref={`/customers/${customerId}/library-documents`}
            />
          ) : null}

          <section className="grid gap-3 sm:grid-cols-2">
            <Link
              to={`/customers/${customerId}/details`}
              className="rounded-lg border border-border bg-surface-raised px-4 py-3 text-sm text-ink transition hover:border-brand/40"
            >
              Open customer details
            </Link>
            <Link
              to={`/customers/${customerId}/settings`}
              className="rounded-lg border border-border bg-surface-raised px-4 py-3 text-sm text-ink transition hover:border-brand/40"
            >
              Open customer settings
            </Link>
          </section>
        </>
      ) : null}
    </div>
  );
}
