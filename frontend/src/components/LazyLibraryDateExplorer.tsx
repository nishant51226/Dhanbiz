import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Breadcrumbs,
  Button,
  Checkbox,
  CircularProgress,
  IconButton,
  Link,
  Paper,
  Snackbar,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import CalendarTodayOutlined from "@mui/icons-material/CalendarTodayOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import NavigateNext from "@mui/icons-material/NavigateNext";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import {
  fetchAdminLibraryBrowseDates,
  fetchDocumentContentBlob,
  fetchDocumentsList,
  fetchPortalLibraryBrowseDates,
  LIBRARY_FOLDER_PAGE_SIZE,
} from "../api/client";
import type {
  AdminLibraryDocumentRow,
  LibraryDateBrowseCustomerRow,
  LibraryDateBrowseDayRow,
  LibraryDateBrowseFolderRow,
  LibraryDateBrowseLevel,
  LibraryDateBrowseMonthRow,
  LibraryDateBrowseYearRow,
  PortalLibrarySection,
} from "../types/api";
import { cleanLibraryFolderName } from "../utils/libraryFolderDisplayName";
import { triggerBrowserDownload } from "../utils/onboardingExportFilename";
import { useLibraryZipExport } from "../hooks/useLibraryZipExport";

type DateNav =
  | { step: "years" }
  | { step: "months"; year: number }
  | { step: "days"; year: number; month: number }
  | { step: "customers"; year: number; month: number; day: number }
  | {
      step: "folders";
      year: number;
      month: number;
      day: number;
      customerId: string;
      customerName: string;
    }
  | {
      step: "documents";
      year: number;
      month: number;
      day: number;
      customerId: string;
      customerName: string;
      folderId: string;
      folderName: string;
    };

const ROOT_NAV: DateNav = { step: "years" };

type BrowseEntry =
  | { kind: "year"; id: string; year: number; count: number }
  | { kind: "month"; id: string; month: number; name: string; count: number }
  | { kind: "day"; id: string; day: number; count: number }
  | { kind: "customer"; id: string; customerId: string; name: string; count: number }
  | { kind: "folder"; id: string; folderId: string; name: string; subtitle: string; count: number }
  | { kind: "document"; id: string; name: string; subtitle: string; doc: AdminLibraryDocumentRow };

import { formatDateParts } from "../utils/formatDate";

function monthLabel(month: number): string {
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en-US", { month: "long" });
}

function dayLabel(year: number, month: number, day: number): string {
  return formatDateParts(year, month, day);
}

function levelForNav(nav: DateNav): LibraryDateBrowseLevel {
  return nav.step;
}

function navQueryContext(nav: DateNav): {
  year?: number;
  month?: number;
  day?: number;
  customerId?: string;
  folderId?: string;
} {
  if (nav.step === "years") return {};
  if (nav.step === "months") return { year: nav.year };
  if (nav.step === "days") return { year: nav.year, month: nav.month };
  if (nav.step === "customers") return { year: nav.year, month: nav.month, day: nav.day };
  if (nav.step === "folders") {
    return { year: nav.year, month: nav.month, day: nav.day, customerId: nav.customerId };
  }
  return {
    year: nav.year,
    month: nav.month,
    day: nav.day,
    customerId: nav.customerId,
    folderId: nav.folderId,
  };
}

type Props = {
  apiBase: string;
  headers: HeadersInit;
  customerId?: string;
  customerName?: string;
  staffBrowseForCustomer?: boolean;
  libraryKind?: "" | PortalLibrarySection;
  searchText?: string;
  assignedToMeOnly?: boolean;
  onOpenDocument: (documentId: string) => void;
  canDelete?: boolean;
  deletingDocumentIds?: ReadonlySet<string> | null;
  onDeleteDocuments?: (documentIds: string[]) => void;
  deletingFolderId?: string | null;
  onDeleteFolder?: (folderId: string, folderName: string) => void;
  refreshKey?: number;
  removedFolderId?: string | null;
  onRemovedFolderConsumed?: () => void;
  /** Omit outer Paper; parent supplies card chrome (Files page). */
  embedded?: boolean;
};

function entryDisplayName(entry: BrowseEntry): string {
  if (entry.kind === "year") return String(entry.year);
  if (entry.kind === "day") return String(entry.day).padStart(2, "0");
  return entry.name;
}

export function LazyLibraryDateExplorer({
  apiBase,
  headers,
  customerId,
  customerName,
  staffBrowseForCustomer = false,
  libraryKind = "",
  searchText = "",
  assignedToMeOnly = false,
  onOpenDocument,
  canDelete = false,
  deletingDocumentIds = null,
  onDeleteDocuments,
  deletingFolderId = null,
  onDeleteFolder,
  refreshKey = 0,
  removedFolderId = null,
  onRemovedFolderConsumed,
  embedded = false,
}: Readonly<Props>) {
  const [nav, setNav] = useState<DateNav>(ROOT_NAV);
  const [items, setItems] = useState<BrowseEntry[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [searchResults, setSearchResults] = useState<AdminLibraryDocumentRow[]>([]);
  const [searchPage, setSearchPage] = useState(0);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchLockRef = useRef(false);
  const searchFetchLockRef = useRef(false);
  const headersRef = useRef(headers);
  headersRef.current = headers;

  const searchQuery = searchText.trim();
  const searchActive = searchQuery.length > 0;
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(() => new Set());
  const [downloadingDocumentIds, setDownloadingDocumentIds] = useState<Set<string>>(() => new Set());
  const fileSelectionActive = canDelete && Boolean(onDeleteDocuments) && (nav.step === "documents" || searchActive);
  const singleCustomerScope = Boolean(customerId);
  const browseLibraryKind: PortalLibrarySection | undefined = libraryKind || undefined;
  const usePortalDateApi = Boolean(customerId) && !staffBrowseForCustomer;

  const fetchBrowse = useCallback(
    async (targetNav: DateNav, nextPage: number) => {
      const level = levelForNav(targetNav);
      const ctx = navQueryContext(targetNav);
      const query = {
        level,
        page: nextPage,
        limit: LIBRARY_FOLDER_PAGE_SIZE,
        ...ctx,
        libraryKind: browseLibraryKind,
        assignedOnly: assignedToMeOnly ? true : undefined,
        dateBasis: "uploaded" as const,
      };
      if (usePortalDateApi) {
        return fetchPortalLibraryBrowseDates(apiBase, headersRef.current, customerId!, query);
      }
      return fetchAdminLibraryBrowseDates(apiBase, headersRef.current, {
        ...query,
        customerId: ctx.customerId ?? customerId,
      });
    },
    [apiBase, customerId, browseLibraryKind, assignedToMeOnly, usePortalDateApi],
  );

  const mapRowsToEntries = useCallback(
    (level: LibraryDateBrowseLevel, rows: unknown[]): BrowseEntry[] => {
      if (level === "years") {
        return (rows as LibraryDateBrowseYearRow[]).map((r) => ({
          kind: "year" as const,
          id: `year:${r.year}`,
          year: r.year,
          count: r.count,
        }));
      }
      if (level === "months") {
        return (rows as LibraryDateBrowseMonthRow[]).map((r) => ({
          kind: "month" as const,
          id: `month:${r.month}`,
          month: r.month,
          name: monthLabel(r.month),
          count: r.count,
        }));
      }
      if (level === "days") {
        return (rows as LibraryDateBrowseDayRow[]).map((r) => ({
          kind: "day" as const,
          id: `day:${r.day}`,
          day: r.day,
          count: r.count,
        }));
      }
      if (level === "customers") {
        return (rows as LibraryDateBrowseCustomerRow[]).map((r) => ({
          kind: "customer" as const,
          id: r.customerId,
          customerId: r.customerId,
          name: r.customerName,
          count: r.count,
        }));
      }
      if (level === "folders") {
        return (rows as LibraryDateBrowseFolderRow[]).map((r) => ({
          kind: "folder" as const,
          id: r.folderId,
          folderId: r.folderId,
          name: cleanLibraryFolderName(r.folderName),
          subtitle: r.libraryKind,
          count: r.count,
        }));
      }
      return (rows as AdminLibraryDocumentRow[]).map((doc) => ({
        kind: "document" as const,
        id: doc.id,
        name: doc.name,
        subtitle: doc.folder?.name ? cleanLibraryFolderName(doc.folder.name) : "—",
        doc,
      }));
    },
    [],
  );

  const loadPage = useCallback(
    async (nextPage: number, append: boolean) => {
      if (fetchLockRef.current || searchActive) return;
      fetchLockRef.current = true;
      if (nextPage === 1) {
        setLoading(true);
        setError("");
      } else {
        setLoadingMore(true);
      }
      try {
        const res = await fetchBrowse(nav, nextPage);
        const mapped = mapRowsToEntries(levelForNav(nav), res.data);
        setItems((prev) => (append ? [...prev, ...mapped] : mapped));
        setPage(res.page);
        setTotal(res.total);
        setHasMore(res.page < res.pageCount);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load";
        if (!append) {
          setItems([]);
          setTotal(0);
        }
        setError(msg);
        setHasMore(false);
      } finally {
        fetchLockRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [searchActive, fetchBrowse, nav, mapRowsToEntries],
  );

  const loadSearch = useCallback(
    async (nextPage: number, append: boolean) => {
      if (searchFetchLockRef.current || !searchQuery) return;
      searchFetchLockRef.current = true;
      if (nextPage === 1) {
        setSearchLoading(true);
        setSearchError("");
      } else {
        setSearchLoadingMore(true);
      }
      try {
        const res = await fetchDocumentsList(apiBase, headersRef.current, {
          page: nextPage,
          limit: LIBRARY_FOLDER_PAGE_SIZE,
          sort: "name,ASC",
          customerId: customerId || undefined,
          libraryKind: browseLibraryKind,
          searchText: searchQuery,
          assignedOnly: assignedToMeOnly ? true : undefined,
        });
        setSearchResults((prev) => (append ? [...prev, ...res.data] : res.data));
        setSearchPage(res.page);
        setSearchTotal(res.total);
        setSearchHasMore(res.page < res.pageCount);
      } catch (e) {
        if (!append) setSearchResults([]);
        setSearchError(e instanceof Error ? e.message : "Search failed");
        setSearchHasMore(false);
      } finally {
        searchFetchLockRef.current = false;
        setSearchLoading(false);
        setSearchLoadingMore(false);
      }
    },
    [apiBase, customerId, browseLibraryKind, searchQuery, assignedToMeOnly],
  );

  const loadPageRef = useRef(loadPage);
  loadPageRef.current = loadPage;
  const loadSearchRef = useRef(loadSearch);
  loadSearchRef.current = loadSearch;

  useEffect(() => {
    if (searchActive) {
      setNav(ROOT_NAV);
      setSearchResults([]);
      void loadSearchRef.current(1, false);
      return;
    }
    setSearchResults([]);
    setSearchError("");
  }, [searchActive, searchQuery, customerId, libraryKind, assignedToMeOnly, refreshKey]);

  useEffect(() => {
    if (searchActive) return;
    setItems([]);
    setPage(0);
    setTotal(0);
    setHasMore(false);
    setError("");
    void loadPageRef.current(1, false);
  }, [nav, searchActive, customerId, libraryKind, refreshKey]);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const disabled = searchActive
      ? searchLoading || searchLoadingMore || !searchHasMore
      : loading || loadingMore || !hasMore;
    if (disabled) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (searchActive) void loadSearchRef.current(searchPage + 1, true);
        else void loadPageRef.current(page + 1, true);
      },
      { root, rootMargin: "120px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    searchActive,
    searchLoading,
    searchLoadingMore,
    searchHasMore,
    searchPage,
    loading,
    loadingMore,
    hasMore,
    page,
    items.length,
    searchResults.length,
  ]);

  const breadcrumbs = useMemo(() => {
    type Crumb = { label: string; nav: DateNav };
    const crumbs: Crumb[] = [{ label: "All dates", nav: ROOT_NAV }];
    if (nav.step === "months" || nav.step === "days" || nav.step === "customers" || nav.step === "folders" || nav.step === "documents") {
      crumbs.push({ label: String(nav.year), nav: { step: "months", year: nav.year } });
    }
    if (nav.step === "days" || nav.step === "customers" || nav.step === "folders" || nav.step === "documents") {
      crumbs.push({ label: monthLabel(nav.month), nav: { step: "days", year: nav.year, month: nav.month } });
    }
    if (nav.step === "customers" || nav.step === "folders" || nav.step === "documents") {
      crumbs.push({
        label: dayLabel(nav.year, nav.month, nav.day),
        nav: singleCustomerScope
          ? { step: "folders", year: nav.year, month: nav.month, day: nav.day, customerId: customerId!, customerName: customerName ?? "Customer" }
          : { step: "customers", year: nav.year, month: nav.month, day: nav.day },
      });
    }
    if ((nav.step === "folders" || nav.step === "documents") && !singleCustomerScope) {
      crumbs.push({
        label: nav.customerName,
        nav: { step: "folders", year: nav.year, month: nav.month, day: nav.day, customerId: nav.customerId, customerName: nav.customerName },
      });
    }
    if (nav.step === "documents") {
      crumbs.push({
        label: cleanLibraryFolderName(nav.folderName),
        nav: {
          step: "documents",
          year: nav.year,
          month: nav.month,
          day: nav.day,
          customerId: nav.customerId,
          customerName: nav.customerName,
          folderId: nav.folderId,
          folderName: nav.folderName,
        },
      });
    }
    return crumbs;
  }, [nav, singleCustomerScope, customerId, customerName]);

  const onEntryClick = (entry: BrowseEntry) => {
    if (entry.kind === "year") {
      setNav({ step: "months", year: entry.year });
      return;
    }
    if (entry.kind === "month" && nav.step === "months") {
      setNav({ step: "days", year: nav.year, month: entry.month });
      return;
    }
    if (entry.kind === "day" && nav.step === "days") {
      if (singleCustomerScope && customerId) {
        setNav({
          step: "folders",
          year: nav.year,
          month: nav.month,
          day: entry.day,
          customerId,
          customerName: customerName ?? "Customer",
        });
      } else {
        setNav({ step: "customers", year: nav.year, month: nav.month, day: entry.day });
      }
      return;
    }
    if (entry.kind === "customer" && nav.step === "customers") {
      setNav({
        step: "folders",
        year: nav.year,
        month: nav.month,
        day: nav.day,
        customerId: entry.customerId,
        customerName: entry.name,
      });
      return;
    }
    if (entry.kind === "folder" && nav.step === "folders") {
      setNav({
        step: "documents",
        year: nav.year,
        month: nav.month,
        day: nav.day,
        customerId: nav.customerId,
        customerName: nav.customerName,
        folderId: entry.folderId,
        folderName: entry.name,
      });
      return;
    }
    if (entry.kind === "document") {
      onOpenDocument(entry.id);
    }
  };

  const entryIcon = (kind: BrowseEntry["kind"]) => {
    if (kind === "document") return <InsertDriveFileOutlined sx={{ color: "info.main", fontSize: 22 }} />;
    if (kind === "folder") return <FolderOutlined sx={{ color: "warning.dark", fontSize: 22 }} />;
    if (kind === "customer") return <PersonOutlined sx={{ color: "primary.main", fontSize: 22 }} />;
    return <CalendarTodayOutlined sx={{ color: "primary.main", fontSize: 22 }} />;
  };

  const listTitle = searchActive
    ? "Search results"
    : nav.step === "years"
      ? "Years"
      : nav.step === "months"
        ? "Months"
        : nav.step === "days"
          ? "Dates"
          : nav.step === "customers"
            ? "Customers"
            : nav.step === "folders"
              ? "Folders"
              : "Documents";

  const showEntries = searchActive
    ? searchResults.map(
        (doc): BrowseEntry => ({
          kind: "document",
          id: doc.id,
          name: doc.name,
          subtitle: [doc.customer?.name, doc.folder?.name ? cleanLibraryFolderName(doc.folder.name) : null]
            .filter(Boolean)
            .join(" · ") || "—",
          doc,
        }),
      )
    : items;

  const selectableFileIds = useMemo(() => {
    if (!fileSelectionActive) return [] as string[];
    return showEntries.filter((entry) => entry.kind === "document").map((entry) => entry.id);
  }, [fileSelectionActive, showEntries]);

  const allVisibleFilesSelected =
    selectableFileIds.length > 0 && selectableFileIds.every((id) => selectedFileIds.has(id));
  const someVisibleFilesSelected = selectableFileIds.some((id) => selectedFileIds.has(id));

  useEffect(() => {
    setSelectedFileIds(new Set());
  }, [nav, searchActive, refreshKey]);

  useEffect(() => {
    if (!removedFolderId) return;
    setItems((prev) => prev.filter((e) => e.kind !== "folder" || e.folderId !== removedFolderId));
    setNav((current) => {
      if (current.step === "documents" && current.folderId === removedFolderId) {
        return {
          step: "folders",
          year: current.year,
          month: current.month,
          day: current.day,
          customerId: current.customerId,
          customerName: current.customerName,
        };
      }
      return current;
    });
    onRemovedFolderConsumed?.();
  }, [removedFolderId, onRemovedFolderConsumed]);

  const toggleFileSelection = useCallback((fileId: string, checked: boolean) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(fileId);
      else next.delete(fileId);
      return next;
    });
  }, []);

  const toggleAllVisibleFiles = useCallback(
    (checked: boolean) => {
      setSelectedFileIds((prev) => {
        const next = new Set(prev);
        for (const id of selectableFileIds) {
          if (checked) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [selectableFileIds],
  );

  const resolveDocCustomerId = useCallback(
    (doc?: AdminLibraryDocumentRow): string => {
      if (nav.step === "documents") return nav.customerId;
      if (customerId) return customerId;
      return (
        doc?.customerId ??
        doc?.customer?.id ??
        doc?.folder?.customerId ??
        doc?.folder?.customer?.id ??
        ""
      );
    },
    [nav, customerId],
  );

  const handleDownloadDocument = useCallback(
    async (documentId: string, fileName: string, doc?: AdminLibraryDocumentRow) => {
      setDownloadingDocumentIds((prev) => new Set(prev).add(documentId));
      try {
        const blob = await fetchDocumentContentBlob(
          apiBase,
          headersRef.current,
          resolveDocCustomerId(doc),
          documentId,
          { download: true },
        );
        triggerBrowserDownload(blob, fileName.trim() || "download");
      } catch {
        // Keep date browsing usable if a single download fails.
      } finally {
        setDownloadingDocumentIds((prev) => {
          const next = new Set(prev);
          next.delete(documentId);
          return next;
        });
      }
    },
    [apiBase, resolveDocCustomerId],
  );

  const { exporting, exportNotice, setExportNotice, startLibraryZipExport } =
    useLibraryZipExport(apiBase, () => headersRef.current);

  const buildViewExportInput = useCallback((): import("../api/client").CreateLibraryExportInput => {
    const ctx = navQueryContext(nav);
    const scopedCustomerId = ctx.customerId ?? (customerId?.trim() || undefined);
    return {
      customerId: scopedCustomerId,
      viewMode: "dateView",
      libraryKind: browseLibraryKind,
      folderId: ctx.folderId,
      folderName: nav.step === "documents" ? nav.folderName : undefined,
      year: ctx.year,
      month: ctx.month,
      day: ctx.day,
      searchText: searchActive ? searchQuery : searchText.trim() || undefined,
      assignedOnly: assignedToMeOnly ? true : undefined,
    };
  }, [
    nav,
    customerId,
    browseLibraryKind,
    searchActive,
    searchQuery,
    searchText,
    assignedToMeOnly,
  ]);

  const exportScopeLabel = useMemo(() => {
    if (searchActive) return `search "${searchQuery}"`;
    if (nav.step === "years") return "all dates";
    if (nav.step === "months") return String(nav.year);
    if (nav.step === "days") return `${monthLabel(nav.month)} ${nav.year}`;
    if (nav.step === "customers") return dayLabel(nav.year, nav.month, nav.day);
    if (nav.step === "folders") return nav.customerName;
    if (nav.step === "documents") return cleanLibraryFolderName(nav.folderName);
    return "date library";
  }, [searchActive, searchQuery, nav]);

  const handleViewZipExport = useCallback(() => {
    void startLibraryZipExport(buildViewExportInput(), exportScopeLabel);
  }, [buildViewExportInput, exportScopeLabel, startLibraryZipExport]);

  const handleSelectedZipExport = useCallback(() => {
    const ids = [...selectedFileIds];
    if (ids.length === 0) return;
    const ctx = navQueryContext(nav);
    const scopedCustomerId = ctx.customerId ?? (customerId?.trim() || undefined);
    void startLibraryZipExport(
      {
        customerId: scopedCustomerId,
        viewMode: "dateView",
        libraryKind: browseLibraryKind,
        documentIds: ids,
      },
      `${ids.length} selected file${ids.length === 1 ? "" : "s"}`,
    );
  }, [selectedFileIds, nav, customerId, browseLibraryKind, startLibraryZipExport]);

  const actionsColumnWidth = canDelete ? 104 : 52;

  const renderFileActions = (documentId: string, fileName: string, doc?: AdminLibraryDocumentRow) => (
    <Box sx={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 0.25, minWidth: actionsColumnWidth }}>
      {canDelete && onDeleteDocuments ? (
        <Tooltip title="Delete">
          <IconButton
            size="small"
            color="error"
            aria-label="Delete document"
            disabled={deletingDocumentIds?.has(documentId) ?? false}
            onClick={() => onDeleteDocuments([documentId])}
          >
            <DeleteOutlined fontSize="small" />
          </IconButton>
        </Tooltip>
      ) : null}
      <Tooltip title="Download">
        <span>
          <IconButton
            size="small"
            color="primary"
            aria-label="Download file"
            disabled={downloadingDocumentIds.has(documentId)}
            onClick={() => void handleDownloadDocument(documentId, fileName, doc)}
          >
            {downloadingDocumentIds.has(documentId) ? (
              <CircularProgress size={16} />
            ) : (
              <DownloadOutlined fontSize="small" />
            )}
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );

  const dateBrowsePanel = (
    <>
      <Box
        sx={{
          px: 2,
          py: 1.25,
          borderBottom: "1px solid",
          borderColor: "divider",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 2,
          justifyContent: "space-between",
        }}
      >
        {searchActive ? (
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Search results
              {searchResults.length > 0 ? (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                  ({searchResults.length}
                  {searchTotal > searchResults.length ? ` of ${searchTotal}` : ""} files)
                </Typography>
              ) : null}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Matching &ldquo;{searchQuery}&rdquo; in document names
            </Typography>
          </Box>
        ) : (
          <Breadcrumbs separator={<NavigateNext fontSize="small" />} sx={{ flex: 1, minWidth: 0 }}>
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              if (isLast) {
                return (
                  <Typography key={crumb.label} variant="body2" color="text.primary" sx={{ fontWeight: 600 }} noWrap>
                    {listTitle}
                  </Typography>
                );
              }
              return (
                <Link
                  key={`${crumb.label}-${i}`}
                  component="button"
                  type="button"
                  variant="body2"
                  color="inherit"
                  underline="hover"
                  onClick={() => setNav(crumb.nav)}
                  sx={{ maxWidth: 200 }}
                  noWrap
                >
                  {crumb.label}
                </Link>
              );
            })}
          </Breadcrumbs>
        )}
        {!searchActive && total > 0 ? (
          <Typography variant="caption" color="text.secondary">
            {items.length}
            {hasMore ? "+" : ""} of {total}
          </Typography>
        ) : null}
        {fileSelectionActive && selectedFileIds.size > 0 ? (
          <>
            <Tooltip title={`Download ZIP for ${selectedFileIds.size} selected file${selectedFileIds.size === 1 ? "" : "s"}`}>
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={exporting ? <CircularProgress size={14} /> : <DownloadOutlined fontSize="small" />}
                  disabled={exporting}
                  onClick={handleSelectedZipExport}
                >
                  Download selected ({selectedFileIds.size})
                </Button>
              </span>
            </Tooltip>
            {onDeleteDocuments ? (
              <Button
                size="small"
                color="error"
                variant="outlined"
                startIcon={<DeleteOutlined fontSize="small" />}
                disabled={(deletingDocumentIds?.size ?? 0) > 0}
                onClick={() => onDeleteDocuments([...selectedFileIds])}
              >
                Delete selected ({selectedFileIds.size})
              </Button>
            ) : null}
          </>
        ) : null}
        <Tooltip title={`Download ZIP for ${exportScopeLabel}`}>
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={exporting ? <CircularProgress size={14} /> : <DownloadOutlined fontSize="small" />}
              disabled={exporting}
              onClick={handleViewZipExport}
            >
              Download ZIP
            </Button>
          </span>
        </Tooltip>
      </Box>

      <Box ref={scrollRef} className="scroll-subtle" sx={{ maxHeight: 640, overflowY: "auto" }}>
        {(searchActive ? searchLoading : loading) && showEntries.length === 0 ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (searchActive ? searchError : error) ? (
          <Typography variant="body2" color="error" sx={{ px: 3, py: 4 }}>
            {searchActive ? searchError : error}
          </Typography>
        ) : showEntries.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 6, textAlign: "center" }}>
            {searchActive ? "No documents match your search." : "No dated documents found."}
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small" aria-label="Date browse">
              <TableHead>
                <TableRow sx={{ bgcolor: "background.default" }}>
                  {fileSelectionActive ? (
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={allVisibleFilesSelected}
                        indeterminate={someVisibleFilesSelected && !allVisibleFilesSelected}
                        onChange={(e) => toggleAllVisibleFiles(e.target.checked)}
                        aria-label="Select all documents"
                      />
                    </TableCell>
                  ) : null}
                  <TableCell sx={{ fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    Name
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 700,
                      fontSize: "0.7rem",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      display: { xs: "none", sm: "table-cell" },
                    }}
                  >
                    Details
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.06em", textTransform: "uppercase", width: 72 }}>
                    Count
                  </TableCell>
                  <TableCell align="right" sx={{ width: actionsColumnWidth, minWidth: actionsColumnWidth, whiteSpace: "nowrap" }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {showEntries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    hover
                    onClick={() => (searchActive ? onOpenDocument(entry.id) : onEntryClick(entry))}
                    sx={{ cursor: "pointer", "&:last-child td": { borderBottom: 0 } }}
                  >
                    {fileSelectionActive && entry.kind === "document" ? (
                      <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          size="small"
                          checked={selectedFileIds.has(entry.id)}
                          onChange={(e) => toggleFileSelection(entry.id, e.target.checked)}
                          aria-label={`Select ${entry.name}`}
                        />
                      </TableCell>
                    ) : fileSelectionActive ? (
                      <TableCell padding="checkbox" />
                    ) : null}
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                        {entryIcon(entry.kind)}
                        <Typography variant="body2" noWrap title={entryDisplayName(entry)} sx={{ fontWeight: 500 }}>
                          {entry.kind === "year"
                            ? String(entry.year)
                            : entry.kind === "day"
                              ? String(entry.day).padStart(2, "0")
                              : entry.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {entry.kind === "document"
                          ? entry.subtitle
                          : entry.kind === "folder"
                            ? entry.subtitle
                            : entry.kind === "year" || entry.kind === "month" || entry.kind === "day" || entry.kind === "customer"
                              ? ""
                              : ""}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption" color="text.secondary">
                        {entry.kind === "document"
                          ? ""
                          : entry.kind === "year" || entry.kind === "month" || entry.kind === "day" || entry.kind === "customer" || entry.kind === "folder"
                            ? entry.count
                            : ""}
                      </Typography>
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={{ width: actionsColumnWidth, minWidth: actionsColumnWidth, whiteSpace: "nowrap" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {entry.kind === "document"
                        ? renderFileActions(entry.id, entry.name, entry.doc)
                        : entry.kind === "folder" && canDelete && onDeleteFolder ? (
                            <IconButton
                              size="small"
                              color="error"
                              aria-label="Delete folder"
                              disabled={deletingFolderId === entry.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteFolder(entry.folderId, entry.name);
                              }}
                            >
                              <DeleteOutlined fontSize="small" />
                            </IconButton>
                          ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {(searchActive ? searchLoadingMore : loadingMore) ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 1.5 }}>
            <CircularProgress size={18} />
          </Box>
        ) : null}
        <Box ref={sentinelRef} sx={{ height: 1 }} />
      </Box>
    </>
  );

  return (
    <>
      {embedded ? dateBrowsePanel : (
        <Paper variant="outlined" sx={{ overflow: "hidden", bgcolor: "background.paper" }}>
          {dateBrowsePanel}
        </Paper>
      )}
      <Snackbar
      open={Boolean(exportNotice)}
      autoHideDuration={6000}
      onClose={() => setExportNotice(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      {exportNotice ? (
        <Alert severity={exportNotice.severity} onClose={() => setExportNotice(null)} sx={{ width: "100%" }}>
          {exportNotice.message}
        </Alert>
      ) : undefined}
    </Snackbar>
    </>
  );
}
