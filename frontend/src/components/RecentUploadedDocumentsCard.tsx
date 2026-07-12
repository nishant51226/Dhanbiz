import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchCustomers,
  fetchDocumentsList,
  fetchLibraryCustomerFilterOptions,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { shouldShowStaffAssigneeFilter } from "../utils/canDeleteDriveFiles";
import { SearchableCustomerSelect } from "./SearchableCustomerSelect";
import type { AdminLibraryDocumentRow, Customer } from "../types/api";
import { formatLibraryDocumentUploadDateTime } from "../utils/libraryDocumentDate";

const DEFAULT_PAGE_SIZE = 20;

function libraryKindLabel(kind: string | undefined): string {
  if (kind === "invoices") return "Invoice";
  if (kind === "statements") return "Statement";
  if (kind === "files") return "File";
  return kind?.trim() || "Document";
}

function InfiniteScrollSentinel({
  onVisible,
  disabled = false,
}: Readonly<{
  onVisible: () => void;
  disabled?: boolean;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onVisible();
      },
      { rootMargin: "120px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible, disabled]);
  return <div ref={ref} className="h-1 shrink-0" aria-hidden />;
}

type Props = {
  apiBase: string;
  authHeaders: () => HeadersInit;
  /** Locks the list to one customer (portal / customer workspace). */
  customerId?: string;
  pageSize?: number;
  refreshToken?: number;
  /** Show customer name on each row (admin dashboard). */
  showCustomer?: boolean;
  onOpenDocument?: (documentId: string) => void;
  viewAllHref?: string;
  title?: string;
};

function RecentDocumentsListFooter({
  hasMore,
  loadingMore,
  loading,
  rowsLength,
  onLoadMore,
}: Readonly<{
  hasMore: boolean;
  loadingMore: boolean;
  loading: boolean;
  rowsLength: number;
  onLoadMore: () => void;
}>) {
  if (hasMore) {
    return (
      <>
        <InfiniteScrollSentinel onVisible={onLoadMore} disabled={loadingMore || loading} />
        {loadingMore ? <p className="mt-3 text-center text-xs text-muted">Loading more…</p> : null}
      </>
    );
  }
  if (rowsLength > 0) {
    return <p className="mt-3 text-center text-xs text-muted">All files loaded.</p>;
  }
  return null;
}

function RecentDocumentsBody({
  loading,
  rows,
  err,
  filtersActive,
  showCustomer,
  onOpenDocument,
  hasMore,
  loadingMore,
  onLoadMore,
}: Readonly<{
  loading: boolean;
  rows: AdminLibraryDocumentRow[];
  err: string;
  filtersActive: boolean;
  showCustomer: boolean;
  onOpenDocument?: (documentId: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}>) {
  if (loading) {
    return <p className="mt-4 text-sm text-muted">Loading files…</p>;
  }
  if (rows.length === 0 && !err) {
    const emptyMessage = filtersActive ? "No files match your filters." : "No files uploaded yet.";
    return <p className="mt-4 text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <>
      <ul className="mt-4 divide-y divide-border">
        {rows.map((doc) => {
          const uploaded = doc.uploadedAt ?? doc.createdAt;
          const folderType = doc.folder?.type;
          const label = doc.name?.trim() || "Document";
          const metaParts = [
            libraryKindLabel(folderType),
            showCustomer ? (doc.customer?.name ?? doc.customerId ?? "Customer") : null,
            doc.folder?.name?.trim() || null,
          ].filter(Boolean);

          const open = () => onOpenDocument?.(doc.id);

          return (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
              <div className="min-w-0">
                {onOpenDocument ? (
                  <button type="button" onClick={open} className="text-left font-medium text-brand hover:underline">
                    {label}
                  </button>
                ) : (
                  <p className="font-medium text-ink">{label}</p>
                )}
                {metaParts.length > 0 ? (
                  <p className="truncate text-xs text-muted">{metaParts.join(" · ")}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs text-muted">
                {uploaded ? formatLibraryDocumentUploadDateTime(uploaded) : "—"}
              </span>
            </li>
          );
        })}
      </ul>
      <RecentDocumentsListFooter
        hasMore={hasMore}
        loadingMore={loadingMore}
        loading={loading}
        rowsLength={rows.length}
        onLoadMore={onLoadMore}
      />
    </>
  );
}

export function RecentUploadedDocumentsCard({
  apiBase,
  authHeaders,
  customerId: lockedCustomerId,
  pageSize = DEFAULT_PAGE_SIZE,
  refreshToken = 0,
  showCustomer = false,
  onOpenDocument,
  viewAllHref,
  title = "Uploaded files",
}: Readonly<Props>) {
  const { hasPermission, isAdmin, customerId: jwtCustomerId } = useAuth();
  const isPortalSession = Boolean(jwtCustomerId && !isAdmin);
  const showAssignedFilter = shouldShowStaffAssigneeFilter({
    isPortal: isPortalSession,
    isAdmin,
    hasPermission,
  });
  const showCustomerFilter = showCustomer && !lockedCustomerId;
  const useLibraryCustomerFilter =
    showCustomerFilter && !hasPermission("customer:read") && hasPermission("file:read");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchText, setSearchText] = useState("");
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const [rows, setRows] = useState<AdminLibraryDocumentRow[]>([]);
  const [nextPage, setNextPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState("");
  const fetchLockRef = useRef(false);

  const effectiveCustomerId = lockedCustomerId || filterCustomerId;
  const effectiveAssignedOnly = showAssignedFilter && assignedToMeOnly;

  const listQueryBase = useMemo(
    () => ({
      limit: pageSize,
      sort: "uploadedAt,DESC" as const,
      customerId: effectiveCustomerId || undefined,
      searchText: searchText || undefined,
      assignedOnly: effectiveAssignedOnly ? true : undefined,
    }),
    [effectiveCustomerId, effectiveAssignedOnly, pageSize, searchText],
  );

  useEffect(() => {
    if (!showCustomerFilter) {
      setCustomers([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = useLibraryCustomerFilter
          ? (await fetchLibraryCustomerFilterOptions(apiBase, authHeaders())).map(
              (row): Customer => ({
                id: row.id,
                name: row.name,
                accountStatus: "active",
              }),
            )
          : await fetchCustomers(apiBase, authHeaders(), { activeOnly: true });
        if (!cancelled) setCustomers(list);
      } catch {
        if (!cancelled) setCustomers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, showCustomerFilter, useLibraryCustomerFilter]);

  useEffect(() => {
    const t = globalThis.setTimeout(() => setSearchText(searchDraft.trim()), 350);
    return () => globalThis.clearTimeout(t);
  }, [searchDraft]);

  const fetchPage = useCallback(
    async (page: number) =>
      fetchDocumentsList(apiBase, authHeaders(), {
        page,
        ...listQueryBase,
      }),
    [apiBase, authHeaders, listQueryBase],
  );

  const resetAndLoad = useCallback(async () => {
    setErr("");
    setLoading(true);
    setLoadingMore(false);
    setRows([]);
    setNextPage(1);
    setPageCount(1);
    setTotal(0);
    fetchLockRef.current = false;
    try {
      const res = await fetchPage(1);
      setRows(res.data);
      setNextPage(2);
      setPageCount(Math.max(1, res.pageCount));
      setTotal(res.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load files");
      setRows([]);
      setNextPage(1);
      setPageCount(1);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setErr("");
      setLoading(true);
      setLoadingMore(false);
      setRows([]);
      setNextPage(1);
      setPageCount(1);
      setTotal(0);
      fetchLockRef.current = false;
      try {
        const res = await fetchPage(1);
        if (cancelled) return;
        setRows(res.data);
        setNextPage(2);
        setPageCount(Math.max(1, res.pageCount));
        setTotal(res.total);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Failed to load files");
        setRows([]);
        setNextPage(1);
        setPageCount(1);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage, refreshToken]);

  const hasMore = nextPage <= pageCount;
  const filtersActive = Boolean(searchText || filterCustomerId || effectiveAssignedOnly);

  const loadMore = useCallback(() => {
    if (fetchLockRef.current || loading || loadingMore || !hasMore) return;
    fetchLockRef.current = true;
    setLoadingMore(true);
    void (async () => {
      try {
        const res = await fetchPage(nextPage);
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          const add = res.data.filter((r) => !seen.has(r.id));
          return add.length > 0 ? [...prev, ...add] : prev;
        });
        setNextPage((p) => p + 1);
        setPageCount(Math.max(1, res.pageCount));
        setTotal(res.total);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load more files");
      } finally {
        setLoadingMore(false);
        fetchLockRef.current = false;
      }
    })();
  }, [fetchPage, hasMore, loading, loadingMore, nextPage]);

  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-xs text-muted">
            Newest uploads first
            {total > 0 ? ` · ${rows.length.toLocaleString()} of ${total.toLocaleString()} loaded` : ""}
            {searchText ? ` · matching “${searchText}”` : ""}
          </p>
        </div>
        {viewAllHref ? (
          <Link to={viewAllHref} className="text-xs font-semibold text-brand hover:underline">
            Open files library
          </Link>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface-muted/30 p-3">
        <label className="min-w-[180px] flex-1">
          <span className="mb-1 block text-xs font-medium text-muted">Search</span>
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Search documents…"
            className="w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-muted shadow-inner focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </label>

        {showCustomerFilter ? (
          <div className="min-w-[160px] max-w-[220px] flex-1">
            <SearchableCustomerSelect
              customers={customers}
              value={filterCustomerId}
              onChange={setFilterCustomerId}
              label="Customer"
              allowEmpty
              emptyLabel="All customers"
              size="small"
              className="w-full"
            />
          </div>
        ) : null}

        {showAssignedFilter ? (
          <label className="flex items-center gap-2 pb-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              checked={assignedToMeOnly}
              onChange={(e) => setAssignedToMeOnly(e.target.checked)}
              className="rounded border-border"
            />
            {" "}
            Assigned to me
          </label>
        ) : null}
      </div>

      {err ? (
        <p className="mt-4 text-sm text-feedback-error">
          {err}
          <button type="button" className="ml-2 font-semibold underline" onClick={() => void resetAndLoad()}>
            Retry
          </button>
        </p>
      ) : null}

      <RecentDocumentsBody
        loading={loading}
        rows={rows}
        err={err}
        filtersActive={filtersActive}
        showCustomer={showCustomer}
        onOpenDocument={onOpenDocument}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={loadMore}
      />
    </section>
  );
}
