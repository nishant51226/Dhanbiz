import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  fetchBundleSubscriptionPlans,
  fetchCustomersList,
  fetchCustomersPageWithSubmissionData,
  fetchJobStatusCounts,
  fetchJobsList,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { StaffAccountsDeadlinesTable } from "../components/StaffAccountsDeadlinesTable";
import { StaffCompaniesHouseChartsSection } from "../components/StaffCompaniesHouseCharts";
import { CustomerDocumentUploadsDashboardCard } from "../components/CustomerDocumentUploadsDashboardCard";
import { Can } from "../auth/Can";
import { formatDateTime } from "../utils/formatDate";
import { accountStatusFromPageRow } from "../utils/customerAccountStatusFromPageRow";
import type { CustomerAccountStatus, JobRow } from "../types/api";

type StatusSlice = { queued: number; processing: number; completed: number; failed: number; cancelled: number };

/** Same four lifecycle labels as the customer directory (`account_status`, with list fallback). */
const CUSTOMER_ACCOUNT_STATUS_ORDER: CustomerAccountStatus[] = ["draft", "active", "inactive", "proposed"];

type CustomerLifecycleByAccountStatus = Record<CustomerAccountStatus, number>;

function emptyLifecycleCounts(): CustomerLifecycleByAccountStatus {
  return { draft: 0, active: 0, inactive: 0, proposed: 0 };
}

const ONBOARDING_PAGE_LIMIT = 100;

async function fetchCustomerLifecycleCounts(
  apiBase: string,
  headers: HeadersInit,
): Promise<CustomerLifecycleByAccountStatus> {
  const counts = emptyLifecycleCounts();
  let page = 1;
  let pageCount = 1;
  while (page <= pageCount) {
    const res = await fetchCustomersPageWithSubmissionData(apiBase, headers, {
      page,
      limit: ONBOARDING_PAGE_LIMIT,
    });
    pageCount = res.pageCount;
    for (const row of res.data) {
      const st = accountStatusFromPageRow(row);
      counts[st] += 1;
    }
    page += 1;
  }
  return counts;
}

const CUSTOMER_STATUS_CHART: { key: CustomerAccountStatus; label: string; color: string }[] = [
  { key: "draft", label: "Draft", color: "#f59e0b" },
  { key: "active", label: "Active", color: "#34d399" },
  { key: "inactive", label: "Inactive", color: "#94a3b8" },
  { key: "proposed", label: "Proposed", color: "#a78bfa" },
];

function buildCustomerAccountStatusConicGradient(counts: CustomerLifecycleByAccountStatus): string {
  const total = CUSTOMER_ACCOUNT_STATUS_ORDER.reduce((s, k) => s + counts[k], 0);
  if (total === 0) {
    return "linear-gradient(135deg, #1a2f3a 0%, #223844 100%)";
  }
  let cursor = 0;
  const parts: string[] = [];
  for (const { key, color } of CUSTOMER_STATUS_CHART) {
    const count = counts[key];
    if (count <= 0) continue;
    const deg = (count / total) * 360;
    const from = cursor;
    const to = cursor + deg;
    parts.push(`${color} ${from}deg ${to}deg`);
    cursor = to;
  }
  if (parts.length === 0) {
    return "linear-gradient(135deg, #1a2f3a 0%, #223844 100%)";
  }
  return `conic-gradient(from -90deg, ${parts.join(", ")})`;
}

const JOB_STATUS_CHART = [
  { key: "queued" as const, label: "Queued", color: "#94a3b8" },
  { key: "processing" as const, label: "Processing", color: "#38bdf8" },
  { key: "completed" as const, label: "Completed", color: "#34d399" },
  { key: "failed" as const, label: "Failed", color: "#f87171" },
  { key: "cancelled" as const, label: "Cancelled", color: "#fbbf24" },
] as const;

function buildJobStatusConicGradient(slice: StatusSlice): string {
  const total =
    slice.queued + slice.processing + slice.completed + slice.failed + slice.cancelled;
  if (total === 0) {
    return "linear-gradient(135deg, #1a2f3a 0%, #223844 100%)";
  }
  let cursor = 0;
  const parts: string[] = [];
  for (const { key, color } of JOB_STATUS_CHART) {
    const count = slice[key];
    if (count <= 0) continue;
    const deg = (count / total) * 360;
    const from = cursor;
    const to = cursor + deg;
    parts.push(`${color} ${from}deg ${to}deg`);
    cursor = to;
  }
  if (parts.length === 0) {
    return "linear-gradient(135deg, #1a2f3a 0%, #223844 100%)";
  }
  return `conic-gradient(from -90deg, ${parts.join(", ")})`;
}

function FileTasksStatusChart({ slice }: Readonly<{ slice: StatusSlice }>) {
  const total =
    slice.queued + slice.processing + slice.completed + slice.failed + slice.cancelled;
  const donutBackground = buildJobStatusConicGradient(slice);

  const ariaParts = JOB_STATUS_CHART.map(
    ({ key, label }) => `${label} ${slice[key].toLocaleString()}`,
  ).join(", ");

  return (
    <section className="flex h-full min-w-0 flex-col rounded-xl border border-border bg-surface-raised p-5">
      <h2 className="text-sm font-semibold text-ink">Jobs by status</h2>
      <p className="mt-1 text-xs text-muted">
        Counts come from the <span className="font-semibold text-ink-soft">jobs</span> table (<code className="rounded bg-surface-muted px-1 py-0.5 text-[10px]">GROUP BY status</code>
        ). The centre is every row once; each status row is part of that total.
      </p>

      <div className="mt-6 flex flex-col items-center gap-6">
        <div
          className="relative h-44 w-44 shrink-0"
          role="img"
          aria-label={`Jobs by status: ${ariaParts}; total ${total.toLocaleString()}`}
        >
          <div className="absolute inset-0 rounded-full border border-border shadow-inner" style={{ background: donutBackground }} />
          <div className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full border border-border bg-surface-raised text-center">
            <p className="text-2xl font-bold tabular-nums text-ink">{total.toLocaleString()}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">total</p>
          </div>
        </div>

        <div className="w-full space-y-3">
          {JOB_STATUS_CHART.map(({ key, label, color }) => {
            const count = slice[key];
            const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                    {label}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {count.toLocaleString()}
                    <span className="text-ink-soft"> ({pct}%)</span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{
                      width: total > 0 ? `${(count / total) * 100}%` : "0%",
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            );
          })}

          <Link to="/jobs" className="inline-block pt-2 text-xs font-semibold text-brand hover:underline">
            Open jobs
          </Link>
        </div>
      </div>
    </section>
  );
}

function CustomerLifecycleChart({ counts }: Readonly<{ counts: CustomerLifecycleByAccountStatus }>) {
  const total = CUSTOMER_ACCOUNT_STATUS_ORDER.reduce((s, k) => s + counts[k], 0);
  const donutBackground = buildCustomerAccountStatusConicGradient(counts);
  const ariaParts = CUSTOMER_STATUS_CHART.map(
    ({ key, label }) => `${label} ${counts[key].toLocaleString()}`,
  ).join(", ");

  return (
    <section className="flex h-full min-w-0 flex-col rounded-xl border border-border bg-surface-raised p-5">
      <h2 className="text-sm font-semibold text-ink">Customers by account status</h2>
      <p className="mt-1 text-xs text-muted">
        Same buckets as the customer directory: <span className="font-semibold text-ink-soft">account status</span> on
        the customer row, or draft vs active inferred from the latest onboarding submission when status is not set yet.
      </p>

      <div className="mt-6 flex flex-col items-center gap-6">
        <div
          className="relative h-44 w-44 shrink-0"
          role="img"
          aria-label={`Customers by account status: ${ariaParts}; total ${total.toLocaleString()}`}
        >
          <div className="absolute inset-0 rounded-full border border-border shadow-inner" style={{ background: donutBackground }} />
          <div className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full border border-border bg-surface-raised text-center">
            <p className="text-2xl font-bold tabular-nums text-ink">{total.toLocaleString()}</p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">customers</p>
          </div>
        </div>

        <div className="w-full space-y-3">
          {CUSTOMER_STATUS_CHART.map(({ key, label, color }) => {
            const count = counts[key];
            const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
            return (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
                    {label}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted">
                    {count.toLocaleString()}
                    <span className="text-ink-soft"> ({pct}%)</span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{
                      width: total > 0 ? `${(count / total) * 100}%` : "0%",
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            );
          })}

          <Link to="/customers" className="inline-block pt-2 text-xs font-semibold text-brand hover:underline">
            Open customer directory
          </Link>
        </div>
      </div>
    </section>
  );
}

function StatCard({
  title,
  value,
  hint,
  to,
}: Readonly<{
  title: string;
  value: string | number;
  hint?: string;
  to?: string;
}>) {
  const inner = (
    <div className="rounded-xl border border-border bg-surface-raised p-5 shadow-sm transition hover:border-brand/25">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{title}</p>
      <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{value}</p>
      {hint ? <p className="mt-2 text-xs text-muted">{hint}</p> : null}
    </div>
  );
  if (to) {
    return (
      <Link to={to} className="block min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        {inner}
      </Link>
    );
  }
  return inner;
}

export default function AdminDashboardPage() {
  const { apiBase, authHeaders } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [customerTotal, setCustomerTotal] = useState<number | null>(null);
  const [jobTotal, setJobTotal] = useState<number | null>(null);
  const [planActive, setPlanActive] = useState<number | null>(null);
  const [planTotal, setPlanTotal] = useState<number | null>(null);
  const [statusSlice, setStatusSlice] = useState<StatusSlice | null>(null);
  const [recentJobs, setRecentJobs] = useState<JobRow[]>([]);
  const [customerLifecycle, setCustomerLifecycle] = useState<CustomerLifecycleByAccountStatus | null>(null);

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    const headers = authHeaders();
    try {
      const [customersRes, jobCountsRes, plansRes, recentRes, lifecycleRes] = await Promise.all([
        fetchCustomersList(apiBase, headers, { page: 1, limit: 1, sort: "name,ASC" }).catch(() => null),
        fetchJobStatusCounts(apiBase, headers).catch(() => null),
        fetchBundleSubscriptionPlans(apiBase, headers).catch(() => null),
        fetchJobsList(apiBase, headers, { page: 1, limit: 5, sort: "createdAt,DESC" }).catch(() => null),
        fetchCustomerLifecycleCounts(apiBase, headers).catch(() => null),
      ]);
      const jobCounts = jobCountsRes ?? {
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        total: 0,
      };
      const plans = plansRes ?? [];
      const lifecycle = lifecycleRes ?? emptyLifecycleCounts();

      setCustomerTotal(customersRes?.total ?? null);
      setJobTotal(jobCounts.total);
      const activePlans = plans.filter((p) => p.isActive !== false).length;
      setPlanActive(plans.length > 0 ? activePlans : null);
      setPlanTotal(plans.length > 0 ? plans.length : null);
      setStatusSlice({
        queued: jobCounts.queued,
        processing: jobCounts.processing,
        completed: jobCounts.completed,
        failed: jobCounts.failed,
        cancelled: jobCounts.cancelled,
      });
      setRecentJobs(recentRes?.data ?? []);
      setCustomerLifecycle(lifecycle);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString());

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">Overview of customers, jobs, and catalogue configuration.</p>
      </div>

      {err ? (
        <div className="alert-error">
          {err}
          <button type="button" className="ml-3 font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard title="Customers" value={fmt(customerTotal)} hint="Companies on the platform" to="/customers" />
            <StatCard title="Jobs" value={fmt(jobTotal)} hint="All-time extraction jobs" to="/jobs" />
            <StatCard
              title="Subscription plans"
              value={planActive !== null && planTotal !== null ? `${planActive} / ${planTotal}` : "—"}
              hint="Active / total matrix plans (catalogue)"
              to="/settings/subscription"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
            {customerLifecycle ? <CustomerLifecycleChart counts={customerLifecycle} /> : null}
            {statusSlice ? <FileTasksStatusChart slice={statusSlice} /> : null}
          </div>

          <Can permission="customer:read">
            <StaffCompaniesHouseChartsSection />
          </Can>

          <Can permission="file:read">
            <CustomerDocumentUploadsDashboardCard
              apiBase={apiBase}
              authHeaders={authHeaders}
              onOpenDocument={(documentId) => navigate(`/files/documents/${documentId}`)}
            />
          </Can>

          <Can permission="customer:read">
            <StaffAccountsDeadlinesTable />
          </Can>

          <section className="rounded-xl border border-border bg-surface-raised p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">Recent jobs</h2>
              <Link to="/jobs" className="text-xs font-semibold text-brand hover:underline">
                View all
              </Link>
            </div>
            {recentJobs.length === 0 ? (
              <p className="mt-4 text-sm text-muted">No jobs yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-border">
                {recentJobs.map((j) => (
                  <li key={j.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                    <div className="min-w-0">
                      <Link to={`/jobs/${j.id}`} className="font-medium text-brand hover:underline">
                        {j.document?.name ?? j.file?.name ?? "File"}
                      </Link>
                      <p className="truncate text-xs text-muted">
                        {(j.customer?.name ?? j.customerId) ?? "Customer"} · {j.status}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">{j.createdAt ? formatDateTime(j.createdAt) : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
