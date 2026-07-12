import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchCompaniesHouseDashboardAggregates } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Can } from "../auth/Can";
import { TablePagination } from "./ui/TablePagination";
import { ToolbarButton } from "./ui/ToolbarButton";
import type { CompaniesHouseDashboardAggregatesResponse, CompaniesHouseDashboardBucket } from "../types/api";

const DONUT_COLORS = ["#34d399", "#38bdf8", "#f59e0b", "#a78bfa", "#f472b6", "#94a3b8", "#fbbf24", "#2dd4bf", "#fb7185"];
const YEAR_PAGE_SIZE = 8;

function mergeTailOther(buckets: CompaniesHouseDashboardBucket[], maxSlices: number): CompaniesHouseDashboardBucket[] {
  if (buckets.length <= maxSlices) return buckets;
  const head = buckets.slice(0, maxSlices - 1);
  const tail = buckets.slice(maxSlices - 1);
  const otherCount = tail.reduce((s, b) => s + b.count, 0);
  return [...head, { label: "Other", count: otherCount }];
}

function buildBucketConicGradient(buckets: CompaniesHouseDashboardBucket[]): string {
  const total = buckets.reduce((s, b) => s + b.count, 0);
  if (total <= 0) return "linear-gradient(135deg, #1a2f3a 0%, #223844 100%)";
  let cursor = 0;
  const parts: string[] = [];
  buckets.forEach((b, i) => {
    if (b.count <= 0) return;
    const deg = (b.count / total) * 360;
    const color = DONUT_COLORS[i % DONUT_COLORS.length];
    parts.push(`${color} ${cursor}deg ${cursor + deg}deg`);
    cursor += deg;
  });
  if (parts.length === 0) return "linear-gradient(135deg, #1a2f3a 0%, #223844 100%)";
  return `conic-gradient(from -90deg, ${parts.join(", ")})`;
}

function HorizontalBarChart({
  title,
  subtitle,
  buckets,
  emptyHint,
}: Readonly<{
  title: string;
  subtitle?: string;
  buckets: CompaniesHouseDashboardBucket[];
  emptyHint: string;
}>) {
  const max = useMemo(() => Math.max(1, ...buckets.map((b) => b.count)), [buckets]);
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface-muted/30 p-4">
      <h3 className="text-xs font-semibold text-ink">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-[10px] text-muted">{subtitle}</p> : null}
      {buckets.length === 0 ? (
        <p className="mt-3 text-xs text-muted">{emptyHint}</p>
      ) : (
        <ul className="scroll-subtle mt-3 max-h-56 space-y-2 overflow-y-auto">
          {buckets.map((b) => (
            <li key={b.label} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate font-medium text-ink-soft" title={b.label}>
                  {b.label}
                </span>
                <span className="shrink-0 tabular-nums text-muted">{b.count.toLocaleString()}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className="h-full rounded-full bg-brand/80 transition-[width]"
                  style={{ width: `${(b.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function YearBarChart({
  title,
  years,
  emptyHint,
}: Readonly<{
  title: string;
  years: { year: string; count: number }[];
  emptyHint: string;
}>) {
  const max = useMemo(() => Math.max(1, ...years.map((y) => y.count)), [years]);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(years.length / YEAR_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  useEffect(() => {
    setPage(1);
  }, [years]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const visibleYears = useMemo(() => {
    const start = (safePage - 1) * YEAR_PAGE_SIZE;
    return years.slice(start, start + YEAR_PAGE_SIZE);
  }, [years, safePage]);

  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border bg-surface-muted/30 p-4">
      <h3 className="text-xs font-semibold text-ink">{title}</h3>
      {years.length === 0 ? (
        <p className="mt-3 text-xs text-muted">{emptyHint}</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2">
            {visibleYears.map((y) => (
              <li key={y.year} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono font-medium text-ink-soft">{y.year}</span>
                  <span className="shrink-0 tabular-nums text-muted">{y.count.toLocaleString()}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-brand/70 transition-[width]"
                    style={{ width: `${(y.count / max) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <TablePagination
            page={safePage}
            pageCount={pageCount}
            total={years.length}
            pageSize={YEAR_PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function StaffCompaniesHouseChartsInner() {
  const { apiBase, authHeaders } = useAuth();
  const [data, setData] = useState<CompaniesHouseDashboardAggregatesResponse | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetchCompaniesHouseDashboardAggregates(apiBase, authHeaders());
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusForDonut = useMemo(
    () => mergeTailOther(data?.byCompanyStatus ?? [], 10),
    [data?.byCompanyStatus],
  );
  const statusTotal = useMemo(() => statusForDonut.reduce((s, b) => s + b.count, 0), [statusForDonut]);
  const donutBg = useMemo(() => buildBucketConicGradient(statusForDonut), [statusForDonut]);
  const ariaStatus = useMemo(
    () => statusForDonut.map((b) => `${b.label} ${b.count}`).join(", "),
    [statusForDonut],
  );

  const typeBars = useMemo(() => mergeTailOther(data?.byChType ?? [], 14), [data?.byChType]);
  const displayTypeBars = useMemo(
    () => mergeTailOther(data?.byOnboardingCompanyType ?? [], 14),
    [data?.byOnboardingCompanyType],
  );

  return (
    <section className="rounded-xl border border-border bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Companies House snapshot</h2>
          <p className="mt-1 max-w-3xl text-xs text-muted">
            From <code className="rounded bg-surface-muted px-1 py-0.5 text-[10px]">onboarding_data.companies_house</code>{" "}
            (synced profile). Status and type charts include only customers with a stored CH snapshot.
          </p>
        </div>
        <ToolbarButton onClick={() => void load()}>Refresh</ToolbarButton>
      </div>

      {err ? <p className="mt-3 text-xs text-feedback-warning">{err}</p> : null}
      {loading ? (
        <p className="mt-4 text-sm text-muted">Loading CH aggregates…</p>
      ) : data ? (
        <>
          <p className="mt-3 text-xs text-muted">
            <span className="font-medium text-ink-soft">{data.customersWithChSnapshot.toLocaleString()}</span> of{" "}
            <span className="font-medium text-ink-soft">{data.totalCustomersInScope.toLocaleString()}</span> customers
            in your scope have a CH snapshot.
          </p>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center sm:gap-8">
              <div
                className="relative h-44 w-44 shrink-0"
                role="img"
                aria-label={`Company status: ${ariaStatus}; total ${statusTotal}`}
              >
                <div
                  className="absolute inset-0 rounded-full border border-border shadow-inner"
                  style={{ background: donutBg }}
                />
                <div className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full border border-border bg-surface-raised text-center">
                  <p className="text-xl font-bold tabular-nums text-ink">{statusTotal.toLocaleString()}</p>
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">by status</p>
                </div>
              </div>
              <ul className="w-full max-w-xs space-y-2 text-xs">
                {statusForDonut.map((b, i) => (
                  <li key={b.label} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                        aria-hidden
                      />
                      <span className="truncate text-ink-soft" title={b.label}>
                        {b.label}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">{b.count.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <HorizontalBarChart
                title="CH legal type"
                subtitle="Raw code from Companies House (e.g. ltd, plc)."
                buckets={typeBars}
                emptyHint="No CH type values yet."
              />
              <HorizontalBarChart
                title="Company type (display)"
                subtitle="From onboarding company.type (e.g. Limited company)."
                buckets={displayTypeBars}
                emptyHint="No display type on synced rows."
              />
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <YearBarChart
              title="Date of creation (by year)"
              years={data.byCreationYear}
              emptyHint="No creation dates in CH snapshots (expect YYYY-MM-DD)."
            />
            <YearBarChart
              title="Date of cessation (by year)"
              years={data.byCessationYear}
              emptyHint="No cessation dates — normal for active companies."
            />
          </div>
        </>
      ) : null}
    </section>
  );
}

export function StaffCompaniesHouseChartsSection() {
  return (
    <Can permission="customer:read">
      <StaffCompaniesHouseChartsInner />
    </Can>
  );
}
