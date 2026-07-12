import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  createFolder,
  deleteDriveFile,
  fetchCustomer,
  fetchCustomerInvoices,
  fetchCustomerStatements,
  fetchFilesForCustomer,
  fetchJobsByFileId,
} from "../api/client";
import { FolderUploadButton } from "../components/FolderUploadButton";
import { UploadDialog } from "../components/UploadDialog";
import { TablePagination } from "../components/ui/TablePagination";
import { ModalDialog } from "../components/ui/ModalDialog";
import { useAuth } from "../auth/AuthContext";
import { formatDateDisplay, formatDateTime, normalizeFinancialDateToIso, parseIsoDate } from "../utils/formatDate";
import { uploadFolderTree } from "../utils/uploadFolderTree";
import { buildCsv, downloadCsvFile } from "../utils/csvDownload";
import { canDeleteDriveFiles } from "../utils/canDeleteDriveFiles";
import { canCreateCustomerFolder } from "../utils/canCreateCustomerFolder";
import type { CustomerInvoiceRow, CustomerStatementRow, DriveFile, JobRow } from "../types/api";

type CustomerTab = "files" | "invoices" | "statements";
type ViewMode = "list" | "grid" | "columns" | "flat";
/** Folders first; then by name or created date. */
type DriveSortMode = "name" | "createdDesc" | "createdAsc";

function createdMs(f: DriveFile): number {
  const t = new Date(f.createdAt ?? 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function sortEntries(items: DriveFile[], mode: DriveSortMode): DriveFile[] {
  return [...items].sort((a, b) => {
    if (a.fileType !== b.fileType) return a.fileType === "folder" ? -1 : 1;
    if (mode === "name") return a.name.localeCompare(b.name);
    const ca = createdMs(a);
    const cb = createdMs(b);
    if (ca !== cb) return mode === "createdDesc" ? cb - ca : ca - cb;
    return a.name.localeCompare(b.name);
  });
}

function childrenOf(files: DriveFile[], parentId: string | null, mode: DriveSortMode): DriveFile[] {
  return sortEntries(files.filter((f) => f.parentId === parentId), mode);
}

function buildPathStrings(files: DriveFile[]): Map<string, string> {
  const byId = new Map(files.map((f) => [f.id, f] as const));
  const memo = new Map<string, string>();
  function pathFor(id: string): string {
    const hit = memo.get(id);
    if (hit !== undefined) return hit;
    const f = byId.get(id);
    if (!f) {
      memo.set(id, id);
      return id;
    }
    if (!f.parentId) {
      memo.set(id, f.name);
      return f.name;
    }
    const p = pathFor(f.parentId);
    const s = `${p}/${f.name}`;
    memo.set(id, s);
    return s;
  }
  for (const f of files) {
    pathFor(f.id);
  }
  return memo;
}

function parseCustomerTab(raw: string | null): CustomerTab {
  if (raw === "invoices" || raw === "statements") return raw;
  return "files";
}

function formatMoney(amount: number | null, currency: string | null): string {
  if (amount === null || Number.isNaN(amount)) return "—";
  const cur = currency?.trim() || "";
  return cur ? `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}` : String(amount);
}

type SortDir = "asc" | "desc";

type InvoiceSortKey =
  | "invoiceDate"
  | "invoiceNumber"
  | "vendor"
  | "status"
  | "tax"
  | "total"
  | "pages"
  | "fileName";

type StatementSortKey =
  | "accountHolder"
  | "bankName"
  | "period"
  | "closingBalance"
  | "fileName"
  | "pages"
  | "status";

function cmpStr(a: string | null, b: string | null): number {
  return (a ?? "").localeCompare(b ?? "", undefined, { sensitivity: "base" });
}

function cmpNum(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function defaultInvoiceSortDir(key: InvoiceSortKey): SortDir {
  if (key === "invoiceDate" || key === "tax" || key === "total") return "desc";
  return "asc";
}

function defaultStatementSortDir(key: StatementSortKey): SortDir {
  if (key === "period" || key === "closingBalance") return "desc";
  return "asc";
}

const DEFAULT_INVOICE_SORT: { key: InvoiceSortKey; dir: SortDir } = { key: "pages", dir: "asc" };
const DEFAULT_STATEMENT_SORT: { key: StatementSortKey; dir: SortDir } = { key: "pages", dir: "asc" };
const DEFAULT_FIN_PAGE_SIZE = 50;

function parseRowDate(s: string | null | undefined): number | null {
  if (s == null || !String(s).trim()) return null;
  const raw = String(s).trim();
  const iso = normalizeFinancialDateToIso(raw);
  if (iso) {
    const t = Date.parse(`${iso}T12:00:00.000Z`);
    return Number.isNaN(t) ? null : t;
  }
  const t = parseIsoDate(raw)?.getTime() ?? Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}

function inDateRange(rowDateMs: number | null, fromYmd: string, toYmd: string): boolean {
  if (!fromYmd.trim() && !toYmd.trim()) return true;
  if (rowDateMs === null) return false;
  const fromT = fromYmd.trim() ? Date.parse(`${fromYmd.trim()}T00:00:00`) : -Infinity;
  const toT = toYmd.trim() ? Date.parse(`${toYmd.trim()}T23:59:59.999`) : Infinity;
  return rowDateMs >= fromT && rowDateMs <= toT;
}

function fieldContains(hay: string | null | undefined, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  if (!n) return true;
  return (hay ?? "").toLowerCase().includes(n);
}

function filterInvoiceRow(
  row: CustomerInvoiceRow,
  f: {
    dateFrom: string;
    dateTo: string;
    invoice: string;
    vendor: string;
    file: string;
    status: string;
  }
): boolean {
  if (!inDateRange(parseRowDate(row.invoiceDate), f.dateFrom, f.dateTo)) return false;
  if (!fieldContains(row.invoiceNumber, f.invoice)) return false;
  if (!fieldContains(row.vendor, f.vendor)) return false;
  if (
    !fieldContains(row.fileName, f.file) &&
    !fieldContains(row.fileId, f.file) &&
    !fieldContains(row.documentId, f.file)
  ) {
    return false;
  }
  if (f.status.trim() && row.status !== f.status.trim()) return false;
  return true;
}

function filterStatementRow(
  row: CustomerStatementRow,
  f: {
    periodFrom: string;
    periodTo: string;
    account: string;
    bank: string;
    file: string;
    status: string;
  }
): boolean {
  const periodMs = parseRowDate(row.periodStart) ?? parseRowDate(row.periodEnd);
  if (!inDateRange(periodMs, f.periodFrom, f.periodTo)) return false;
  if (!fieldContains(row.accountHolder, f.account)) return false;
  if (!fieldContains(row.bankName, f.bank)) return false;
  if (
    !fieldContains(row.fileName, f.file) &&
    !fieldContains(row.fileId, f.file) &&
    !fieldContains(row.documentId, f.file)
  ) {
    return false;
  }
  if (f.status.trim() && row.status !== f.status.trim()) return false;
  return true;
}

function sortInvoices(rows: CustomerInvoiceRow[], key: InvoiceSortKey, dir: SortDir): CustomerInvoiceRow[] {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let c = 0;
    switch (key) {
      case "invoiceDate":
        c = cmpStr(a.invoiceDate, b.invoiceDate);
        break;
      case "invoiceNumber":
        c = cmpStr(a.invoiceNumber, b.invoiceNumber);
        break;
      case "vendor":
        c = cmpStr(a.vendor, b.vendor);
        break;
      case "status":
        c = cmpStr(a.status, b.status);
        break;
      case "tax":
        c = cmpNum(a.tax, b.tax);
        break;
      case "total":
        c = cmpNum(a.total, b.total);
        break;
      case "pages": {
        const pa = a.pageStart - b.pageStart;
        c = pa !== 0 ? pa : a.pageEnd - b.pageEnd;
        break;
      }
      case "fileName":
        c = cmpStr(a.fileName, b.fileName);
        break;
      default:
        c = 0;
    }
    if (c !== 0) return m * c;
    return cmpStr(a.financialDocumentId, b.financialDocumentId);
  });
}

function periodSortKey(s: CustomerStatementRow): string {
  return `${s.periodStart ?? ""}\t${s.periodEnd ?? ""}`;
}

function sortStatements(rows: CustomerStatementRow[], key: StatementSortKey, dir: SortDir): CustomerStatementRow[] {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let c = 0;
    switch (key) {
      case "accountHolder":
        c = cmpStr(a.accountHolder, b.accountHolder);
        break;
      case "bankName":
        c = cmpStr(a.bankName, b.bankName);
        break;
      case "period":
        c = cmpStr(periodSortKey(a), periodSortKey(b));
        break;
      case "closingBalance":
        c = cmpNum(a.closingBalance, b.closingBalance);
        break;
      case "fileName":
        c = cmpStr(a.fileName, b.fileName);
        break;
      case "pages": {
        const pa = a.pageStart - b.pageStart;
        c = pa !== 0 ? pa : a.pageEnd - b.pageEnd;
        break;
      }
      case "status":
        c = cmpStr(a.status, b.status);
        break;
      default:
        c = 0;
    }
    if (c !== 0) return m * c;
    return cmpStr(a.financialDocumentId, b.financialDocumentId);
  });
}

function SortableTh<K extends string>({
  label,
  colKey,
  active,
  onClick,
}: {
  label: string;
  colKey: K;
  active: { key: K; dir: SortDir } | null;
  onClick: (k: K) => void;
}) {
  const on = active?.key === colKey;
  return (
    <th scope="col" className="px-3 py-2.5 font-semibold">
      <button
        type="button"
        className="-mx-1 flex w-full min-w-0 items-center justify-between gap-2 rounded px-1 text-left hover:bg-surface-muted/80"
        onClick={() => onClick(colKey)}
      >
        <span>{label}</span>
        <span
          className={`w-3 shrink-0 text-center text-[10px] leading-none ${on ? "text-brand" : "text-transparent"}`}
          aria-hidden
        >
          {on && active ? (active.dir === "asc" ? "▲" : "▼") : "·"}
        </span>
      </button>
    </th>
  );
}

export default function CustomerDrivePage() {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseCustomerTab(searchParams.get("tab"));
  const { apiBase, authHeaders, isAdmin, authRequired, hasPermission, customerId: jwtCustomerId } =
    useAuth();
  const canDeleteFiles = canDeleteDriveFiles({ authRequired, isAdmin, hasPermission });
  const canCreateFolder = canCreateCustomerFolder({ authRequired, isAdmin, jwtCustomerId });
  const [customerName, setCustomerName] = useState("");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [invoices, setInvoices] = useState<CustomerInvoiceRow[]>([]);
  const [statements, setStatements] = useState<CustomerStatementRow[]>([]);
  const [loadingFinancial, setLoadingFinancial] = useState(false);
  const [financialErr, setFinancialErr] = useState("");
  const [invoiceSort, setInvoiceSort] = useState<{ key: InvoiceSortKey; dir: SortDir } | null>(null);
  const [statementSort, setStatementSort] = useState<{ key: StatementSortKey; dir: SortDir } | null>(null);
  const [invFilterDateFrom, setInvFilterDateFrom] = useState("");
  const [invFilterDateTo, setInvFilterDateTo] = useState("");
  const [invFilterInvoice, setInvFilterInvoice] = useState("");
  const [invFilterVendor, setInvFilterVendor] = useState("");
  const [invFilterFile, setInvFilterFile] = useState("");
  const [invFilterStatus, setInvFilterStatus] = useState("");
  const [stmtFilterPeriodFrom, setStmtFilterPeriodFrom] = useState("");
  const [stmtFilterPeriodTo, setStmtFilterPeriodTo] = useState("");
  const [stmtFilterAccount, setStmtFilterAccount] = useState("");
  const [stmtFilterBank, setStmtFilterBank] = useState("");
  const [stmtFilterFile, setStmtFilterFile] = useState("");
  const [stmtFilterStatus, setStmtFilterStatus] = useState("");
  const [financialPageSize, setFinancialPageSize] = useState(DEFAULT_FIN_PAGE_SIZE);
  const [invoicePage, setInvoicePage] = useState(1);
  const [statementPage, setStatementPage] = useState(1);
  const [view, setView] = useState<ViewMode>("list");
  const [driveSort, setDriveSort] = useState<DriveSortMode>("name");
  const [driveSearch, setDriveSearch] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  /** Finder-style: selected folder id at each depth (path from root). */
  const [columnPath, setColumnPath] = useState<string[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lastJob, setLastJob] = useState<JobRow | null>(null);
  const [openingFileId, setOpeningFileId] = useState<string | null>(null);
  const [folderUploadBusy, setFolderUploadBusy] = useState(false);
  const [folderUploadHint, setFolderUploadHint] = useState("");
  const [runFolderExtraction, setRunFolderExtraction] = useState(true);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);

  const deleteFile = async (f: DriveFile, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!canDeleteFiles) return;
    const label = f.fileType === "folder" ? "folder" : "file";
    if (
      !window.confirm(
        `Delete this ${label}? It will be hidden from the drive. Linked extraction jobs for this ${label} will be removed too.`,
      )
    ) {
      return;
    }
    setDeletingFileId(f.id);
    setErr("");
    try {
      await deleteDriveFile(apiBase, authHeaders(), f.id);
      await load();
    } catch (err) {
      setErr(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingFileId(null);
    }
  };

  const openFile = async (f: DriveFile) => {
    if (!customerId || f.fileType !== "file") return;
    setOpeningFileId(f.id);
    setErr("");
    try {
      const jobs = await fetchJobsByFileId(apiBase, authHeaders(), f.id);
      if (jobs.length > 0 && isAdmin) {
        navigate(`/jobs/${jobs[0].id}`);
      } else {
        navigate(`/customers/${customerId}/files/${f.id}`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not open file");
    } finally {
      setOpeningFileId(null);
    }
  };

  const load = useCallback(async () => {
    if (!customerId) return;
    setErr("");
    setLoading(true);
    try {
      const [c, list] = await Promise.all([
        fetchCustomer(apiBase, authHeaders(), customerId),
        fetchFilesForCustomer(apiBase, authHeaders(), customerId),
      ]);
      setCustomerName(c.name);
      setFiles(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders, customerId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!addMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [addMenuOpen]);

  const setTab = (next: CustomerTab) => {
    if (next === "files") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: next }, { replace: true });
    }
  };

  useEffect(() => {
    if (!customerId || tab === "files") return;
    let cancelled = false;
    setFinancialErr("");
    setLoadingFinancial(true);
    const run = async () => {
      try {
        if (tab === "invoices") {
          const list = await fetchCustomerInvoices(apiBase, authHeaders(), customerId);
          if (!cancelled) setInvoices(list);
        } else {
          const list = await fetchCustomerStatements(apiBase, authHeaders(), customerId);
          if (!cancelled) setStatements(list);
        }
      } catch (e) {
        if (!cancelled) setFinancialErr(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoadingFinancial(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, customerId, tab]);

  const pathMap = useMemo(() => buildPathStrings(files), [files]);

  const breadcrumbs = useMemo(() => {
    const parts: { id: string | null; name: string }[] = [{ id: null, name: "Root" }];
    if (!customerId) return parts;
    let cur = currentFolderId;
    const stack: { id: string | null; name: string }[] = [];
    const byId = new Map(files.map((f) => [f.id, f] as const));
    while (cur) {
      const f = byId.get(cur);
      if (!f) break;
      stack.unshift({ id: f.id, name: f.name });
      cur = f.parentId;
    }
    return [...parts, ...stack];
  }, [currentFolderId, files]);

  const driveQuery = driveSearch.trim().toLowerCase();

  const listItems = useMemo(() => {
    const base = childrenOf(files, currentFolderId, driveSort);
    if (!driveQuery) return base;
    return base.filter((f) => f.name.toLowerCase().includes(driveQuery));
  }, [files, currentFolderId, driveSort, driveQuery]);

  const flatRows = useMemo(() => {
    const rows = files.map((f) => ({
      f,
      path: pathMap.get(f.id) ?? f.name,
    }));
    let sorted: { f: DriveFile; path: string }[];
    if (driveSort === "name") {
      sorted = rows.sort((a, b) => a.path.localeCompare(b.path));
    } else {
      const dir = driveSort === "createdDesc" ? -1 : 1;
      sorted = rows.sort((a, b) => {
        const ca = createdMs(a.f);
        const cb = createdMs(b.f);
        if (ca !== cb) return (ca - cb) * dir;
        return a.path.localeCompare(b.path);
      });
    }
    if (!driveQuery) return sorted;
    return sorted.filter(
      ({ f, path }) =>
        f.name.toLowerCase().includes(driveQuery) || path.toLowerCase().includes(driveQuery)
    );
  }, [files, pathMap, driveSort, driveQuery]);

  const invoiceSortForHeader = invoiceSort ?? DEFAULT_INVOICE_SORT;
  const statementSortForHeader = statementSort ?? DEFAULT_STATEMENT_SORT;

  const filteredInvoices = useMemo(
    () =>
      invoices.filter((row) =>
        filterInvoiceRow(row, {
          dateFrom: invFilterDateFrom,
          dateTo: invFilterDateTo,
          invoice: invFilterInvoice,
          vendor: invFilterVendor,
          file: invFilterFile,
          status: invFilterStatus,
        })
      ),
    [
      invoices,
      invFilterDateFrom,
      invFilterDateTo,
      invFilterInvoice,
      invFilterVendor,
      invFilterFile,
      invFilterStatus,
    ]
  );

  const filteredStatements = useMemo(
    () =>
      statements.filter((row) =>
        filterStatementRow(row, {
          periodFrom: stmtFilterPeriodFrom,
          periodTo: stmtFilterPeriodTo,
          account: stmtFilterAccount,
          bank: stmtFilterBank,
          file: stmtFilterFile,
          status: stmtFilterStatus,
        })
      ),
    [
      statements,
      stmtFilterPeriodFrom,
      stmtFilterPeriodTo,
      stmtFilterAccount,
      stmtFilterBank,
      stmtFilterFile,
      stmtFilterStatus,
    ]
  );

  const invoiceStatusOptions = useMemo(() => {
    const next = new Set<string>();
    for (const r of invoices) next.add(r.status);
    return [...next].sort((a, b) => cmpStr(a, b));
  }, [invoices]);

  const statementStatusOptions = useMemo(() => {
    const next = new Set<string>();
    for (const r of statements) next.add(r.status);
    return [...next].sort((a, b) => cmpStr(a, b));
  }, [statements]);

  const sortedInvoicesFlat = useMemo(() => {
    const sort = invoiceSort ?? DEFAULT_INVOICE_SORT;
    return sortInvoices(filteredInvoices, sort.key, sort.dir);
  }, [filteredInvoices, invoiceSort]);

  const sortedStatementsFlat = useMemo(() => {
    const sort = statementSort ?? DEFAULT_STATEMENT_SORT;
    return sortStatements(filteredStatements, sort.key, sort.dir);
  }, [filteredStatements, statementSort]);

  const invoiceTotalPages = Math.max(1, Math.ceil(sortedInvoicesFlat.length / financialPageSize));
  const statementTotalPages = Math.max(1, Math.ceil(sortedStatementsFlat.length / financialPageSize));

  const pagedInvoices = useMemo(() => {
    const start = (invoicePage - 1) * financialPageSize;
    return sortedInvoicesFlat.slice(start, start + financialPageSize);
  }, [sortedInvoicesFlat, invoicePage, financialPageSize]);

  const pagedStatements = useMemo(() => {
    const start = (statementPage - 1) * financialPageSize;
    return sortedStatementsFlat.slice(start, start + financialPageSize);
  }, [sortedStatementsFlat, statementPage, financialPageSize]);

  useEffect(() => {
    setInvoicePage(1);
  }, [
    customerId,
    invFilterDateFrom,
    invFilterDateTo,
    invFilterInvoice,
    invFilterVendor,
    invFilterFile,
    invFilterStatus,
  ]);

  useEffect(() => {
    setStatementPage(1);
  }, [
    customerId,
    stmtFilterPeriodFrom,
    stmtFilterPeriodTo,
    stmtFilterAccount,
    stmtFilterBank,
    stmtFilterFile,
    stmtFilterStatus,
  ]);

  useEffect(() => {
    setInvoicePage((p) => Math.min(Math.max(1, p), invoiceTotalPages));
  }, [invoiceTotalPages]);

  useEffect(() => {
    setStatementPage((p) => Math.min(Math.max(1, p), statementTotalPages));
  }, [statementTotalPages]);

  const clearInvoiceFilters = () => {
    setInvFilterDateFrom("");
    setInvFilterDateTo("");
    setInvFilterInvoice("");
    setInvFilterVendor("");
    setInvFilterFile("");
    setInvFilterStatus("");
  };

  const clearStatementFilters = () => {
    setStmtFilterPeriodFrom("");
    setStmtFilterPeriodTo("");
    setStmtFilterAccount("");
    setStmtFilterBank("");
    setStmtFilterFile("");
    setStmtFilterStatus("");
  };

  const exportFileSlug = useMemo(
    () =>
      (customerName || "customer")
        .trim()
        .replace(/[/\\?%*:|"<>]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 80) || "customer",
    [customerName]
  );

  const exportInvoicesCsv = () => {
    if (sortedInvoicesFlat.length === 0) return;
    const headers = [
      "File",
      "Pages",
      "Date",
      "Invoice #",
      "Vendor",
      "Status",
      "Amount",
      "Discount",
      "Before tax",
      "Tax",
      "After tax",
      "Currency",
    ];
    const rows = sortedInvoicesFlat.map((row) => [
      row.fileName || row.fileId,
      `${row.pageStart}-${row.pageEnd}`,
      formatDateDisplay(row.invoiceDate),
      row.invoiceNumber ?? "",
      row.vendor ?? "",
      row.status,
      row.amount ?? "",
      row.discount ?? "",
      row.subtotal ?? "",
      row.tax ?? "",
      row.total ?? "",
      row.currency ?? "",
    ]);
    downloadCsvFile(
      `invoices_${exportFileSlug}_${new Date().toISOString().slice(0, 10)}.csv`,
      buildCsv(headers, rows)
    );
  };

  const exportStatementsCsv = () => {
    if (sortedStatementsFlat.length === 0) return;
    const headers = [
      "File",
      "Pages",
      "Account",
      "Bank",
      "Period start",
      "Period end",
      "Closing",
      "Currency",
      "Status",
    ];
    const rows = sortedStatementsFlat.map((row) => [
      row.fileName || row.fileId,
      `${row.pageStart}-${row.pageEnd}`,
      row.accountHolder ?? "",
      row.bankName ?? "",
      row.periodStart ?? "",
      row.periodEnd ?? "",
      row.closingBalance ?? "",
      row.currency ?? "",
      row.status,
    ]);
    downloadCsvFile(
      `statements_${exportFileSlug}_${new Date().toISOString().slice(0, 10)}.csv`,
      buildCsv(headers, rows)
    );
  };

  const finFilterField =
    "min-w-[6.5rem] max-w-[11rem] rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-sm text-ink placeholder:text-muted-soft";

  const cycleInvoiceSort = (key: InvoiceSortKey) => {
    setInvoiceSort((prev) => {
      const effective = prev ?? DEFAULT_INVOICE_SORT;
      if (effective.key === key) {
        return { key, dir: effective.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: defaultInvoiceSortDir(key) };
    });
  };

  const cycleStatementSort = (key: StatementSortKey) => {
    setStatementSort((prev) => {
      const effective = prev ?? DEFAULT_STATEMENT_SORT;
      if (effective.key === key) {
        return { key, dir: effective.dir === "asc" ? "desc" : "asc" };
      }
      return { key, dir: defaultStatementSortDir(key) };
    });
  };

  const openFolder = (id: string) => {
    setCurrentFolderId(id);
  };

  const goBreadcrumb = (id: string | null) => {
    setCurrentFolderId(id);
  };

  const createFolderFromDialog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !newFolderName.trim()) return;
    setCreatingFolder(true);
    setErr("");
    try {
      await createFolder(apiBase, authHeaders(), {
        customerId,
        parentId: currentFolderId,
        name: newFolderName.trim(),
      });
      setNewFolderName("");
      setFolderDialogOpen(false);
      await load();
    } catch (errCreate) {
      setErr(errCreate instanceof Error ? errCreate.message : "Could not create folder");
    } finally {
      setCreatingFolder(false);
    }
  };

  const pickFolderUpload = async (picked: File[]) => {
    if (!customerId || picked.length === 0) return;
    setErr("");
    setFolderUploadBusy(true);
    setFolderUploadHint("");
    try {
      const r = await uploadFolderTree({
        apiBase,
        headers: authHeaders(),
        customerId,
        rootParentId: currentFolderId,
        pickedFiles: picked,
        runExtraction: runFolderExtraction,
        onProgress: (p) => setFolderUploadHint(`${p.current} / ${p.total} — ${p.fileName}`),
      });
      await load();
      const ok: string[] = [];
      if (r.uploaded.length) ok.push(`${r.uploaded.length} file(s) uploaded`);
      if (r.skipped) ok.push(`${r.skipped} skipped (not PDF/image)`);
      if (r.errors.length) {
        setErr(
          (ok.length ? `${ok.join(". ")}. ` : "") +
            `Some failed (${r.errors.length}): ${r.errors.slice(0, 4).join(" · ")}`,
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Folder upload failed");
    } finally {
      setFolderUploadBusy(false);
      setFolderUploadHint("");
    }
  };

  const folderLocationLabel = useMemo(() => breadcrumbs.map((b) => b.name).join(" / "), [breadcrumbs]);

  const viewToggle = (
    <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-raised p-1 text-xs">
      {(
        [
          ["list", "List"],
          ["grid", "Grid"],
          ["columns", "Columns"],
          ["flat", "Flat"],
        ] as const
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => setView(k)}
          className={`rounded-md px-2 py-1 font-semibold ${
            view === k ? "bg-brand/15 text-brand" : "text-muted hover:bg-surface-muted"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  const sortSelect = (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="font-medium">Sort</span>
      <select
        value={driveSort}
        onChange={(e) => setDriveSort(e.target.value as DriveSortMode)}
        className="rounded-lg border border-border bg-surface-raised px-2 py-1.5 font-medium text-ink"
      >
        <option value="name">Name (folders first)</option>
        <option value="createdDesc">Newest first</option>
        <option value="createdAsc">Oldest first</option>
      </select>
    </label>
  );

  const renderDeleteButton = (f: DriveFile) =>
    canDeleteFiles ? (
      <button
        type="button"
        title="Delete"
        disabled={deletingFileId === f.id}
        className="shrink-0 rounded px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
        onClick={(e) => void deleteFile(f, e)}
      >
        {deletingFileId === f.id ? "…" : "Delete"}
      </button>
    ) : null;

  const renderItemRow = (f: DriveFile) => (
    <div
      key={f.id}
      className={`flex items-center gap-2 border-b border-border-subtle px-3 py-2 hover:bg-surface-muted ${
        f.fileType === "folder" || f.fileType === "file" ? "cursor-pointer" : ""
      } ${openingFileId === f.id ? "opacity-70" : ""}`}
      onClick={() => {
        if (f.fileType === "folder") openFolder(f.id);
        else if (f.fileType === "file") void openFile(f);
      }}
      onKeyDown={(e) => {
        if (f.fileType === "folder" && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          openFolder(f.id);
        }
        if (f.fileType === "file" && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          void openFile(f);
        }
      }}
      role={f.fileType === "folder" || f.fileType === "file" ? "button" : undefined}
      tabIndex={f.fileType === "folder" || f.fileType === "file" ? 0 : undefined}
    >
      <span className="text-lg leading-none">{f.fileType === "folder" ? "📁" : "📄"}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
      <span className="shrink-0 whitespace-nowrap text-xs text-muted">{formatDateTime(f.createdAt)}</span>
      {f.fileType === "file" ? (
        <span className="shrink-0 text-xs text-muted">{f.mimeType ?? ""}</span>
      ) : null}
      {renderDeleteButton(f)}
    </div>
  );

  const columnCount = columnPath.length + 1;

  if (authRequired && jwtCustomerId && !isAdmin) {
    if (!customerId || customerId !== jwtCustomerId) {
      return <Navigate to="/portal" replace />;
    }
    return <Navigate to="/portal/files" replace />;
  }

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to={`/customers/${customerId ?? ""}/details`} className="text-sm text-brand hover:underline">
          ← Customer overview
        </Link>
        <Link to="/customers" className="text-sm text-muted hover:text-brand hover:underline">
          All customers
        </Link>
        <h1 className="text-xl font-semibold text-ink">{customerName || "Customer"}</h1>
      </div>
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-surface-raised p-1 text-sm">
        {(
          [
            ["files", "Files"],
            ["invoices", "Invoices"],
            ["statements", "Statements"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 font-semibold ${
              tab === k ? "bg-brand/15 text-brand" : "text-muted hover:bg-surface-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {lastJob ? (
        <p className="alert-success px-3 py-2">
          Extraction job queued.
          {isAdmin ? (
            <>
              {" "}
              <Link className="font-semibold underline" to={`/jobs/${lastJob.id}`}>
                Open job
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      {financialErr ? <p className="text-sm text-red-400">{financialErr}</p> : null}
      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : tab === "files" ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex flex-wrap items-center gap-2 shrink-0" ref={addMenuRef}>
              <button
                type="button"
                aria-expanded={addMenuOpen}
                aria-haspopup="menu"
                onClick={() => setAddMenuOpen((o) => !o)}
                className="btn btn-primary btn-sm gap-1.5"
              >
                <span aria-hidden>+</span>
                Add
                <span className="text-[10px] opacity-90" aria-hidden>
                  ▾
                </span>
              </button>
              <FolderUploadButton
                label="Upload folder"
                busy={folderUploadBusy}
                disabled={!customerId}
                className="btn btn-accent btn-sm"
                onPick={pickFolderUpload}
              />
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={runFolderExtraction}
                  onChange={(e) => setRunFolderExtraction(e.target.checked)}
                  className="rounded border-border text-brand focus:ring-brand"
                />
                Extract
              </label>
              {addMenuOpen ? (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-40 mt-1 min-w-[11rem] rounded-lg border border-border bg-surface-raised py-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-muted"
                    onClick={() => {
                      setAddMenuOpen(false);
                      setUploadOpen(true);
                    }}
                  >
                    File
                  </button>
                  {canCreateFolder ? (
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-muted"
                      onClick={() => {
                        setAddMenuOpen(false);
                        setErr("");
                        setNewFolderName("");
                        setFolderDialogOpen(true);
                      }}
                    >
                      New folder
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="min-w-0 flex-1 basis-[min(100%,14rem)]">
              <label className="sr-only" htmlFor="drive-search">
                Search files and folders
              </label>
              <input
                id="drive-search"
                type="search"
                placeholder="Search…"
                value={driveSearch}
                onChange={(e) => setDriveSearch(e.target.value)}
                className="w-full max-w-md rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
              />
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              {viewToggle}
              {sortSelect}
            </div>
          </div>
          {folderUploadHint ? <p className="mt-1 text-xs text-muted">{folderUploadHint}</p> : null}

          {view !== "columns" && view !== "flat" ? (
            <nav className="flex flex-wrap items-center gap-1 text-sm text-muted">
              {breadcrumbs.map((b, i) => (
                <span key={b.id ?? "root"} className="flex items-center gap-1">
                  {i > 0 ? <span className="text-border">/</span> : null}
                  <button
                    type="button"
                    className={`rounded px-1 hover:text-brand ${i === breadcrumbs.length - 1 ? "font-semibold text-ink" : ""}`}
                    onClick={() => goBreadcrumb(b.id)}
                  >
                    {b.name}
                  </button>
                </span>
              ))}
            </nav>
          ) : null}

          {view === "list" ? (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised shadow-sm">
              {listItems.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">This folder is empty.</p>
              ) : (
                listItems.map(renderItemRow)
              )}
            </div>
          ) : null}

          {view === "grid" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {listItems.map((f) => (
                <div
                  key={f.id}
                  className={`relative flex flex-col items-center gap-2 rounded-xl border border-border bg-surface-raised p-4 text-center shadow-sm transition hover:border-brand/40 ${
                    openingFileId === f.id ? "opacity-70" : ""
                  }`}
                >
                  {canDeleteFiles ? (
                    <div className="absolute right-2 top-2 z-10">{renderDeleteButton(f)}</div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      if (f.fileType === "folder") openFolder(f.id);
                      else if (f.fileType === "file") void openFile(f);
                    }}
                    className={`flex w-full flex-col items-center gap-2 ${
                      f.fileType === "file" ? "cursor-pointer opacity-95" : "cursor-pointer"
                    }`}
                  >
                    <span className="text-3xl">{f.fileType === "folder" ? "📁" : "📄"}</span>
                    <span className="line-clamp-2 w-full text-sm font-medium">{f.name}</span>
                    <span className="text-[11px] text-muted">{formatDateTime(f.createdAt)}</span>
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {view === "columns" ? (
            <div className="flex max-w-full gap-0 overflow-x-auto rounded-xl border border-border bg-surface-raised shadow-sm">
              {Array.from({ length: columnCount }).map((_, colIdx) => {
                const parentId = colIdx === 0 ? null : columnPath[colIdx - 1];
                const colItems = childrenOf(files, parentId, driveSort).filter(
                  (f) => !driveQuery || f.name.toLowerCase().includes(driveQuery)
                );
                const selectedHere = columnPath[colIdx] ?? null;
                return (
                  <div
                    key={colIdx}
                    className="min-w-[200px] max-w-[280px] flex-1 border-r border-border last:border-r-0"
                  >
                    <div className="border-b border-border-subtle bg-surface-muted px-2 py-1.5 text-xs font-semibold text-muted">
                      {colIdx === 0 ? "Root" : "Folder"}
                    </div>
                    <ul className="max-h-[420px] overflow-y-auto py-1">
                      {colItems.map((f) => (
                        <li key={f.id} className="flex items-center gap-1 pr-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (f.fileType === "folder") {
                                setColumnPath((prev) => [...prev.slice(0, colIdx), f.id]);
                              } else if (f.fileType === "file") {
                                void openFile(f);
                              }
                            }}
                            className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm ${
                              selectedHere === f.id ? "bg-brand/10 font-semibold text-brand" : "hover:bg-surface-muted"
                            } ${f.fileType === "folder" ? "" : "opacity-80"}`}
                          >
                            <span className="shrink-0">{f.fileType === "folder" ? "📁" : "📄"}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">{f.name}</span>
                              <span className="block truncate text-[10px] font-normal text-muted">
                                {formatDateTime(f.createdAt)}
                              </span>
                            </span>
                          </button>
                          {renderDeleteButton(f)}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : null}

          {view === "flat" ? (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised shadow-sm">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border bg-surface-muted">
                  <tr>
                    <th className="px-3 py-2.5">Path</th>
                    <th className="whitespace-nowrap px-3 py-2.5">Created</th>
                    <th className="px-3 py-2.5">Type</th>
                    {canDeleteFiles ? <th className="px-3 py-2.5 w-20" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {flatRows.map(({ f, path }) => (
                    <tr
                      key={f.id}
                      className={`border-b border-border-subtle hover:bg-surface-muted/80 ${
                        f.fileType === "file" ? "cursor-pointer" : ""
                      }`}
                      onClick={() => {
                        if (f.fileType === "file") void openFile(f);
                      }}
                    >
                      <td className="px-3 py-2 font-mono text-xs">{path}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{formatDateTime(f.createdAt)}</td>
                      <td className="px-3 py-2">{f.fileType}</td>
                      {canDeleteFiles ? (
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          {renderDeleteButton(f)}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : tab === "invoices" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised shadow-sm">
          {loadingFinancial ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Loading invoices…</p>
          ) : invoices.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No invoices in the database for this customer yet.</p>
          ) : (
            <>
              <div className="border-b border-border bg-surface-muted/90 px-3 py-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-0.5 text-xs font-medium text-muted">
                    <span>Date from</span>
                    <input
                      type="date"
                      value={invFilterDateFrom}
                      onChange={(e) => setInvFilterDateFrom(e.target.value)}
                      className={finFilterField}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-xs font-medium text-muted">
                    <span>Date to</span>
                    <input
                      type="date"
                      value={invFilterDateTo}
                      onChange={(e) => setInvFilterDateTo(e.target.value)}
                      className={finFilterField}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-xs font-medium text-muted">
                    <span>Invoice #</span>
                    <input
                      type="search"
                      value={invFilterInvoice}
                      onChange={(e) => setInvFilterInvoice(e.target.value)}
                      placeholder="Contains…"
                      className={finFilterField}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-xs font-medium text-muted">
                    <span>Vendor</span>
                    <input
                      type="search"
                      value={invFilterVendor}
                      onChange={(e) => setInvFilterVendor(e.target.value)}
                      placeholder="Contains…"
                      className={finFilterField}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-xs font-medium text-muted">
                    <span>File</span>
                    <input
                      type="search"
                      value={invFilterFile}
                      onChange={(e) => setInvFilterFile(e.target.value)}
                      placeholder="Name or id…"
                      className={finFilterField}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-xs font-medium text-muted">
                    <span>Status</span>
                    <select
                      value={invFilterStatus}
                      onChange={(e) => setInvFilterStatus(e.target.value)}
                      className={finFilterField}
                    >
                      <option value="">All</option>
                      {invoiceStatusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={clearInvoiceFilters}
                    className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface-muted"
                  >
                    Clear filters
                  </button>
                  <button
                    type="button"
                    onClick={exportInvoicesCsv}
                    disabled={sortedInvoicesFlat.length === 0}
                    className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface-muted disabled:opacity-40"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
              {filteredInvoices.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">No invoices match the current filters.</p>
              ) : (
            <>
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="border-b border-border bg-surface-muted">
                <tr>
                  <SortableTh label="File" colKey="fileName" active={invoiceSortForHeader} onClick={cycleInvoiceSort} />
                  <SortableTh label="Pages" colKey="pages" active={invoiceSortForHeader} onClick={cycleInvoiceSort} />
                  <SortableTh label="Date" colKey="invoiceDate" active={invoiceSortForHeader} onClick={cycleInvoiceSort} />
                  <SortableTh label="Invoice #" colKey="invoiceNumber" active={invoiceSortForHeader} onClick={cycleInvoiceSort} />
                  <SortableTh label="Vendor" colKey="vendor" active={invoiceSortForHeader} onClick={cycleInvoiceSort} />
                  <SortableTh label="Status" colKey="status" active={invoiceSortForHeader} onClick={cycleInvoiceSort} />
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    Amount
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    Discount
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">
                    Before tax
                  </th>
                  <SortableTh label="Tax" colKey="tax" active={invoiceSortForHeader} onClick={cycleInvoiceSort} />
                  <SortableTh label="After tax" colKey="total" active={invoiceSortForHeader} onClick={cycleInvoiceSort} />
                </tr>
              </thead>
              <tbody>
                {pagedInvoices.map((row) => (
                  <tr
                    key={row.financialDocumentId}
                    className="cursor-pointer border-b border-border-subtle hover:bg-surface-muted/90"
                    onClick={() =>
                      navigate(`/customers/${customerId}/invoices/${row.financialDocumentId}`)
                    }
                  >
                    <td className="max-w-[200px] truncate px-3 py-2">
                      {customerId && row.fileId ? (
                        <Link
                          className="text-brand hover:underline"
                          to={`/customers/${customerId}/files/${row.fileId}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.fileName || row.fileId}
                        </Link>
                      ) : (
                        <span className="text-ink">{row.fileName || row.documentId || "—"}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {row.pageStart}–{row.pageEnd}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDateDisplay(row.invoiceDate)}</td>
                    <td className="px-3 py-2">{row.invoiceNumber ?? "—"}</td>
                    <td className="px-3 py-2">{row.vendor ?? "—"}</td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMoney(row.amount, row.currency)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMoney(row.discount, row.currency)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMoney(row.subtotal, row.currency)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMoney(row.tax, row.currency)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMoney(row.total, row.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination
              page={invoicePage}
              pageCount={invoiceTotalPages}
              total={sortedInvoicesFlat.length}
              pageSize={financialPageSize}
              onPageChange={setInvoicePage}
              pageSizeOptions={[25, 50, 100]}
              onPageSizeChange={(size) => {
                setFinancialPageSize(size);
                setInvoicePage(1);
                setStatementPage(1);
              }}
            />
            </>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised shadow-sm">
          {loadingFinancial ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Loading statements…</p>
          ) : statements.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No statements in the database for this customer yet.</p>
          ) : (
            <>
              <div className="border-b border-border bg-surface-muted/90 px-3 py-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-0.5 text-xs font-medium text-muted">
                    <span>Period from</span>
                    <input
                      type="date"
                      value={stmtFilterPeriodFrom}
                      onChange={(e) => setStmtFilterPeriodFrom(e.target.value)}
                      className={finFilterField}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-xs font-medium text-muted">
                    <span>Period to</span>
                    <input
                      type="date"
                      value={stmtFilterPeriodTo}
                      onChange={(e) => setStmtFilterPeriodTo(e.target.value)}
                      className={finFilterField}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-xs font-medium text-muted">
                    <span>Account</span>
                    <input
                      type="search"
                      value={stmtFilterAccount}
                      onChange={(e) => setStmtFilterAccount(e.target.value)}
                      placeholder="Contains…"
                      className={finFilterField}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-xs font-medium text-muted">
                    <span>Bank</span>
                    <input
                      type="search"
                      value={stmtFilterBank}
                      onChange={(e) => setStmtFilterBank(e.target.value)}
                      placeholder="Contains…"
                      className={finFilterField}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-xs font-medium text-muted">
                    <span>File</span>
                    <input
                      type="search"
                      value={stmtFilterFile}
                      onChange={(e) => setStmtFilterFile(e.target.value)}
                      placeholder="Name or id…"
                      className={finFilterField}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-xs font-medium text-muted">
                    <span>Status</span>
                    <select
                      value={stmtFilterStatus}
                      onChange={(e) => setStmtFilterStatus(e.target.value)}
                      className={finFilterField}
                    >
                      <option value="">All</option>
                      {statementStatusOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={clearStatementFilters}
                    className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface-muted"
                  >
                    Clear filters
                  </button>
                  <button
                    type="button"
                    onClick={exportStatementsCsv}
                    disabled={sortedStatementsFlat.length === 0}
                    className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-surface-muted disabled:opacity-40"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
              {filteredStatements.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">No statements match the current filters.</p>
              ) : (
            <>
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b border-border bg-surface-muted">
                <tr>
                  <SortableTh label="File" colKey="fileName" active={statementSortForHeader} onClick={cycleStatementSort} />
                  <SortableTh label="Pages" colKey="pages" active={statementSortForHeader} onClick={cycleStatementSort} />
                  <SortableTh label="Account" colKey="accountHolder" active={statementSortForHeader} onClick={cycleStatementSort} />
                  <SortableTh label="Bank" colKey="bankName" active={statementSortForHeader} onClick={cycleStatementSort} />
                  <SortableTh label="Period" colKey="period" active={statementSortForHeader} onClick={cycleStatementSort} />
                  <SortableTh label="Closing" colKey="closingBalance" active={statementSortForHeader} onClick={cycleStatementSort} />
                  <SortableTh label="Status" colKey="status" active={statementSortForHeader} onClick={cycleStatementSort} />
                </tr>
              </thead>
              <tbody>
                {pagedStatements.map((row) => (
                  <tr
                    key={row.financialDocumentId}
                    className="cursor-pointer border-b border-border-subtle hover:bg-surface-muted/90"
                    onClick={() =>
                      navigate(`/customers/${customerId}/statements/${row.financialDocumentId}`)
                    }
                  >
                    <td className="max-w-[200px] truncate px-3 py-2">
                      {customerId && row.fileId ? (
                        <Link
                          className="text-brand hover:underline"
                          to={`/customers/${customerId}/files/${row.fileId}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.fileName || row.fileId}
                        </Link>
                      ) : (
                        <span className="text-ink">{row.fileName || row.documentId || "—"}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {row.pageStart}–{row.pageEnd}
                    </td>
                    <td className="px-3 py-2">{row.accountHolder ?? "—"}</td>
                    <td className="px-3 py-2">{row.bankName ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {row.periodStart ?? "—"} — {row.periodEnd ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatMoney(row.closingBalance, row.currency)}</td>
                    <td className="px-3 py-2">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination
              page={statementPage}
              pageCount={statementTotalPages}
              total={sortedStatementsFlat.length}
              pageSize={financialPageSize}
              onPageChange={setStatementPage}
              pageSizeOptions={[25, 50, 100]}
              onPageSizeChange={(size) => {
                setFinancialPageSize(size);
                setInvoicePage(1);
                setStatementPage(1);
              }}
            />
            </>
              )}
            </>
          )}
        </div>
      )}

      {customerId && folderDialogOpen && canCreateFolder ? (
        <ModalDialog
          open
          onClose={() => {
            setFolderDialogOpen(false);
            setNewFolderName("");
          }}
          disabled={creatingFolder}
          titleId="folder-dialog-title"
          className="max-w-md"
        >
            <h2 id="folder-dialog-title" className="text-lg font-semibold text-ink">
              New folder
            </h2>
            <p className="mt-1 text-sm text-muted">
              Location: <span className="font-medium text-ink">{folderLocationLabel}</span>
            </p>
            <form onSubmit={createFolderFromDialog} className="mt-4 flex flex-col gap-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-ink-soft">Folder name</span>
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Q1 statements"
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-ink"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFolderDialogOpen(false);
                    setNewFolderName("");
                  }}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink-soft hover:bg-surface-muted"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingFolder || !newFolderName.trim()}
                  className="btn btn-primary btn-md"
                >
                  {creatingFolder ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
        </ModalDialog>
      ) : null}

      {customerId ? (
        <UploadDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          apiBase={apiBase}
          headers={authHeaders()}
          customerId={customerId}
          parentId={currentFolderId}
          showUploadCategory={tab === "files"}
          onUploaded={({ job }) => {
            setLastJob(job);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
