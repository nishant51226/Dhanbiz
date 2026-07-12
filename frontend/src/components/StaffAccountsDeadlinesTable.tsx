import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { fetchAllCustomersPageWithSubmissionData } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { DateRangePickerField } from "./DateRangePickerField";
import { SearchableCustomerSelect } from "./SearchableCustomerSelect";
import { getOnboardingDotPath } from "../dashboard/onboarding-card-templates";
import type { CustomerPageRowWithSubmission } from "../types/api";
import { buildCsv, downloadCsvFile } from "../utils/csvDownload";
import { accountStatusFromPageRow } from "../utils/customerAccountStatusFromPageRow";
import { customerOnboardingDisplayRoot } from "../utils/customerOnboardingDisplayRoot";

import { formatDateDisplay } from "../utils/formatDate";
import { TablePagination } from "./ui/TablePagination";
import { ToolbarButton } from "./ui/ToolbarButton";
import { ModalBackdrop } from "./ui/ModalBackdrop";

const PATHS = {
  registrationNumber: "company.number",
  periodEnd: "companies_house.accounts.next_accounts_period_end_on",
  accountsDue: "companies_house.accounts.next_accounts_due_on",
  madeUpTo: "companies_house.confirmation_statement.next_made_up_to",
  overdue: "companies_house.accounts.next_accounts_overdue",
} as const;

/** Staff-entered filing dates on onboarding root (legacy keys). */
const CUSTOM_ACCOUNTS_DUE_KEYS = ["accounts_fd", "accountsFd", "acsFd"] as const;
const CUSTOM_CS_DUE_KEYS = ["cs", "confirmation_stmt", "confirmationStmt"] as const;

type SortColumn =
  | "customer"
  | "accountStatus"
  | "periodEnd"
  | "accountsDue"
  | "madeUpTo"
  | "customAccountsDue"
  | "customCsDue"
  | "overdue";

type SortDirection = "asc" | "desc";

/** Combined accounts-overdue and CH date-completeness filter. */
type StatusFilter =
  | "all"
  | "overdue_yes"
  | "overdue_no"
  | "overdue_unknown"
  | "ch_dates_any_missing"
  | "ch_dates_all_present";

/** Which table date column drives the upcoming / relative-date filter. */
type UpcomingDateColumn =
  | "none"
  | "period_end"
  | "accounts_due"
  | "made_up_to"
  | "custom_accounts_due"
  | "custom_cs_due";

/**
 * Relative to calendar start of today (local): past, upcoming windows, missing ISO date, or any upcoming.
 */
type UpcomingDateWindow = "any" | "missing" | "past" | "d30" | "d90" | "d180" | "future";

function startOfTodayLocalMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Parse leading YYYY-MM-DD as a local calendar day (midnight). */
function parseLocalDayMs(isoLike: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoLike.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const da = Number(m[3]);
  const d = new Date(y, mo, da);
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== da) return null;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function pickCustomRootDate(root: Record<string, unknown> | null, keys: readonly string[]): string {
  if (!root) return "—";
  for (const key of keys) {
    const v = root[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "—";
}

function pathForUpcomingColumn(col: UpcomingDateColumn): string | null {
  if (col === "none") return null;
  if (col === "period_end") return PATHS.periodEnd;
  if (col === "accounts_due") return PATHS.accountsDue;
  if (col === "made_up_to") return PATHS.madeUpTo;
  return null;
}

function rawDateForColumn(root: Record<string, unknown> | null, col: UpcomingDateColumn): string {
  if (col === "none") return "—";
  const chPath = pathForUpcomingColumn(col);
  if (chPath) return getOnboardingDotPath(root, chPath);
  if (col === "custom_accounts_due") return pickCustomRootDate(root, CUSTOM_ACCOUNTS_DUE_KEYS);
  if (col === "custom_cs_due") return pickCustomRootDate(root, CUSTOM_CS_DUE_KEYS);
  return "—";
}

function matchesCustomDateRangeFilter(
  root: Record<string, unknown> | null,
  col: UpcomingDateColumn,
  from: string,
  to: string,
): boolean {
  if (!from.trim() && !to.trim()) return true;
  if (col === "none") return true;
  const raw = rawDateForColumn(root, col);
  if (raw === "—" || !raw.trim()) return false;
  const dayMs = parseLocalDayMs(raw);
  if (dayMs === null) return false;
  if (from.trim()) {
    const fromMs = parseLocalDayMs(from.trim());
    if (fromMs !== null && dayMs < fromMs) return false;
  }
  if (to.trim()) {
    const toMs = parseLocalDayMs(to.trim());
    if (toMs !== null && dayMs > toMs) return false;
  }
  return true;
}

/** Client-side: filter rows where the chosen CH date matches the window vs today. */
function matchesUpcomingDateFilter(
  root: Record<string, unknown> | null,
  col: UpcomingDateColumn,
  win: UpcomingDateWindow,
): boolean {
  if (col === "none" || win === "any") return true;
  const raw = rawDateForColumn(root, col);
  const missing = raw === "—" || !String(raw).trim();
  if (win === "missing") return missing;

  if (missing) return false;
  const dayMs = parseLocalDayMs(raw);
  if (dayMs === null) return false;

  const todayMs = startOfTodayLocalMs();
  const diffDays = Math.round((dayMs - todayMs) / 86_400_000);

  switch (win) {
    case "past":
      return diffDays < 0;
    case "future":
      return diffDays >= 0;
    case "d30":
      return diffDays >= 0 && diffDays <= 30;
    case "d90":
      return diffDays >= 0 && diffDays <= 90;
    case "d180":
      return diffDays >= 0 && diffDays <= 180;
    default:
      return true;
  }
}

const ACCOUNT_STATUS_SORT_ORDER: Record<ReturnType<typeof accountStatusFromPageRow>, number> = {
  draft: 0,
  proposed: 1,
  inactive: 2,
  active: 3,
};

function sortValueForColumn(row: CustomerPageRowWithSubmission, col: SortColumn): string | number {
  const root = customerOnboardingDisplayRoot(row);
  switch (col) {
    case "customer":
      return customerDisplayLabel(row).toLowerCase();
    case "accountStatus":
      return ACCOUNT_STATUS_SORT_ORDER[accountStatusFromPageRow(row)] ?? 9;
    case "periodEnd":
      return rawDateForColumn(root, "period_end");
    case "accountsDue":
      return rawDateForColumn(root, "accounts_due");
    case "madeUpTo":
      return rawDateForColumn(root, "made_up_to");
    case "customAccountsDue":
      return rawDateForColumn(root, "custom_accounts_due");
    case "customCsDue":
      return rawDateForColumn(root, "custom_cs_due");
    case "overdue": {
      const raw = getOnboardingDotPath(root, PATHS.overdue);
      if (raw === "true") return 2;
      if (raw === "false") return 1;
      return 0;
    }
    default:
      return "";
  }
}

function compareSortValues(a: string | number, b: string | number, dir: SortDirection): number {
  const mul = dir === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * mul;

  const as = String(a);
  const bs = String(b);
  const aMissing = as === "—" || !as.trim();
  const bMissing = bs === "—" || !bs.trim();
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  const aMs = parseLocalDayMs(as);
  const bMs = parseLocalDayMs(bs);
  if (aMs !== null && bMs !== null) return (aMs - bMs) * mul;

  return as.localeCompare(bs, undefined, { sensitivity: "base" }) * mul;
}

function compareRows(
  a: CustomerPageRowWithSubmission,
  b: CustomerPageRowWithSubmission,
  col: SortColumn,
  dir: SortDirection,
): number {
  return compareSortValues(sortValueForColumn(a, col), sortValueForColumn(b, col), dir);
}

function formatDashboardCell(raw: string): string {
  return formatDateDisplay(raw);
}

function accountStatusLabel(status: ReturnType<typeof accountStatusFromPageRow>): string {
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  if (status === "proposed") return "Proposed";
  return "Draft";
}

function customerDisplayLabel(row: CustomerPageRowWithSubmission): string {
  const name = row.name?.trim() || "Unnamed customer";
  const root = customerOnboardingDisplayRoot(row);
  const reg = getOnboardingDotPath(root, PATHS.registrationNumber);
  const regTrim = reg === "—" ? "" : reg.trim();
  return regTrim ? `${name} (${regTrim})` : name;
}

function rowCells(root: Record<string, unknown> | null) {
  return {
    periodEnd: formatDashboardCell(getOnboardingDotPath(root, PATHS.periodEnd)),
    accountsDue: formatDashboardCell(getOnboardingDotPath(root, PATHS.accountsDue)),
    madeUpTo: formatDashboardCell(getOnboardingDotPath(root, PATHS.madeUpTo)),
    customAccountsDue: formatDashboardCell(pickCustomRootDate(root, CUSTOM_ACCOUNTS_DUE_KEYS)),
    customCsDue: formatDashboardCell(pickCustomRootDate(root, CUSTOM_CS_DUE_KEYS)),
    overdue: formatDashboardCell(getOnboardingDotPath(root, PATHS.overdue)),
  };
}

const EXPORT_COLUMNS = [
  { id: "customer", label: "Customer" },
  { id: "accountStatus", label: "Account status" },
  { id: "periodEnd", label: "Financial Year End" },
  { id: "accountsDue", label: "Accounts Due Date (CH)" },
  { id: "madeUpTo", label: "CS Due Date (CH)" },
  { id: "customAccountsDue", label: "Custom accounts due" },
  { id: "customCsDue", label: "Custom CS due" },
  { id: "overdue", label: "Overdue" },
] as const;

type ExportColumnId = (typeof EXPORT_COLUMNS)[number]["id"];

const DEFAULT_EXPORT_COLUMNS: ExportColumnId[] = EXPORT_COLUMNS.map((c) => c.id);

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

function exportColumnValue(row: CustomerPageRowWithSubmission, columnId: ExportColumnId): string {
  const root = customerOnboardingDisplayRoot(row);
  const c = rowCells(root);
  switch (columnId) {
    case "customer":
      return customerDisplayLabel(row);
    case "accountStatus":
      return accountStatusLabel(accountStatusFromPageRow(row));
    case "periodEnd":
      return c.periodEnd;
    case "accountsDue":
      return c.accountsDue;
    case "madeUpTo":
      return c.madeUpTo;
    case "customAccountsDue":
      return c.customAccountsDue;
    case "customCsDue":
      return c.customCsDue;
    case "overdue":
      return c.overdue;
    default:
      return "—";
  }
}

function exportDeadlinesCsv(rows: CustomerPageRowWithSubmission[], columnIds: ExportColumnId[]): void {
  const cols = EXPORT_COLUMNS.filter((c) => columnIds.includes(c.id));
  if (cols.length === 0) return;
  const headers = cols.map((c) => c.label);
  const dataRows = rows.map((r) => cols.map((c) => exportColumnValue(r, c.id)));
  const csv = buildCsv(headers, dataRows);
  downloadCsvFile(`accounts-deadlines_${new Date().toISOString().slice(0, 10)}.csv`, csv);
}

function chDateMissing(root: Record<string, unknown> | null, dotPath: string): boolean {
  return getOnboardingDotPath(root, dotPath) === "—";
}

const inp =
  "h-10 rounded-lg border border-border bg-surface-input px-3 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand";
const lab = "text-[10px] font-bold uppercase tracking-wide text-muted";
const sel = `${inp} min-w-0`;

/** Shared filter cell: fixed label band + equal-height control row. */
function FilterField({
  label,
  children,
  className = "",
}: Readonly<{
  label: string;
  children: ReactNode;
  className?: string;
}>) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className={`${lab} flex min-h-[2.25rem] items-end leading-snug`}>{label}</span>
      <div className="flex min-h-10 items-center [&_.MuiFormControl-root]:m-0 [&_.MuiFormControl-root]:w-full [&_.MuiInputBase-root]:min-h-10">
        {children}
      </div>
    </div>
  );
}

function ariaSortValue(active: boolean, sortDirection: SortDirection): "ascending" | "descending" | "none" {
  if (!active) return "none";
  if (sortDirection === "asc") return "ascending";
  return "descending";
}

function SortableColumnHeader({
  label,
  column,
  sortColumn,
  sortDirection,
  onSort,
  className = "",
}: Readonly<{
  label: string;
  column: SortColumn;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  className?: string;
}>) {
  const active = sortColumn === column;
  const ariaSort = ariaSortValue(active, sortDirection);
  return (
    <th className={className} aria-sort={ariaSort}>
      <button
        type="button"
        className="inline-flex max-w-full items-center gap-1 text-left font-semibold text-ink hover:text-brand focus:outline-none focus-visible:ring-1 focus-visible:ring-brand"
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <span className="inline-flex shrink-0 flex-col leading-none" aria-hidden>
          <span className={active && sortDirection === "asc" ? "text-brand" : "text-muted/50"}>▲</span>
          <span className={`-mt-0.5 ${active && sortDirection === "desc" ? "text-brand" : "text-muted/50"}`}>▼</span>
        </span>
      </button>
    </th>
  );
}

export function StaffAccountsDeadlinesTable() {
  const { apiBase, authHeaders } = useAuth();
  const [rawRows, setRawRows] = useState<CustomerPageRowWithSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("customer");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [dateRangeColumn, setUpcomingDateColumn] = useState<UpcomingDateColumn>("none");
  const [dateRangeFrom, setDateRangeFrom] = useState("");
  const [dateRangeTo, setDateRangeTo] = useState("");
  const [upcomingColumn, setUpcomingColumn] = useState<UpcomingDateColumn>("none");
  const [upcomingWindow, setUpcomingWindow] = useState<UpcomingDateWindow>("any");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportColumns, setExportColumns] = useState<ExportColumnId[]>(() => [...DEFAULT_EXPORT_COLUMNS]);
  const [exportErr, setExportErr] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const all = await fetchAllCustomersPageWithSubmissionData(apiBase, authHeaders(), {
        sort: "name,ASC",
        filters: { accountStatus: "active" },
      });
      setRawRows(all);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load customers");
      setRawRows([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [
    filterCustomerId,
    statusFilter,
    dateRangeColumn,
    dateRangeFrom,
    dateRangeTo,
    upcomingColumn,
    upcomingWindow,
    sortColumn,
    sortDirection,
  ]);

  const customerFilterOptions = useMemo(
    () =>
      [...rawRows]
        .map((r) => ({ id: r.id, name: customerDisplayLabel(r) }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [rawRows],
  );

  const toggleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  const displayRows = useMemo(() => {
    const filtered = rawRows.filter((r) => {
      if (accountStatusFromPageRow(r) !== "active") return false;
      if (filterCustomerId && r.id !== filterCustomerId) return false;
      const root = customerOnboardingDisplayRoot(r);
      const c = rowCells(root);

      const missingPeriod = chDateMissing(root, PATHS.periodEnd);
      const missingDue = chDateMissing(root, PATHS.accountsDue);
      const missingMadeUp = chDateMissing(root, PATHS.madeUpTo);
      const anyMissing = missingPeriod || missingDue || missingMadeUp;
      const allPresent = !missingPeriod && !missingDue && !missingMadeUp;

      switch (statusFilter) {
        case "overdue_yes":
          if (c.overdue !== "Yes") return false;
          break;
        case "overdue_no":
          if (c.overdue !== "No") return false;
          break;
        case "overdue_unknown":
          if (c.overdue !== "—") return false;
          break;
        case "ch_dates_any_missing":
          if (!anyMissing) return false;
          break;
        case "ch_dates_all_present":
          if (!allPresent) return false;
          break;
        default:
          break;
      }

      if (!matchesUpcomingDateFilter(root, upcomingColumn, upcomingWindow)) return false;
      if (!matchesCustomDateRangeFilter(root, dateRangeColumn, dateRangeFrom, dateRangeTo)) return false;

      return true;
    });
    return [...filtered].sort((a, b) => compareRows(a, b, sortColumn, sortDirection));
  }, [
    rawRows,
    filterCustomerId,
    statusFilter,
    upcomingColumn,
    upcomingWindow,
    dateRangeColumn,
    dateRangeFrom,
    dateRangeTo,
    sortColumn,
    sortDirection,
  ]);

  const pageCount = Math.max(1, Math.ceil(displayRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return displayRows.slice(start, start + pageSize);
  }, [displayRows, currentPage, pageSize]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const toggleExportColumn = (id: ExportColumnId) => {
    setExportColumns((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return DEFAULT_EXPORT_COLUMNS.filter((col) => next.includes(col));
    });
  };

  const runExport = () => {
    setExportErr("");
    const ordered = DEFAULT_EXPORT_COLUMNS.filter((id) => exportColumns.includes(id));
    if (ordered.length === 0) {
      setExportErr("Select at least one column.");
      return;
    }
    if (displayRows.length === 0) {
      setExportErr("No customers to export with the current filters.");
      return;
    }
    exportDeadlinesCsv(displayRows, ordered);
    setExportOpen(false);
  };

  return (
    <section className="rounded-xl border border-border bg-surface-raised p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Accounts & confirmation deadlines</h2>
          <p className="mt-1 max-w-3xl text-xs text-muted">
            Active customers only (draft, inactive, proposed, and archived excluded). Click a column header to sort.
            Row values merge the latest form submission where present and Companies House fields on{" "}
            <span className="font-medium text-ink-soft">customers.onboarding_data</span>. Custom dates use staff fields
            on onboarding root (accounts_fd, cs). Filter by customer, status (overdue / CH dates), absolute date range,
            or a relative upcoming window on CH or custom date columns.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ToolbarButton
            onClick={() => {
              setExportErr("");
              setExportColumns([...DEFAULT_EXPORT_COLUMNS]);
              setExportOpen(true);
            }}
          >
            Download
          </ToolbarButton>
          <ToolbarButton onClick={() => void load()}>Refresh</ToolbarButton>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FilterField label="Filter">
          <select
            className={`${sel} w-full`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">All rows</option>
            <optgroup label="Accounts overdue">
              <option value="overdue_yes">Overdue only</option>
              <option value="overdue_no">Not overdue</option>
              <option value="overdue_unknown">Unknown / missing flag</option>
            </optgroup>
            <optgroup label="CH date columns">
              <option value="ch_dates_any_missing">Any date missing</option>
              <option value="ch_dates_all_present">All three dates present</option>
            </optgroup>
          </select>
        </FilterField>
        <FilterField label="Customer">
          <SearchableCustomerSelect
            customers={customerFilterOptions}
            value={filterCustomerId}
            onChange={setFilterCustomerId}
            allowEmpty
            emptyLabel="All customers"
            size="small"
            className="w-full"
          />
        </FilterField>
        <FilterField label="Date filter — column">
          <select
            className={`${sel} w-full`}
            value={dateRangeColumn}
            onChange={(e) => {
              const v = e.target.value as UpcomingDateColumn;
              setUpcomingDateColumn(v);
              if (v === "none") {
                setDateRangeFrom("");
                setDateRangeTo("");
              }
            }}
          >
            <option value="none">None</option>
            <option value="period_end">Financial Year End (CH)</option>
            <option value="accounts_due">Accounts Due Date (CH)</option>
            <option value="made_up_to">CS Due Date (CH)</option>
            <option value="custom_accounts_due">Custom accounts due</option>
            <option value="custom_cs_due">Custom CS due</option>
          </select>
        </FilterField>
        <FilterField label="Date range">
          <DateRangePickerField
            from={dateRangeFrom}
            to={dateRangeTo}
            disabled={dateRangeColumn === "none"}
            onChange={(from, to) => {
              setDateRangeFrom(from);
              setDateRangeTo(to);
            }}
          />
        </FilterField>
        <FilterField label="Upcoming filter — date column">
          <select
            className={`${sel} w-full`}
            value={upcomingColumn}
            onChange={(e) => {
              const v = e.target.value as UpcomingDateColumn;
              setUpcomingColumn(v);
              if (v === "none") setUpcomingWindow("any");
            }}
          >
            <option value="none">None (no date window filter)</option>
            <option value="period_end">Financial Year End (CH)</option>
            <option value="accounts_due">Accounts Due Date (CH)</option>
            <option value="made_up_to">CS Due Date (CH)</option>
            <option value="custom_accounts_due">Custom accounts due</option>
            <option value="custom_cs_due">Custom CS due</option>
          </select>
        </FilterField>
        <FilterField label="Upcoming filter — vs today" className="sm:col-span-2 lg:col-span-2">
          <select
            className={`${sel} w-full`}
            value={upcomingWindow}
            disabled={upcomingColumn === "none"}
            onChange={(e) => setUpcomingWindow(e.target.value as UpcomingDateWindow)}
          >
            <option value="any">All (no relative date rule)</option>
            <option value="missing">Missing / not a YYYY-MM-DD date</option>
            <option value="past">Past (before today)</option>
            <option value="future">Upcoming — on or after today</option>
            <option value="d30">Upcoming — within next 30 days (incl. today)</option>
            <option value="d90">Upcoming — within next 90 days (incl. today)</option>
            <option value="d180">Upcoming — within next 180 days (incl. today)</option>
          </select>
        </FilterField>
      </div>

      {err ? <p className="mt-3 text-xs text-feedback-error">{err}</p> : null}
      {loading ? (
        <p className="mt-4 text-sm text-muted">Loading customers…</p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-muted/80">
                <SortableColumnHeader
                  label="Customer"
                  column="customer"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                  className="sticky left-0 z-[1] whitespace-nowrap border-r border-border/60 bg-surface-muted/95 px-3 py-2.5"
                />
                <SortableColumnHeader
                  label="Account status"
                  column="accountStatus"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                  className="whitespace-nowrap px-3 py-2.5"
                />
                <SortableColumnHeader
                  label="Financial Year End"
                  column="periodEnd"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                  className="whitespace-nowrap px-3 py-2.5"
                />
                <SortableColumnHeader
                  label="Accounts Due (CH)"
                  column="accountsDue"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                  className="whitespace-nowrap px-3 py-2.5"
                />
                <SortableColumnHeader
                  label="CS Due (CH)"
                  column="madeUpTo"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                  className="whitespace-nowrap px-3 py-2.5"
                />
                <SortableColumnHeader
                  label="Custom accounts due"
                  column="customAccountsDue"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                  className="whitespace-nowrap px-3 py-2.5"
                />
                <SortableColumnHeader
                  label="Custom CS due"
                  column="customCsDue"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                  className="whitespace-nowrap px-3 py-2.5"
                />
                <SortableColumnHeader
                  label="Overdue"
                  column="overdue"
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={toggleSort}
                  className="whitespace-nowrap px-3 py-2.5"
                />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {displayRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted">
                    {rawRows.length === 0
                      ? "No customers in this view."
                      : "No customers match the current filters. Try clearing filters."}
                  </td>
                </tr>
              ) : (
                paginatedRows.map((r) => {
                  const root = customerOnboardingDisplayRoot(r);
                  const c = rowCells(root);
                  const overdueYes = c.overdue === "Yes";
                  const status = accountStatusFromPageRow(r);
                  return (
                    <tr key={r.id} className="group bg-surface-raised/80 hover:bg-surface-muted/20">
                      <td className="sticky left-0 z-[1] border-r border-border/60 bg-surface-raised px-3 py-2 font-medium group-hover:bg-surface-muted/20">
                        <Link to={`/customers/${r.id}/dashboard`} className="text-brand hover:underline">
                          {customerDisplayLabel(r)}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-ink-soft">{accountStatusLabel(status)}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-soft">{c.periodEnd}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-soft">{c.accountsDue}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-soft">{c.madeUpTo}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-soft">{c.customAccountsDue}</td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-soft">{c.customCsDue}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span
                          className={
                            overdueYes
                              ? "font-semibold text-feedback-warning"
                              : c.overdue === "—"
                                ? "text-muted"
                                : "text-feedback-success"
                          }
                        >
                          {c.overdue}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <TablePagination
            page={currentPage}
            pageCount={pageCount}
            total={displayRows.length}
            pageSize={pageSize}
            onPageChange={setPage}
            pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      )}
      {exportOpen ? (
        <>
          <ModalBackdrop onClose={() => setExportOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <dialog
              open
              className="pointer-events-auto m-0 w-full max-w-md rounded-xl border border-border bg-surface-raised p-5 shadow-xl"
              aria-labelledby="deadlines-export-title"
            >
              <h3 id="deadlines-export-title" className="text-sm font-semibold text-ink">
                Download deadlines export
              </h3>
              <p className="mt-1 text-xs text-muted">
                Choose columns to include. Exports {displayRows.length.toLocaleString()} customer
                {displayRows.length === 1 ? "" : "s"} matching the current filters.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-brand hover:underline"
                  onClick={() => setExportColumns([...DEFAULT_EXPORT_COLUMNS])}
                >
                  Select all
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-brand hover:underline"
                  onClick={() => setExportColumns([])}
                >
                  Clear all
                </button>
              </div>
              <ul className="mt-3 space-y-2">
                {EXPORT_COLUMNS.map((col) => (
                  <li key={col.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
                      <input
                        type="checkbox"
                        checked={exportColumns.includes(col.id)}
                        onChange={() => toggleExportColumn(col.id)}
                        className="rounded border-border"
                      />
                      {col.label}
                    </label>
                  </li>
                ))}
              </ul>
              {exportErr ? <p className="mt-3 text-xs text-feedback-error">{exportErr}</p> : null}
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted"
                  onClick={() => setExportOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-md hover:bg-brand-hover"
                  onClick={runExport}
                >
                  Download CSV
                </button>
              </div>
            </dialog>
          </div>
        </>
      ) : null}
    </section>
  );
}
