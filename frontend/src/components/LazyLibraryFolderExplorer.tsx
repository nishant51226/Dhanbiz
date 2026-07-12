import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import CalendarTodayOutlined from "@mui/icons-material/CalendarTodayOutlined";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import FolderOutlined from "@mui/icons-material/FolderOutlined";
import GridViewOutlined from "@mui/icons-material/GridViewOutlined";
import InsertDriveFileOutlined from "@mui/icons-material/InsertDriveFileOutlined";
import NavigateNext from "@mui/icons-material/NavigateNext";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import ViewListOutlined from "@mui/icons-material/ViewListOutlined";
import {
  fetchAdminLibraryBrowseDates,
  fetchAdminLibraryBrowseFolders,
  fetchDocumentContentBlob,
  fetchDocumentsList,
  fetchPortalLibraryBrowseDates,
  fetchPortalLibraryBrowseFolders,
  LIBRARY_FOLDER_PAGE_SIZE,
} from "../api/client";
import type {
  AdminLibraryDocumentRow,
  LibraryDateBrowseCustomerRow,
  LibraryDateBrowseDayRow,
  LibraryDateBrowseLevel,
  LibraryDateBrowseMonthRow,
  LibraryDateBrowseYearRow,
  PortalLibraryDocumentRow,
  PortalLibraryFolderRow,
  PortalLibrarySection,
} from "../types/api";
import {
  formatLibraryDocumentUploadDateTime,
  formatLibraryDocumentUploadDisplayDate,
} from "../utils/libraryDocumentDate";
import {
  cleanLibraryFolderName,
  folderMatchesSearchQuery,
} from "../utils/libraryFolderDisplayName";
import { folderScopeDetailsLabel, folderScopeIconColor, folderScopeNameColor } from "../utils/folderScopeDisplay";
import { triggerBrowserDownload } from "../utils/onboardingExportFilename";
import { formatDateParts } from "../utils/formatDate";
import { useLibraryZipExport } from "../hooks/useLibraryZipExport";

type DriveLayout = "list" | "grid";

type SelectedFolder = { id: string; section: PortalLibrarySection; name: string };

/** Folder → Year → Month → Day → Customer → Files */
type FolderNav =
  | { step: "folders" }
  | { step: "years"; folder: SelectedFolder }
  | { step: "months"; folder: SelectedFolder; year: number }
  | { step: "days"; folder: SelectedFolder; year: number; month: number }
  | { step: "customers"; folder: SelectedFolder; year: number; month: number; day: number }
  | {
      step: "files";
      folder: SelectedFolder;
      year: number;
      month: number;
      day: number;
      customerId: string;
      customerName: string;
    };

const ROOT_NAV: FolderNav = { step: "folders" };

type DrillBrowseEntry =
  | { kind: "year"; id: string; year: number; count: number }
  | { kind: "month"; id: string; month: number; name: string; count: number }
  | { kind: "day"; id: string; day: number; count: number }
  | { kind: "customer"; id: string; customerId: string; name: string; count: number }
  | {
      kind: "file";
      id: string;
      name: string;
      subtitle: string;
      dateLabel: string;
      doc: AdminLibraryDocumentRow;
    };

type BrowseListEntry =
  | { kind: "section"; id: string; label: string }
  | { kind: "empty"; id: string; message: string }
  | {
      kind: "folder";
      id: string;
      folder: PortalLibraryFolderRow;
      name: string;
      subtitle: string;
      isGlobal: boolean;
      isRestricted: boolean;
    }
  | DrillBrowseEntry;

function monthLabel(month: number): string {
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en-US", { month: "long" });
}

function dayLabel(year: number, month: number, day: number): string {
  return formatDateParts(year, month, day);
}

function drillLevelForNav(nav: FolderNav): LibraryDateBrowseLevel | null {
  if (nav.step === "folders") return null;
  if (nav.step === "years") return "years";
  if (nav.step === "months") return "months";
  if (nav.step === "days") return "days";
  if (nav.step === "customers") return "customers";
  return "documents";
}

function drillNavKey(nav: FolderNav): string | null {
  if (nav.step === "folders") return null;
  if (nav.step === "years") return `years:${nav.folder.id}`;
  if (nav.step === "months") return `months:${nav.folder.id}:${nav.year}`;
  if (nav.step === "days") return `days:${nav.folder.id}:${nav.year}-${nav.month}`;
  if (nav.step === "customers") {
    return `customers:${nav.folder.id}:${nav.year}-${nav.month}-${nav.day}`;
  }
  return `files:${nav.folder.id}:${nav.year}-${nav.month}-${nav.day}:${nav.customerId}`;
}

function drillEntryDisplay(
  entry: DrillBrowseEntry,
  nav: FolderNav,
): { name: string; subtitle: string; dateLabel: string } {
  const countLabel = (n: number) => `${n} file${n === 1 ? "" : "s"}`;
  if (entry.kind === "year") {
    return { name: String(entry.year), subtitle: countLabel(entry.count), dateLabel: "" };
  }
  if (entry.kind === "month") {
    return { name: entry.name, subtitle: countLabel(entry.count), dateLabel: "" };
  }
  if (entry.kind === "day") {
    if (nav.step === "days" || nav.step === "customers" || nav.step === "files") {
      return {
        name: dayLabel(nav.year, nav.month, entry.day),
        subtitle: countLabel(entry.count),
        dateLabel: "",
      };
    }
    return { name: String(entry.day), subtitle: countLabel(entry.count), dateLabel: "" };
  }
  if (entry.kind === "customer") {
    return { name: entry.name, subtitle: countLabel(entry.count), dateLabel: "" };
  }
  if (entry.kind === "file") {
    return { name: entry.name, subtitle: entry.subtitle, dateLabel: entry.dateLabel };
  }
  return { name: "", subtitle: "", dateLabel: "" };
}

function drillQueryContext(nav: FolderNav): {
  folderId: string;
  year?: number;
  month?: number;
  day?: number;
  customerId?: string;
} {
  if (nav.step === "folders") return { folderId: "" };
  if (nav.step === "years") return { folderId: nav.folder.id };
  if (nav.step === "months") return { folderId: nav.folder.id, year: nav.year };
  if (nav.step === "days") return { folderId: nav.folder.id, year: nav.year, month: nav.month };
  if (nav.step === "customers") {
    return { folderId: nav.folder.id, year: nav.year, month: nav.month, day: nav.day };
  }
  return {
    folderId: nav.folder.id,
    year: nav.year,
    month: nav.month,
    day: nav.day,
    customerId: nav.customerId,
  };
}

type SearchListEntry =
  | { kind: "section"; id: string; label: string }
  | {
      kind: "search-folder";
      id: string;
      folder: PortalLibraryFolderRow;
      name: string;
      subtitle: string;
    }
  | {
      kind: "search-file";
      id: string;
      name: string;
      subtitle: string;
      doc: AdminLibraryDocumentRow;
    };

function folderScopeCountLabel(loaded: number, total: number): string {
  if (total <= 0) return "";
  return ` (${loaded}/${total})`;
}

function searchResultSubtitle(doc: AdminLibraryDocumentRow, showCustomer: boolean): string {
  const parts: string[] = [];
  if (showCustomer) {
    const customerName = doc.customer?.name ?? doc.folder?.customer?.name;
    if (customerName) parts.push(customerName);
  }
  if (doc.folder?.name) parts.push(cleanLibraryFolderName(doc.folder.name));
  const when = doc.uploadedAt || doc.createdAt;
  if (when) parts.push(formatLibraryDocumentUploadDateTime(when));
  return parts.join(" · ") || "—";
}

function formatDocRowDate(doc: PortalLibraryDocumentRow): string {
  return formatLibraryDocumentUploadDisplayDate(doc.uploadedAt ?? null, doc.createdAt ?? null);
}

type Props = {
  apiBase: string;
  headers: HeadersInit;
  customerId?: string;
  customerName?: string;
  /** Staff Files: browse one customer's library via admin APIs (not portal routes). */
  staffBrowseForCustomer?: boolean;
  libraryKind?: "" | PortalLibrarySection;
  searchText?: string;
  assignedToMeOnly?: boolean;
  uploadedAfter?: string;
  uploadedBefore?: string;
  onClearSearch?: () => void;
  onOpenDocument: (documentId: string) => void;
  canDelete?: boolean;
  deletingDocumentIds?: ReadonlySet<string> | null;
  onDeleteDocuments?: (documentIds: string[]) => void;
  deletingFolderId?: string | null;
  onDeleteFolder?: (folderId: string, folderName: string) => void;
  refreshKey?: number;
  /** After parent deletes a folder, remove it locally without resetting navigation. */
  removedFolderId?: string | null;
  onRemovedFolderConsumed?: () => void;
  /** Prepended crumbs (e.g. customer picker); last prefix crumb is clickable when `onNavigate` is set. */
  breadcrumbPrefix?: Array<{ label: string; onNavigate?: () => void }>;
  /** Root crumb label inside this explorer (default: All locations). */
  rootBreadcrumbLabel?: string;
  /** ZIP folder structure when exporting from this explorer. */
  exportViewMode?: "folderView" | "customerView";
  /** Rendered above the breadcrumb row (e.g. page-level customer filter + view mode). */
  toolbarPrefix?: ReactNode;
  /** Hide list/grid density toggle (page already has folder vs list view). */
  hideLayoutToggle?: boolean;
  /** Drop the in-table "Folders (n/n)" section row; count moves to the header. */
  compactListChrome?: boolean;
  /** Omit outer Paper + toolbarPrefix; parent supplies the card chrome (Files page). */
  embedded?: boolean;
  /** Show Assign column (files only) instead of the legacy Date column. */
  canAssignDocuments?: boolean;
  onAssignDocument?: (documentId: string, fileName: string, customerId?: string) => void;
};

export function LazyLibraryFolderExplorer({
  apiBase,
  headers,
  customerId,
  customerName,
  staffBrowseForCustomer = false,
  libraryKind = "",
  searchText = "",
  assignedToMeOnly = false,
  uploadedAfter,
  uploadedBefore,
  onClearSearch,
  onOpenDocument,
  canDelete = false,
  deletingDocumentIds = null,
  onDeleteDocuments,
  deletingFolderId = null,
  onDeleteFolder,
  refreshKey = 0,
  removedFolderId = null,
  onRemovedFolderConsumed,
  breadcrumbPrefix,
  rootBreadcrumbLabel = "All locations",
  exportViewMode = "folderView",
  toolbarPrefix,
  hideLayoutToggle = false,
  compactListChrome = false,
  embedded = false,
  canAssignDocuments = false,
  onAssignDocument,
}: Props) {
  const [layout, setLayout] = useState<DriveLayout>("list");
  const [nav, setNav] = useState<FolderNav>(ROOT_NAV);
  const [folders, setFolders] = useState<PortalLibraryFolderRow[]>([]);
  const [folderListPage, setFolderListPage] = useState(0);
  const [folderListTotal, setFolderListTotal] = useState(0);
  const [folderListHasMore, setFolderListHasMore] = useState(false);
  const [folderListLoading, setFolderListLoading] = useState(false);
  const [folderListLoadingMore, setFolderListLoadingMore] = useState(false);
  const [folderListError, setFolderListError] = useState("");
  const [drillItems, setDrillItems] = useState<DrillBrowseEntry[]>([]);
  const [drillPage, setDrillPage] = useState(0);
  const [drillTotal, setDrillTotal] = useState(0);
  const [drillHasMore, setDrillHasMore] = useState(false);
  const [drillLoading, setDrillLoading] = useState(false);
  const [drillLoadingMore, setDrillLoadingMore] = useState(false);
  const [drillError, setDrillError] = useState("");
  const folderScrollRef = useRef<HTMLDivElement>(null);
  const foldersSentinelRef = useRef<HTMLDivElement>(null);
  const drillSentinelRef = useRef<HTMLDivElement>(null);
  const folderListFetchLockRef = useRef(false);
  const drillFetchLockRef = useRef(false);
  const searchScrollRef = useRef<HTMLDivElement>(null);
  const searchSentinelRef = useRef<HTMLDivElement>(null);
  const searchFetchLockRef = useRef(false);
  const headersRef = useRef(headers);
  headersRef.current = headers;

  const [searchDocResults, setSearchDocResults] = useState<AdminLibraryDocumentRow[]>([]);
  const [searchDocPage, setSearchDocPage] = useState(0);
  const [searchDocTotal, setSearchDocTotal] = useState(0);
  const [searchDocHasMore, setSearchDocHasMore] = useState(false);
  const [searchFolderResults, setSearchFolderResults] = useState<PortalLibraryFolderRow[]>([]);
  const [searchFolderPage, setSearchFolderPage] = useState(0);
  const [searchFolderHasMore, setSearchFolderHasMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(() => new Set());
  const [downloadingDocumentIds, setDownloadingDocumentIds] = useState<Set<string>>(() => new Set());

  const searchQuery = searchText.trim();
  const searchActive = searchQuery.length > 0;
  const fileSelectionActive = canDelete && Boolean(onDeleteDocuments) && (nav.step === "files" || searchActive);
  const showCustomerPrefix = !customerId;
  const singleCustomerScope = Boolean(customerId);
  const browseLibraryKind: PortalLibrarySection | undefined = libraryKind || undefined;
  const usePortalFolderApi = Boolean(customerId) && !staffBrowseForCustomer;

  const visibleSearchFolderResults = useMemo(
    () =>
      searchFolderResults.filter((folder) =>
        folderMatchesSearchQuery(folder, searchQuery, { showCustomerPrefix }),
      ),
    [searchFolderResults, searchQuery, showCustomerPrefix],
  );
  const searchHasMore = searchDocHasMore || searchFolderHasMore;
  const searchMatchLoaded = searchDocResults.length + visibleSearchFolderResults.length;

  const foldersInitialLoading = folderListLoading && folders.length === 0;

  const mapDrillRows = useCallback((level: LibraryDateBrowseLevel, rows: unknown[]): DrillBrowseEntry[] => {
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
    return (rows as AdminLibraryDocumentRow[]).map((doc) => ({
      kind: "file" as const,
      id: doc.id,
      name: doc.name,
      subtitle: formatLibraryDocumentUploadDateTime(doc.uploadedAt ?? doc.createdAt ?? ""),
      dateLabel: formatDocRowDate(doc as PortalLibraryDocumentRow),
      doc,
    }));
  }, []);

  const fetchDrillBrowse = useCallback(
    async (targetNav: FolderNav, page: number) => {
      const level = drillLevelForNav(targetNav);
      if (!level) throw new Error("Invalid browse level");
      const ctx = drillQueryContext(targetNav);
      const query = {
        level,
        page,
        limit: LIBRARY_FOLDER_PAGE_SIZE,
        folderId: ctx.folderId,
        year: ctx.year,
        month: ctx.month,
        day: ctx.day,
        customerId: ctx.customerId,
        libraryKind: browseLibraryKind,
        assignedOnly: assignedToMeOnly ? true : undefined,
        dateBasis: "uploaded" as const,
      };
      if (usePortalFolderApi) {
        return fetchPortalLibraryBrowseDates(apiBase, headersRef.current, customerId!, query);
      }
      return fetchAdminLibraryBrowseDates(apiBase, headersRef.current, query);
    },
    [apiBase, customerId, browseLibraryKind, assignedToMeOnly, usePortalFolderApi],
  );

  const loadFolderListPage = useCallback(
    async (page: number, append: boolean) => {
      if (folderListFetchLockRef.current) return;
      folderListFetchLockRef.current = true;
      if (page === 1) {
        setFolderListLoading(true);
        setFolderListError("");
      } else {
        setFolderListLoadingMore(true);
      }
      try {
        const res = usePortalFolderApi
          ? await fetchPortalLibraryBrowseFolders(apiBase, headersRef.current, customerId!, {
              page,
              limit: LIBRARY_FOLDER_PAGE_SIZE,
              libraryKind: browseLibraryKind,
              scope: "all",
            })
          : await fetchAdminLibraryBrowseFolders(apiBase, headersRef.current, {
              page,
              limit: LIBRARY_FOLDER_PAGE_SIZE,
              libraryKind: browseLibraryKind,
              scope: "all",
              customerId,
            });
        setFolders((prev) => (append ? [...prev, ...res.data] : res.data));
        setFolderListPage(res.page);
        setFolderListTotal(res.total);
        setFolderListHasMore(res.page < res.pageCount);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load folders";
        if (!append) {
          setFolders([]);
          setFolderListTotal(0);
        }
        setFolderListError(msg);
        setFolderListHasMore(false);
      } finally {
        folderListFetchLockRef.current = false;
        setFolderListLoading(false);
        setFolderListLoadingMore(false);
      }
    },
    [apiBase, customerId, browseLibraryKind, usePortalFolderApi],
  );

  const loadFolderListPageRef = useRef(loadFolderListPage);
  loadFolderListPageRef.current = loadFolderListPage;

  const loadSearchInitial = useCallback(async () => {
    if (searchFetchLockRef.current || !searchQuery) return;
    searchFetchLockRef.current = true;
    setSearchLoading(true);
    setSearchError("");
    try {
      const [docRes, folderRes] = await Promise.all([
        fetchDocumentsList(apiBase, headersRef.current, {
          page: 1,
          limit: LIBRARY_FOLDER_PAGE_SIZE,
          sort: "name,ASC",
          customerId: customerId || undefined,
          libraryKind: browseLibraryKind,
          searchText: searchQuery,
          assignedOnly: assignedToMeOnly ? true : undefined,
        }),
        usePortalFolderApi
          ? fetchPortalLibraryBrowseFolders(apiBase, headersRef.current, customerId!, {
              page: 1,
              limit: LIBRARY_FOLDER_PAGE_SIZE,
              libraryKind: browseLibraryKind,
              scope: "all",
              searchText: searchQuery,
            })
          : fetchAdminLibraryBrowseFolders(apiBase, headersRef.current, {
              page: 1,
              limit: LIBRARY_FOLDER_PAGE_SIZE,
              libraryKind: browseLibraryKind,
              scope: "all",
              searchText: searchQuery,
              customerId,
            }),
      ]);
      setSearchDocResults(docRes.data);
      setSearchDocPage(docRes.page);
      setSearchDocTotal(docRes.total);
      setSearchDocHasMore(docRes.page < docRes.pageCount);
      setSearchFolderResults(folderRes.data);
      setSearchFolderPage(folderRes.page);
      setSearchFolderHasMore(folderRes.page < folderRes.pageCount);
    } catch (e) {
      setSearchDocResults([]);
      setSearchFolderResults([]);
      setSearchDocTotal(0);
      setSearchDocHasMore(false);
      setSearchFolderHasMore(false);
      setSearchError(e instanceof Error ? e.message : "Search failed");
    } finally {
      searchFetchLockRef.current = false;
      setSearchLoading(false);
    }
  }, [apiBase, customerId, browseLibraryKind, searchQuery, assignedToMeOnly, usePortalFolderApi]);

  const loadSearchMore = useCallback(async () => {
    if (searchFetchLockRef.current || !searchQuery) return;
    if (!searchDocHasMore && !searchFolderHasMore) return;

    searchFetchLockRef.current = true;
    setSearchLoadingMore(true);
    try {
      const tasks: Promise<void>[] = [];
      if (searchDocHasMore) {
        const nextPage = searchDocPage + 1;
        tasks.push(
          fetchDocumentsList(apiBase, headersRef.current, {
            page: nextPage,
            limit: LIBRARY_FOLDER_PAGE_SIZE,
            sort: "name,ASC",
            customerId: customerId || undefined,
            libraryKind: browseLibraryKind,
            searchText: searchQuery,
            assignedOnly: assignedToMeOnly ? true : undefined,
          }).then((res) => {
            setSearchDocResults((prev) => {
              const seen = new Set(prev.map((d) => d.id));
              const next = [...prev];
              for (const row of res.data) {
                if (!seen.has(row.id)) {
                  seen.add(row.id);
                  next.push(row);
                }
              }
              return next;
            });
            setSearchDocPage(res.page);
            setSearchDocTotal(res.total);
            setSearchDocHasMore(res.page < res.pageCount);
          }),
        );
      }
      if (searchFolderHasMore) {
        const nextPage = searchFolderPage + 1;
        tasks.push(
          (usePortalFolderApi
            ? fetchPortalLibraryBrowseFolders(apiBase, headersRef.current, customerId!, {
                page: nextPage,
                limit: LIBRARY_FOLDER_PAGE_SIZE,
                libraryKind: browseLibraryKind,
                scope: "all",
                searchText: searchQuery,
              })
            : fetchAdminLibraryBrowseFolders(apiBase, headersRef.current, {
                page: nextPage,
                limit: LIBRARY_FOLDER_PAGE_SIZE,
                libraryKind: browseLibraryKind,
                scope: "all",
                searchText: searchQuery,
                customerId,
              })
          ).then((res) => {
            setSearchFolderResults((prev) => {
              const seen = new Set(prev.map((f) => f.id));
              const next = [...prev];
              for (const row of res.data) {
                if (!seen.has(row.id)) {
                  seen.add(row.id);
                  next.push(row);
                }
              }
              return next;
            });
            setSearchFolderPage(res.page);
            setSearchFolderHasMore(res.page < res.pageCount);
          }),
        );
      }
      await Promise.all(tasks);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed");
    } finally {
      searchFetchLockRef.current = false;
      setSearchLoadingMore(false);
    }
  }, [
    apiBase,
    customerId,
    browseLibraryKind,
    searchQuery,
    assignedToMeOnly,
    searchDocHasMore,
    searchFolderHasMore,
    searchDocPage,
    searchFolderPage,
    usePortalFolderApi,
  ]);

  const openFolderFromSearch = useCallback(
    (folder: PortalLibraryFolderRow) => {
      setNav({
        step: "years",
        folder: { id: folder.id, section: folder.type, name: folder.name },
      });
      onClearSearch?.();
    },
    [onClearSearch],
  );

  const loadDrillPage = useCallback(
    async (page: number, append: boolean) => {
      if (drillFetchLockRef.current || nav.step === "folders") return;
      drillFetchLockRef.current = true;
      if (page === 1) {
        setDrillLoading(true);
        setDrillError("");
      } else {
        setDrillLoadingMore(true);
      }
      try {
        const level = drillLevelForNav(nav)!;
        const res = await fetchDrillBrowse(nav, page);
        const mapped = mapDrillRows(level, res.data);
        setDrillItems((prev) => (append ? [...prev, ...mapped] : mapped));
        setDrillPage(res.page);
        setDrillTotal(res.total);
        setDrillHasMore(res.page < res.pageCount);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load";
        if (!append) {
          setDrillItems([]);
          setDrillTotal(0);
        }
        setDrillError(msg);
        setDrillHasMore(false);
      } finally {
        drillFetchLockRef.current = false;
        setDrillLoading(false);
        setDrillLoadingMore(false);
      }
    },
    [nav, fetchDrillBrowse, mapDrillRows],
  );

  const loadDrillPageRef = useRef(loadDrillPage);
  loadDrillPageRef.current = loadDrillPage;

  const folderListName = useCallback((folder: PortalLibraryFolderRow) => cleanLibraryFolderName(folder.name), []);

  const folderListDetails = useCallback(
    (folder: PortalLibraryFolderRow) => folderScopeDetailsLabel(folder),
    [],
  );

  const drillSectionLabel = useMemo(() => {
    if (nav.step === "years") return "Years";
    if (nav.step === "months") return "Months";
    if (nav.step === "days") return "Dates";
    if (nav.step === "customers") return "Customers";
    return "Files";
  }, [nav.step]);

  const browseEntries = useMemo((): BrowseListEntry[] => {
    if (nav.step === "folders") {
      const out: BrowseListEntry[] = [];
      if (!compactListChrome) {
        out.push({
          kind: "section",
          id: "section:folders",
          label: `Folders${folderScopeCountLabel(folders.length, folderListTotal)}`,
        });
      }
      if (folders.length === 0 && !folderListLoading) {
        out.push({ kind: "empty", id: "empty:folders", message: "No folders found" });
      } else {
        for (const folder of folders) {
          out.push({
            kind: "folder",
            id: folder.id,
            folder,
            name: folderListName(folder),
            subtitle: folderListDetails(folder),
            isGlobal: Boolean(folder.isGlobal),
            isRestricted: Boolean(folder.isRestricted),
          });
        }
      }
      return out;
    }
    const out: BrowseListEntry[] = compactListChrome
      ? []
      : [
          {
            kind: "section",
            id: "section:drill",
            label: `${drillSectionLabel}${folderScopeCountLabel(drillItems.length, drillTotal)}`,
          },
        ];
    if (drillItems.length === 0 && !drillLoading) {
      out.push({ kind: "empty", id: "empty:drill", message: "Nothing in this folder for this step" });
    } else {
      for (const row of drillItems) {
        out.push(row);
      }
    }
    return out;
  }, [
    nav,
    folders,
    folderListTotal,
    folderListLoading,
    drillItems,
    drillTotal,
    drillLoading,
    drillSectionLabel,
    folderListName,
    folderListDetails,
    compactListChrome,
  ]);

  const searchEntries = useMemo((): SearchListEntry[] => {
    const out: SearchListEntry[] = [];
    out.push({
      kind: "section",
      id: "section:search-folders",
      label: `Folders${visibleSearchFolderResults.length > 0 ? ` (${visibleSearchFolderResults.length})` : ""}`,
    });
    for (const folder of visibleSearchFolderResults) {
      out.push({
        kind: "search-folder",
        id: folder.id,
        folder,
        name: folderListName(folder),
        subtitle: folderListDetails(folder),
      });
    }
    out.push({
      kind: "section",
      id: "section:search-files",
      label: `Files${folderScopeCountLabel(searchDocResults.length, searchDocTotal)}`,
    });
    for (const doc of searchDocResults) {
      out.push({
        kind: "search-file",
        id: doc.id,
        name: doc.name,
        subtitle: searchResultSubtitle(doc, showCustomerPrefix),
        doc,
      });
    }
    return out;
  }, [visibleSearchFolderResults, searchDocResults, searchDocTotal, showCustomerPrefix, folderListName, folderListDetails]);

  const selectableFileIds = useMemo(() => {
    if (!fileSelectionActive) return [] as string[];
    if (searchActive) {
      return searchEntries.filter((entry) => entry.kind === "search-file").map((entry) => entry.id);
    }
    return browseEntries.filter((entry) => entry.kind === "file").map((entry) => entry.id);
  }, [fileSelectionActive, searchActive, searchEntries, browseEntries]);

  const allVisibleFilesSelected =
    selectableFileIds.length > 0 && selectableFileIds.every((id) => selectedFileIds.has(id));
  const someVisibleFilesSelected = selectableFileIds.some((id) => selectedFileIds.has(id));

  useEffect(() => {
    setSelectedFileIds(new Set());
  }, [nav, searchActive, refreshKey]);

  useEffect(() => {
    if (!removedFolderId) return;
    setFolders((prev) => prev.filter((f) => f.id !== removedFolderId));
    setSearchFolderResults((prev) => prev.filter((f) => f.id !== removedFolderId));
    setNav((current) => {
      if (current.step !== "folders" && current.folder.id === removedFolderId) {
        return ROOT_NAV;
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
      if (nav.step === "files") return nav.customerId;
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
        // Keep folder browsing usable if a single download fails.
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
    const ctx = nav.step !== "folders" ? drillQueryContext(nav) : { folderId: "" };
    const scopedCustomerId =
      nav.step === "files" ? nav.customerId : customerId?.trim() || undefined;
    return {
      customerId: scopedCustomerId,
      viewMode: exportViewMode,
      libraryKind: browseLibraryKind,
      folderId: ctx.folderId || undefined,
      folderName: nav.step !== "folders" ? nav.folder.name : undefined,
      year: ctx.year,
      month: ctx.month,
      day: ctx.day,
      searchText: searchActive ? searchQuery : searchText.trim() || undefined,
      assignedOnly: assignedToMeOnly ? true : undefined,
      uploadedAfter: uploadedAfter?.trim() || undefined,
      uploadedBefore: uploadedBefore?.trim() || undefined,
    };
  }, [
    nav,
    customerId,
    browseLibraryKind,
    searchActive,
    searchQuery,
    searchText,
    assignedToMeOnly,
    uploadedAfter,
    uploadedBefore,
    exportViewMode,
  ]);

  const exportScopeLabel = useMemo(() => {
    if (searchActive) return `search "${searchQuery}"`;
    if (nav.step === "folders") {
      if (customerId) return customerName?.trim() || customerId;
      return "all folders";
    }
    if (nav.step === "files") return nav.customerName;
    if (nav.step === "customers") return dayLabel(nav.year, nav.month, nav.day);
    if (nav.step === "days") return `${monthLabel(nav.month)} ${nav.year}`;
    if (nav.step === "months") return String(nav.year);
    return cleanLibraryFolderName(nav.folder.name);
  }, [searchActive, searchQuery, nav, customerId, customerName]);

  const handleViewZipExport = useCallback(() => {
    void startLibraryZipExport(buildViewExportInput(), exportScopeLabel);
  }, [buildViewExportInput, exportScopeLabel, startLibraryZipExport]);

  const handleSelectedZipExport = useCallback(() => {
    const ids = [...selectedFileIds];
    if (ids.length === 0) return;
    const scopedCustomerId =
      nav.step === "files" ? nav.customerId : customerId?.trim() || undefined;
    void startLibraryZipExport(
      {
        customerId: scopedCustomerId,
        viewMode: exportViewMode,
        libraryKind: browseLibraryKind,
        documentIds: ids,
      },
      `${ids.length} selected file${ids.length === 1 ? "" : "s"}`,
    );
  }, [
    selectedFileIds,
    nav,
    customerId,
    exportViewMode,
    browseLibraryKind,
    startLibraryZipExport,
  ]);

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

  const breadcrumbs = useMemo(() => {
    type Crumb = { label: string; nav?: FolderNav; onNavigate?: () => void };
    const crumbs: Crumb[] = [
      ...(breadcrumbPrefix?.map((p) => ({ label: p.label, onNavigate: p.onNavigate })) ?? []),
      { label: rootBreadcrumbLabel, nav: ROOT_NAV },
    ];
    if (nav.step !== "folders") {
      crumbs.push({
        label: cleanLibraryFolderName(nav.folder.name),
        nav: { step: "years", folder: nav.folder },
      });
    }
    if (nav.step === "months" || nav.step === "days" || nav.step === "customers" || nav.step === "files") {
      crumbs.push({ label: String(nav.year), nav: { step: "months", folder: nav.folder, year: nav.year } });
    }
    if (nav.step === "days" || nav.step === "customers" || nav.step === "files") {
      crumbs.push({
        label: monthLabel(nav.month),
        nav: { step: "days", folder: nav.folder, year: nav.year, month: nav.month },
      });
    }
    if (nav.step === "customers" || nav.step === "files") {
      crumbs.push({
        label: dayLabel(nav.year, nav.month, nav.day),
        nav:
          singleCustomerScope && customerId
            ? {
                step: "files",
                folder: nav.folder,
                year: nav.year,
                month: nav.month,
                day: nav.day,
                customerId,
                customerName: customerName ?? "Customer",
              }
            : { step: "customers", folder: nav.folder, year: nav.year, month: nav.month, day: nav.day },
      });
    }
    if (nav.step === "files" && !singleCustomerScope) {
      crumbs.push({
        label: nav.customerName,
        nav: {
          step: "files",
          folder: nav.folder,
          year: nav.year,
          month: nav.month,
          day: nav.day,
          customerId: nav.customerId,
          customerName: nav.customerName,
        },
      });
    }
    return crumbs;
  }, [nav, breadcrumbPrefix, rootBreadcrumbLabel, singleCustomerScope, customerId, customerName]);

  useEffect(() => {
    if (searchActive) {
      setNav(ROOT_NAV);
      setSearchDocResults([]);
      setSearchDocPage(0);
      setSearchDocTotal(0);
      setSearchDocHasMore(false);
      setSearchFolderResults([]);
      setSearchFolderPage(0);
      setSearchFolderHasMore(false);
      setSearchError("");
      void loadSearchInitial();
      return;
    }
    setSearchDocResults([]);
    setSearchFolderResults([]);
    setSearchError("");
  }, [searchActive, searchQuery, customerId, libraryKind, assignedToMeOnly, refreshKey, loadSearchInitial]);

  useEffect(() => {
    setNav(ROOT_NAV);
    setFolders([]);
    setFolderListPage(0);
    setFolderListTotal(0);
    setFolderListHasMore(false);
    setFolderListError("");
    setDrillItems([]);
    setDrillPage(0);
    setDrillTotal(0);
    setDrillHasMore(false);
    setDrillError("");
  }, [customerId, libraryKind]);

  useEffect(() => {
    if (searchActive) return;
    if (nav.step !== "folders") return;
    void loadFolderListPageRef.current(1, false);
  }, [searchActive, customerId, libraryKind, refreshKey, nav.step]);

  useEffect(() => {
    const root = folderScrollRef.current;
    const sentinel = foldersSentinelRef.current;
    if (searchActive || nav.step !== "folders" || !root || !sentinel || !folderListHasMore || folderListLoading || folderListLoadingMore) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadFolderListPageRef.current(folderListPage + 1, true);
      },
      { root, rootMargin: "120px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [searchActive, nav.step, folderListHasMore, folderListLoading, folderListLoadingMore, folderListPage, folders.length]);

  const drillNavKeyValue = drillNavKey(nav);

  useEffect(() => {
    if (searchActive || nav.step === "folders") return;
    setDrillItems([]);
    setDrillPage(0);
    setDrillTotal(0);
    setDrillHasMore(false);
    setDrillError("");
    void loadDrillPageRef.current(1, false);
  }, [searchActive, drillNavKeyValue, refreshKey, assignedToMeOnly, libraryKind]);

  useEffect(() => {
    const root = folderScrollRef.current;
    const sentinel = drillSentinelRef.current;
    if (
      searchActive ||
      nav.step === "folders" ||
      !root ||
      !sentinel ||
      !drillHasMore ||
      drillLoading ||
      drillLoadingMore
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadDrillPageRef.current(drillPage + 1, true);
      },
      { root, rootMargin: "120px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    searchActive,
    nav.step,
    drillHasMore,
    drillLoading,
    drillLoadingMore,
    drillPage,
    drillItems.length,
    drillNavKeyValue,
  ]);

  useEffect(() => {
    if (!searchActive || searchLoading || searchLoadingMore || !searchFolderHasMore || visibleSearchFolderResults.length > 0) {
      return;
    }
    void loadSearchMore();
  }, [searchActive, searchLoading, searchLoadingMore, searchFolderHasMore, visibleSearchFolderResults.length, loadSearchMore]);

  useEffect(() => {
    const root = searchScrollRef.current;
    const sentinel = searchSentinelRef.current;
    if (!searchActive || !root || !sentinel || !searchHasMore || searchLoading || searchLoadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadSearchMore();
      },
      { root, rootMargin: "120px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [searchActive, searchHasMore, searchLoading, searchLoadingMore, loadSearchMore, searchMatchLoaded]);

  const onBrowseEntryClick = (entry: BrowseListEntry) => {
    if (entry.kind === "section" || entry.kind === "empty") return;
    if (entry.kind === "folder") {
      setNav({
        step: "years",
        folder: { id: entry.folder.id, section: entry.folder.type, name: entry.folder.name },
      });
      return;
    }
    if (entry.kind === "year" && nav.step === "years") {
      setNav({ step: "months", folder: nav.folder, year: entry.year });
      return;
    }
    if (entry.kind === "month" && nav.step === "months") {
      setNav({ step: "days", folder: nav.folder, year: nav.year, month: entry.month });
      return;
    }
    if (entry.kind === "day" && nav.step === "days") {
      if (singleCustomerScope && customerId) {
        setNav({
          step: "files",
          folder: nav.folder,
          year: nav.year,
          month: nav.month,
          day: entry.day,
          customerId,
          customerName: customerName ?? "Customer",
        });
      } else {
        setNav({
          step: "customers",
          folder: nav.folder,
          year: nav.year,
          month: nav.month,
          day: entry.day,
        });
      }
      return;
    }
    if (entry.kind === "customer" && nav.step === "customers") {
      setNav({
        step: "files",
        folder: nav.folder,
        year: nav.year,
        month: nav.month,
        day: nav.day,
        customerId: entry.customerId,
        customerName: entry.name,
      });
      return;
    }
    if (entry.kind === "file") {
      onOpenDocument(entry.id);
    }
  };

  const onSearchEntryClick = (entry: SearchListEntry) => {
    if (entry.kind === "section") return;
    if (entry.kind === "search-folder") {
      openFolderFromSearch(entry.folder);
      return;
    }
    if (entry.kind === "search-file") {
      onOpenDocument(entry.id);
    }
  };

  const entryIcon = (
    kind: BrowseListEntry["kind"] | SearchListEntry["kind"],
    folderStyle?: { isGlobal?: boolean; isRestricted?: boolean },
  ) => {
    if (kind === "file" || kind === "search-file") {
      return <InsertDriveFileOutlined sx={{ color: "info.main", fontSize: 22 }} />;
    }
    if (kind === "customer") {
      return <PersonOutlined sx={{ color: "primary.main", fontSize: 22 }} />;
    }
    if (kind === "year" || kind === "month" || kind === "day") {
      return <CalendarTodayOutlined sx={{ color: "primary.main", fontSize: 22 }} />;
    }
    return (
      <FolderOutlined sx={{ color: folderScopeIconColor(folderStyle ?? {}), fontSize: 22 }} />
    );
  };

  const browseRowMeta = (entry: BrowseListEntry) => {
    if (entry.kind === "folder") {
      return {
        name: entry.name,
        subtitle: entry.subtitle,
        dateLabel: "",
        isGlobal: entry.isGlobal,
        isRestricted: entry.isRestricted,
        clickable: true,
        isFile: false,
      };
    }
    if (entry.kind === "section" || entry.kind === "empty") {
      return { name: "", subtitle: "", dateLabel: "", isGlobal: false, isRestricted: false, clickable: false, isFile: false };
    }
    const display = drillEntryDisplay(entry, nav);
    return {
      name: display.name,
      subtitle: display.subtitle,
      dateLabel: display.dateLabel,
      isGlobal: false,
      isRestricted: false,
      clickable: entry.kind !== "file",
      isFile: entry.kind === "file",
    };
  };

  const renderDriveHeader = (title?: string) => (
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
            {searchMatchLoaded > 0 ? (
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }}>
                ({visibleSearchFolderResults.length} folders, {searchDocResults.length} files
                {searchDocTotal > searchDocResults.length ? ` of ${searchDocTotal} files` : ""})
              </Typography>
            ) : null}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Matching &ldquo;{searchQuery}&rdquo; in folders and files
          </Typography>
        </Box>
      ) : (
        <Breadcrumbs separator={<NavigateNext fontSize="small" />} sx={{ flex: 1, minWidth: 0 }}>
          {breadcrumbs.map((crumb, i) => {
            const isLast = i === breadcrumbs.length - 1;
            if (isLast) {
              return (
                <Typography key={crumb.label} variant="body2" color="text.primary" sx={{ fontWeight: 600 }} noWrap>
                  {title ?? crumb.label}
                </Typography>
              );
            }
            const onClick = crumb.onNavigate ?? (crumb.nav ? () => setNav(crumb.nav!) : undefined);
            if (!onClick) {
              return (
                <Typography key={`${crumb.label}-${i}`} variant="body2" color="text.secondary" noWrap>
                  {crumb.label}
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
                onClick={onClick}
                sx={{ maxWidth: 200 }}
                noWrap
              >
                {crumb.label}
              </Link>
            );
          })}
        </Breadcrumbs>
      )}
      {compactListChrome && nav.step === "folders" && !searchActive ? (
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, fontWeight: 600 }}>
          {folders.length}
          {folderListTotal > folders.length ? ` / ${folderListTotal}` : ""} folders
        </Typography>
      ) : null}
      {!hideLayoutToggle ? (
        <ToggleButtonGroup
          size="small"
          exclusive
          value={layout}
          onChange={(_, v: DriveLayout | null) => {
            if (v) setLayout(v);
          }}
          aria-label="Folder item layout"
        >
          <ToggleButton value="list" aria-label="Row layout">
            <Tooltip title="Rows">
              <ViewListOutlined fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="grid" aria-label="Tile layout">
            <Tooltip title="Tiles">
              <GridViewOutlined fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
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
  );

  const showBrowseFileCheckboxes = fileSelectionActive && nav.step === "files";
  const showSearchFileCheckboxes = fileSelectionActive && searchActive;
  const showAssignColumn = canAssignDocuments && Boolean(onAssignDocument);
  const browseListColSpan = (showAssignColumn ? 4 : 3) + (showBrowseFileCheckboxes ? 1 : 0);
  const searchListColSpan = (showAssignColumn ? 4 : 3) + (showSearchFileCheckboxes ? 1 : 0);

  const renderAssignCell = (
    documentId: string,
    fileName: string,
    isFile: boolean,
    doc?: AdminLibraryDocumentRow,
  ) => {
    if (!isFile || !showAssignColumn || !onAssignDocument) return null;
    const scopeCustomerId = resolveDocCustomerId(doc) || undefined;
    return (
      <Button
        size="small"
        variant="outlined"
        onClick={(e) => {
          e.stopPropagation();
          onAssignDocument(documentId, fileName, scopeCustomerId);
        }}
      >
        Assign
      </Button>
    );
  };

  const renderBrowseList = () => (
    <TableContainer>
      <Table size="small" aria-label="Library folders">
        <TableHead>
          <TableRow sx={{ bgcolor: "background.default" }}>
            {showBrowseFileCheckboxes ? (
              <TableCell padding="checkbox">
                <Checkbox
                  size="small"
                  checked={allVisibleFilesSelected}
                  indeterminate={someVisibleFilesSelected && !allVisibleFilesSelected}
                  onChange={(e) => toggleAllVisibleFiles(e.target.checked)}
                  aria-label="Select all files"
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
            {showAssignColumn ? (
              <TableCell
                align="center"
                sx={{
                  fontWeight: 700,
                  fontSize: "0.7rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  width: 100,
                }}
              >
                Assign
              </TableCell>
            ) : null}
            <TableCell align="right" sx={{ width: actionsColumnWidth, minWidth: actionsColumnWidth, whiteSpace: "nowrap" }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {browseEntries.map((entry) => {
            if (entry.kind === "section") {
              return (
                <TableRow key={entry.id} sx={{ bgcolor: "action.hover" }}>
                  <TableCell colSpan={browseListColSpan}>
                    <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      {entry.label}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            }
            if (entry.kind === "empty") {
              return (
                <TableRow key={entry.id}>
                  <TableCell colSpan={browseListColSpan}>
                    <Typography variant="body2" color="text.secondary" sx={{ py: 0.5 }}>
                      {entry.message}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            }
            const meta = browseRowMeta(entry);
            return (
              <TableRow
                key={entry.id}
                hover
                onClick={() => onBrowseEntryClick(entry)}
                sx={{ cursor: meta.clickable ? "pointer" : "default", "&:last-child td": { borderBottom: 0 } }}
              >
                {showBrowseFileCheckboxes && meta.isFile ? (
                  <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      size="small"
                      checked={selectedFileIds.has(entry.id)}
                      onChange={(e) => toggleFileSelection(entry.id, e.target.checked)}
                      aria-label={`Select ${meta.name}`}
                    />
                  </TableCell>
                ) : showBrowseFileCheckboxes ? (
                  <TableCell padding="checkbox" />
                ) : null}
                <TableCell>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                    {entryIcon(
                      entry.kind,
                      entry.kind === "folder"
                        ? { isGlobal: entry.isGlobal, isRestricted: entry.isRestricted }
                        : undefined,
                    )}
                    <Typography
                      variant="body2"
                      noWrap
                      title={meta.name}
                      sx={{ fontWeight: 500, color: folderScopeNameColor(entry.kind === "folder" ? entry : {}) }}
                    >
                      {meta.name}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                  <Typography
                    variant="caption"
                    noWrap
                    color={meta.isRestricted ? "secondary.main" : "text.secondary"}
                  >
                    {meta.subtitle}
                  </Typography>
                </TableCell>
                {showAssignColumn ? (
                  <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    {renderAssignCell(entry.id, meta.name, meta.isFile, entry.kind === "file" ? entry.doc : undefined)}
                  </TableCell>
                ) : null}
                <TableCell
                  align="right"
                  sx={{ width: actionsColumnWidth, minWidth: actionsColumnWidth, whiteSpace: "nowrap" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {entry.kind === "file"
                    ? renderFileActions(entry.id, meta.name, entry.doc)
                    : entry.kind === "folder" && canDelete && onDeleteFolder ? (
                        <IconButton
                          size="small"
                          color="error"
                          aria-label="Delete folder"
                          disabled={deletingFolderId === entry.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFolder(entry.folder.id, entry.name);
                          }}
                        >
                          <DeleteOutlined fontSize="small" />
                        </IconButton>
                      ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderSearchList = () => (
    <TableContainer>
      <Table size="small" aria-label="Search results">
        <TableHead>
          <TableRow sx={{ bgcolor: "background.default" }}>
            {showSearchFileCheckboxes ? (
              <TableCell padding="checkbox">
                <Checkbox
                  size="small"
                  checked={allVisibleFilesSelected}
                  indeterminate={someVisibleFilesSelected && !allVisibleFilesSelected}
                  onChange={(e) => toggleAllVisibleFiles(e.target.checked)}
                  aria-label="Select all files"
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
            {showAssignColumn ? (
              <TableCell
                align="center"
                sx={{
                  fontWeight: 700,
                  fontSize: "0.7rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  width: 100,
                }}
              >
                Assign
              </TableCell>
            ) : null}
            <TableCell align="right" sx={{ width: actionsColumnWidth, minWidth: actionsColumnWidth, whiteSpace: "nowrap" }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {searchEntries.map((entry) => {
            if (entry.kind === "section") {
              return (
                <TableRow key={entry.id} sx={{ bgcolor: "action.hover" }}>
                  <TableCell colSpan={searchListColSpan}>
                    <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      {entry.label}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            }
            const isFile = entry.kind === "search-file";
            return (
              <TableRow
                key={entry.id}
                hover
                onClick={() => onSearchEntryClick(entry)}
                sx={{ cursor: "pointer", "&:last-child td": { borderBottom: 0 } }}
              >
                {showSearchFileCheckboxes && isFile ? (
                  <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      size="small"
                      checked={selectedFileIds.has(entry.id)}
                      onChange={(e) => toggleFileSelection(entry.id, e.target.checked)}
                      aria-label={`Select ${entry.name}`}
                    />
                  </TableCell>
                ) : showSearchFileCheckboxes ? (
                  <TableCell padding="checkbox" />
                ) : null}
                <TableCell>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                    {entryIcon(
                      entry.kind,
                      entry.kind === "search-folder"
                        ? { isGlobal: entry.folder.isGlobal, isRestricted: entry.folder.isRestricted }
                        : undefined,
                    )}
                    <Typography
                      variant="body2"
                      noWrap
                      title={entry.name}
                      sx={{
                        fontWeight: 500,
                        color: folderScopeNameColor(entry.kind === "search-folder" ? entry.folder : {}),
                      }}
                    >
                      {entry.name}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell sx={{ display: { xs: "none", sm: "table-cell" } }}>
                  <Typography
                    variant="caption"
                    noWrap
                    color={
                      entry.kind === "search-folder" && entry.folder.isRestricted
                        ? "secondary.main"
                        : "text.secondary"
                    }
                  >
                    {entry.subtitle}
                  </Typography>
                </TableCell>
                {showAssignColumn ? (
                  <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    {renderAssignCell(
                      entry.id,
                      entry.name,
                      isFile,
                      entry.kind === "search-file" ? entry.doc : undefined,
                    )}
                  </TableCell>
                ) : null}
                <TableCell
                  align="right"
                  sx={{ width: actionsColumnWidth, minWidth: actionsColumnWidth, whiteSpace: "nowrap" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {isFile
                    ? renderFileActions(entry.id, entry.name, entry.doc)
                    : entry.kind === "search-folder" && canDelete && onDeleteFolder ? (
                        <IconButton
                          size="small"
                          color="error"
                          aria-label="Delete folder"
                          disabled={deletingFolderId === entry.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFolder(entry.folder.id, entry.name);
                          }}
                        >
                          <DeleteOutlined fontSize="small" />
                        </IconButton>
                      ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const renderBrowseGrid = () => (
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
          gap: 1.5,
        }}
      >
        {browseEntries.map((entry) => {
          if (entry.kind === "section") {
            return (
              <Typography
                key={entry.id}
                variant="caption"
                sx={{
                  gridColumn: "1 / -1",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  mt: entry.id === "section:drill" ? 1 : 0,
                }}
              >
                {entry.label}
              </Typography>
            );
          }
          if (entry.kind === "empty") {
            return (
              <Typography key={entry.id} variant="body2" color="text.secondary" sx={{ gridColumn: "1 / -1" }}>
                {entry.message}
              </Typography>
            );
          }
          const meta = browseRowMeta(entry);
          return (
            <Paper
              key={entry.id}
              variant="outlined"
              onClick={() => onBrowseEntryClick(entry)}
              sx={[
                {
                  position: "relative",
                  p: 2,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 1,
                  cursor: "pointer",
                  textAlign: "center",
                  "&:hover": { borderColor: "primary.main", boxShadow: 1 },
                },
                entry.kind === "folder" && entry.isRestricted
                  ? (theme) => ({
                      borderColor: theme.palette.secondary.main,
                      bgcolor: alpha(theme.palette.secondary.main, 0.08),
                    })
                  : {},
              ]}
            >
              {entry.kind === "file" ? (
                <Box sx={{ position: "absolute", right: 4, top: 4, display: "flex", gap: 0.25 }}>
                  {canDelete && onDeleteDocuments ? (
                    <IconButton
                      size="small"
                      color="error"
                      aria-label="Delete document"
                      disabled={deletingDocumentIds?.has(entry.id) ?? false}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteDocuments([entry.id]);
                      }}
                    >
                      <DeleteOutlined fontSize="small" />
                    </IconButton>
                  ) : null}
                  <Tooltip title="Download">
                    <span>
                      <IconButton
                        size="small"
                        color="primary"
                        aria-label="Download file"
                        disabled={downloadingDocumentIds.has(entry.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDownloadDocument(entry.id, meta.name, entry.doc);
                        }}
                      >
                        {downloadingDocumentIds.has(entry.id) ? (
                          <CircularProgress size={16} />
                        ) : (
                          <DownloadOutlined fontSize="small" />
                        )}
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              ) : canDelete && entry.kind === "folder" && onDeleteFolder ? (
                <IconButton
                  size="small"
                  color="error"
                  aria-label="Delete folder"
                  disabled={deletingFolderId === entry.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFolder(entry.folder.id, entry.name);
                  }}
                  sx={{ position: "absolute", right: 4, top: 4 }}
                >
                  <DeleteOutlined fontSize="small" />
                </IconButton>
              ) : null}
              <Box sx={{ fontSize: 40, lineHeight: 1 }}>
                {entryIcon(
                  entry.kind,
                  entry.kind === "folder"
                    ? { isGlobal: entry.isGlobal, isRestricted: entry.isRestricted }
                    : undefined,
                )}
              </Box>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  width: "100%",
                  color: folderScopeNameColor(entry.kind === "folder" ? entry : {}),
                }}
                noWrap
                title={meta.name}
              >
                {meta.name}
              </Typography>
              <Typography
                variant="caption"
                noWrap
                sx={{ width: "100%" }}
                color={meta.isRestricted ? "secondary.main" : "text.secondary"}
              >
                {meta.isFile ? meta.dateLabel : meta.subtitle}
              </Typography>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );

  const renderSearchGrid = () => (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))",
        gap: 1.5,
        p: 2,
      }}
    >
      {searchEntries
        .filter((e) => e.kind !== "section")
        .map((entry) => (
          <Paper
            key={entry.id}
            variant="outlined"
            onClick={() => onSearchEntryClick(entry)}
            sx={[
              {
                position: "relative",
                p: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 1,
                cursor: "pointer",
                textAlign: "center",
                "&:hover": { borderColor: "primary.main", boxShadow: 1 },
              },
              entry.kind === "search-folder" && entry.folder.isRestricted
                ? (theme) => ({
                    borderColor: theme.palette.secondary.main,
                    bgcolor: alpha(theme.palette.secondary.main, 0.08),
                  })
                : {},
            ]}
          >
            {entry.kind === "search-file" ? (
              <Box sx={{ position: "absolute", right: 4, top: 4, display: "flex", gap: 0.25 }}>
                {canDelete && onDeleteDocuments ? (
                  <IconButton
                    size="small"
                    color="error"
                    aria-label="Delete document"
                    disabled={deletingDocumentIds?.has(entry.id) ?? false}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteDocuments([entry.id]);
                    }}
                  >
                    <DeleteOutlined fontSize="small" />
                  </IconButton>
                ) : null}
                <Tooltip title="Download">
                  <span>
                    <IconButton
                      size="small"
                      color="primary"
                      aria-label="Download file"
                      disabled={downloadingDocumentIds.has(entry.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleDownloadDocument(entry.id, entry.name, entry.doc);
                      }}
                    >
                      {downloadingDocumentIds.has(entry.id) ? (
                        <CircularProgress size={16} />
                      ) : (
                        <DownloadOutlined fontSize="small" />
                      )}
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            ) : canDelete && entry.kind === "search-folder" && onDeleteFolder ? (
              <IconButton
                size="small"
                color="error"
                aria-label="Delete folder"
                disabled={deletingFolderId === entry.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteFolder(entry.folder.id, entry.name);
                }}
                sx={{ position: "absolute", right: 4, top: 4 }}
              >
                <DeleteOutlined fontSize="small" />
              </IconButton>
            ) : null}
            <Box sx={{ fontSize: 40, lineHeight: 1 }}>
              {entryIcon(
                entry.kind,
                entry.kind === "search-folder"
                  ? { isGlobal: entry.folder.isGlobal, isRestricted: entry.folder.isRestricted }
                  : undefined,
              )}
            </Box>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                width: "100%",
                color: folderScopeNameColor(entry.kind === "search-folder" ? entry.folder : {}),
              }}
              noWrap
              title={entry.name}
            >
              {entry.name}
            </Typography>
            <Typography
              variant="caption"
              noWrap
              sx={{ width: "100%" }}
              color={entry.kind === "search-folder" && entry.folder.isRestricted ? "secondary.main" : "text.secondary"}
            >
              {entry.subtitle}
            </Typography>
          </Paper>
        ))}
    </Box>
  );

  const browseEmptyMessage =
    nav.step === "folders" ? "No folders found." : "Nothing in this folder for this step.";

  const browseContentLoading =
    (nav.step === "folders" && foldersInitialLoading) ||
    (nav.step !== "folders" && drillLoading && drillItems.length === 0);

  const browseContentError = nav.step !== "folders" ? drillError : "";

  const browseHasRows = browseEntries.some(
    (e) =>
      e.kind === "folder" ||
      e.kind === "year" ||
      e.kind === "month" ||
      e.kind === "day" ||
      e.kind === "customer" ||
      e.kind === "file",
  );

  const showBrowseEmpty =
    !browseContentLoading && !browseContentError && !(nav.step === "folders" && folderListError) && !browseHasRows;

  const drivePanel = (
    <>
      {renderDriveHeader()}
      <Box
        ref={searchActive ? searchScrollRef : folderScrollRef}
        className="scroll-subtle"
        sx={{ maxHeight: 640, overflowY: "auto" }}
      >
        {searchActive ? (
          searchLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress size={24} />
            </Box>
          ) : searchError ? (
            <Typography variant="body2" color="error" sx={{ px: 3, py: 6, textAlign: "center" }}>
              {searchError}
            </Typography>
          ) : searchMatchLoaded === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 6, textAlign: "center" }}>
              No folders or files match your search
            </Typography>
          ) : layout === "list" ? (
            renderSearchList()
          ) : (
            renderSearchGrid()
          )
        ) : browseContentLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={24} />
          </Box>
        ) : folderListError && nav.step === "folders" ? (
          <Typography variant="body2" color="error" sx={{ px: 3, py: 4 }}>
            {folderListError}
          </Typography>
        ) : browseContentError ? (
          <Typography variant="body2" color="error" sx={{ px: 3, py: 4 }}>
            {browseContentError}
          </Typography>
        ) : showBrowseEmpty ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 6, textAlign: "center" }}>
            {browseEmptyMessage}
          </Typography>
        ) : layout === "list" ? (
          renderBrowseList()
        ) : (
          renderBrowseGrid()
        )}

        {!searchActive && nav.step === "folders" ? (
          <>
            {folderListLoadingMore ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 1.5 }}>
                <CircularProgress size={18} />
              </Box>
            ) : null}
            <Box ref={foldersSentinelRef} sx={{ height: 1 }} />
          </>
        ) : null}

        {!searchActive && nav.step !== "folders" ? (
          <>
            {drillLoadingMore ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 1.5 }}>
                <CircularProgress size={18} />
              </Box>
            ) : null}
            <Box ref={drillSentinelRef} sx={{ height: 1 }} />
          </>
        ) : null}

        {searchActive && searchLoadingMore ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 1.5 }}>
            <CircularProgress size={18} />
          </Box>
        ) : null}
        {searchActive ? <Box ref={searchSentinelRef} sx={{ height: 1 }} /> : null}
      </Box>
    </>
  );

  return (
    <>
      {embedded ? (
        drivePanel
      ) : (
        <Paper variant="outlined" sx={{ overflow: "hidden", bgcolor: "background.paper" }}>
          {toolbarPrefix ? (
            <Box
              sx={{
                px: 2,
                py: 1.25,
                borderBottom: "1px solid",
                borderColor: "divider",
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1.5,
                bgcolor: "background.default",
              }}
            >
              {toolbarPrefix}
            </Box>
          ) : null}
          {drivePanel}
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
