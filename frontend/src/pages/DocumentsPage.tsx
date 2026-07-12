import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Snackbar,
  Tooltip,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import {
  DataGrid,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarDensitySelector,
  GridToolbarExport,
  GridToolbarFilterButton,
  type GridColDef,
  type GridPaginationModel,
  type GridRowSelectionModel,
  type GridSortModel,
} from "@mui/x-data-grid";
import {
  deleteLibraryDocuments,
  deleteLibraryFolder,
  fetchCustomers,
  fetchDocumentAssigneeCandidates,
  fetchDocumentAssignees,
  fetchDocumentContentBlob,
  fetchDocumentsList,
  fetchDocumentsFileAccessLatest,
  fetchLibraryCustomerFilterOptions,
  fetchLibraryDocument,
  replaceDocumentAssignees,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { canDeleteDriveFiles, shouldShowStaffAssigneeFilter, staffSeesAssignedFilesOnly } from "../utils/canDeleteDriveFiles";
import { triggerBrowserDownload } from "../utils/onboardingExportFilename";
import { formatDateTime } from "../utils/formatDate";
import { useLibraryZipExport } from "../hooks/useLibraryZipExport";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { LazyCustomerFolderExplorer } from "../components/LazyCustomerFolderExplorer";
import { LazyLibraryDateExplorer } from "../components/LazyLibraryDateExplorer";
import { LazyLibraryFolderExplorer } from "../components/LazyLibraryFolderExplorer";
import { UploadDialog } from "../components/UploadDialog";
import { SearchableCustomerSelect } from "../components/SearchableCustomerSelect";
import { FilesViewSwitcher, type FilesViewMode } from "../components/admin/FilesViewSwitcher";
import { PageActions } from "../components/admin/PageActions";
import { PageLayout } from "../components/admin/PageLayout";
import type {
  AdminLibraryDocumentRow,
  Customer,
  DocumentAssigneeCandidate,
  DocumentAssigneeRow,
  FileDocumentAccessSummary,
  PortalLibrarySection,
  PortalLibraryTreeResponse,
} from "../types/api";

type FilesGroupBy = "folderView" | "customerView" | "dateView";

const FILES_GROUP_BY_OPTIONS: { value: FilesGroupBy; label: string }[] = [
  { value: "folderView", label: "Folder view" },
  { value: "customerView", label: "Customer view" },
  { value: "dateView", label: "Date view" },
];

const GRID_SX = {
  border: "none",
  "& .MuiDataGrid-columnHeader": {
    bgcolor: "background.default",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "text.secondary",
  },
  "& .MuiDataGrid-cell": { fontSize: "0.875rem" },
  "& .MuiDataGrid-row": { cursor: "pointer" },
  "& .MuiDataGrid-row:hover": { bgcolor: "action.hover" },
  "& .MuiDataGrid-footerContainer": { borderTop: "1px solid", borderColor: "divider" },
} as const;

const PORTAL_PAGE: Record<PortalLibrarySection, { title: string; subtitle: string }> = {
  files: {
    title: "Files",
    subtitle: "Your files library.",
  },
  invoices: {
    title: "Invoices",
    subtitle: "Invoice documents for your account.",
  },
  statements: {
    title: "Statements",
    subtitle: "Statement documents for your account.",
  },
};

function nowLabel() {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function libraryLabel(kind: PortalLibrarySection | undefined | null): string {
  if (!kind) return "—";
  if (kind === "invoices") return "Invoices";
  if (kind === "statements") return "Statements";
  return "Files";
}

function formatFileAccessActor(
  actor: { displayName: string | null; actorKind: string; at: string } | null | undefined,
): { label: string; tooltip: string | null } {
  if (!actor) {
    return { label: "—", tooltip: null };
  }
  let label = actor.displayName?.trim() || "";
  if (!label) {
    if (actor.actorKind === "staff") label = "Staff";
    else if (actor.actorKind === "portal") label = "Portal user";
    else if (actor.actorKind === "system") label = "System";
  }
  const when = actor.at ? new Date(actor.at) : null;
  const tooltip =
    when && !Number.isNaN(when.getTime()) ? formatDateTime(when.toISOString()) : null;
  if (!label) {
    return { label: "—", tooltip: null };
  }
  return { label, tooltip };
}

function normalizeFileAccess(
  raw: AdminLibraryDocumentRow,
): FileDocumentAccessSummary | undefined {
  const fa =
    raw.fileAccess ??
    ((raw as Record<string, unknown>).file_access as FileDocumentAccessSummary | undefined);
  if (!fa || typeof fa !== "object") return undefined;

  const pickActor = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    const actor = value as Record<string, unknown>;
    return {
      displayName: (actor.displayName ?? actor.display_name ?? null) as string | null,
      actorKind: String(actor.actorKind ?? actor.actor_kind ?? "system"),
      at: String(actor.at ?? actor.created_at ?? ""),
    };
  };

  return {
    uploadedBy: pickActor(fa.uploadedBy ?? (fa as Record<string, unknown>).uploaded_by),
    lastViewedBy: pickActor(fa.lastViewedBy ?? (fa as Record<string, unknown>).last_viewed_by),
    lastDownloadedBy: pickActor(
      fa.lastDownloadedBy ?? (fa as Record<string, unknown>).last_downloaded_by,
    ),
  };
}

function docToGridRow(d: AdminLibraryDocumentRow): DocGridRow {
  const folderName = d.folder?.name?.trim() || "—";
  const rowCustomerId = d.customer?.id ?? d.folder?.customerId ?? d.customerId ?? undefined;
  const fileAccess = normalizeFileAccess(d);
  const viewed = formatFileAccessActor(fileAccess?.lastViewedBy);
  const downloaded = formatFileAccessActor(fileAccess?.lastDownloadedBy);
  return {
    id: d.id,
    fileName: d.name,
    customer: d.customer?.name ?? d.folder?.customer?.name ?? rowCustomerId ?? d.folder?.customerId ?? "—",
    customerId: rowCustomerId,
    folderName,
    library: libraryLabel(d.folder?.type ?? null),
    documentType: d.documentType,
    uploadedAt: d.uploadedAt ?? d.createdAt ?? null,
    lastViewedBy: viewed.label,
    lastViewedByTooltip: viewed.tooltip,
    lastDownloadedBy: downloaded.label,
    lastDownloadedByTooltip: downloaded.tooltip,
  };
}

type DocGridRow = {
  id: string;
  fileName: string;
  customer: string;
  customerId?: string;
  folderName: string;
  library: string;
  documentType?: string;
  uploadedAt: string | null;
  lastViewedBy: string;
  lastViewedByTooltip: string | null;
  lastDownloadedBy: string;
  lastDownloadedByTooltip: string | null;
};

function sortModelToApiSort(model: GridSortModel): string {
  const first = model[0];
  if (!first?.sort) return "name,ASC";
  const dir = first.sort === "asc" ? "ASC" : "DESC";
  const field = first.field;
  if (field === "fileName" || field === "name") return `name,${dir}`;
  if (field === "customer") return `customer.name,${dir}`;
  if (field === "folderName") return `folder.name,${dir}`;
  if (field === "library") return `type,${dir}`;
  if (field === "uploadedAt") return `uploadedAt,${dir}`;
  return "name,ASC";
}

/** MUI X v9 uses `{ type, ids }`; "select all" emits `exclude` with an empty set. */
function gridSelectionModelToRowIds(model: GridRowSelectionModel, visibleRowIds: readonly string[]): string[] {
  if (Array.isArray(model)) {
    return model.map(String);
  }
  if (model.type === "exclude") {
    const excluded = new Set([...model.ids].map(String));
    return visibleRowIds.filter((id) => !excluded.has(id));
  }
  const visible = new Set(visibleRowIds);
  return [...model.ids].map(String).filter((id) => visible.has(id));
}

type LiveToolbarProps = {
  lastRefresh: string;
};

function LiveToolbar({ lastRefresh }: LiveToolbarProps) {
  return (
    <GridToolbarContainer
      sx={{
        px: 2,
        py: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
        display: "flex",
        alignItems: "center",
        gap: 1,
        flexWrap: "wrap",
        minHeight: 44,
      }}
    >
      <Chip
        label={`Updated ${lastRefresh}`}
        size="small"
        variant="outlined"
        sx={{ fontWeight: 600, fontSize: "0.7rem", height: 22 }}
      />
      <Box sx={{ ml: "auto", display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center" }}>
        <GridToolbarColumnsButton />
        <GridToolbarFilterButton />
        <GridToolbarDensitySelector />
        <GridToolbarExport />
      </Box>
    </GridToolbarContainer>
  );
}

type ListSelectionBarProps = {
  selectedCount: number;
  pageCount: number;
  totalCount: number;
  deleting: boolean;
  exporting: boolean;
  onDelete: () => void;
  onDownloadZip: () => void;
  onClear: () => void;
};

function ListSelectionBar({
  selectedCount,
  pageCount,
  totalCount,
  deleting,
  exporting,
  onDelete,
  onDownloadZip,
  onClear,
}: ListSelectionBarProps) {
  const allOnPage = pageCount > 0 && selectedCount === pageCount;
  const label =
    allOnPage && totalCount > pageCount
      ? `${selectedCount} on this page selected`
      : `${selectedCount} selected`;

  return (
    <Box
      sx={{
        px: 2,
        py: 1,
        minHeight: 44,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "action.selected",
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        flexWrap: "wrap",
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      {allOnPage && totalCount > pageCount ? (
        <Typography variant="caption" color="text.secondary">
          ({totalCount.toLocaleString()} documents match current filters)
        </Typography>
      ) : null}
      <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1 }}>
        <Button size="small" variant="text" onClick={onClear} disabled={deleting || exporting} sx={{ fontWeight: 600 }}>
          Clear
        </Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={exporting ? undefined : <DownloadOutlined fontSize="small" />}
          disabled={deleting || exporting}
          onClick={onDownloadZip}
          sx={{ fontWeight: 600 }}
        >
          {exporting ? "Starting ZIP…" : "Download ZIP"}
        </Button>
        <Button
          size="small"
          color="error"
          variant="contained"
          disableElevation
          startIcon={<DeleteOutlined fontSize="small" />}
          disabled={deleting || exporting}
          onClick={onDelete}
          sx={{ fontWeight: 600 }}
        >
          Delete selected
        </Button>
      </Box>
    </Box>
  );
}

export type DocumentsPageStaffEmbed = {
  customerId: string;
  customerName?: string;
  lockLibraryKind?: PortalLibrarySection;
};

export type DocumentsPagePortalEmbed = {
  customerId: string;
  customerDisplayName: string;
  librarySection: PortalLibrarySection;
  tree?: PortalLibraryTreeResponse | null;
  loading: boolean;
  err: string;
  onAddFiles: () => void;
  onOpenDocument: (documentId: string) => void;
};

export type DocumentsPageProps = {
  staffEmbed?: DocumentsPageStaffEmbed;
  portalEmbed?: DocumentsPagePortalEmbed;
};

export default function DocumentsPage({ staffEmbed, portalEmbed }: DocumentsPageProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const {
    apiBase,
    authHeaders,
    authRequired,
    hasPermission,
    hasAnyPermission,
    customerId: jwtCustomerId,
    isAdmin,
  } = useAuth();
  const requestHeaders = useMemo(() => authHeaders(), [authHeaders]);
  const { exporting: zipExporting, exportNotice, setExportNotice, startLibraryZipExport } =
    useLibraryZipExport(apiBase, authHeaders);
  const isCustomerPortalSession = Boolean(jwtCustomerId && !isAdmin);
  const isPortal = Boolean(portalEmbed);
  const isStaffEmbed = Boolean(staffEmbed) && !isPortal;
  const canManageAssignees = !isPortal && hasPermission("document:assign");
  const canDeleteLibraryDocuments =
    !isPortal && canDeleteDriveFiles({ authRequired, isAdmin, hasPermission });
  const canUploadLibraryDocuments =
    !authRequired ||
    isAdmin ||
    hasPermission("file:write") ||
    hasAnyPermission(["portal:file:write", "portal:file:delete"]);

  const [filesView, setFilesView] = useState<FilesViewMode>(() => {
    const stored = localStorage.getItem("files-view");
    return stored === "list" || stored === "folder" ? stored : "folder";
  });
  const setFilesViewPersisted = (v: FilesViewMode) => {
    setFilesView(v);
    localStorage.setItem("files-view", v);
  };
  const [filesGroupBy, setFilesGroupBy] = useState<FilesGroupBy>("folderView");
  const [explorerBust, setExplorerBust] = useState(0);
  const [docs, setDocs] = useState<AdminLibraryDocumentRow[]>([]);
  const [listRowCount, setListRowCount] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [assigneeDialogOpen, setAssigneeDialogOpen] = useState(false);
  const [assigneeDialogDocument, setAssigneeDialogDocument] = useState<DocGridRow | null>(null);
  const [assigneeCandidates, setAssigneeCandidates] = useState<DocumentAssigneeCandidate[]>([]);
  const [assigneeSelection, setAssigneeSelection] = useState<string[]>([]);
  const [assigneeLoading, setAssigneeLoading] = useState(false);
  const [assigneeSaving, setAssigneeSaving] = useState(false);
  const [assigneeErr, setAssigneeErr] = useState("");
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [sortModel, setSortModel] = useState<GridSortModel>([{ field: "fileName", sort: "asc" }]);
  const [selectedGridIds, setSelectedGridIds] = useState<string[]>([]);
  const [lastRefresh, setLastRefresh] = useState(nowLabel());
  const [deletingDocumentIds, setDeletingDocumentIds] = useState<Set<string>>(() => new Set());
  const [downloadingDocumentIds, setDownloadingDocumentIds] = useState<Set<string>>(() => new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { open: false }
    | { open: true; title: string; message: string; kind: "documents"; ids: string[] }
    | { open: true; title: string; message: string; kind: "folder"; folderId: string; folderName: string }
  >({ open: false });
  const [deleteConfirmBusy, setDeleteConfirmBusy] = useState(false);
  const [deletingFolderId, setDeletingFolderId] = useState<string | null>(null);
  const [removedFolderId, setRemovedFolderId] = useState<string | null>(null);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState(() => staffEmbed?.customerId ?? "");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchText, setSearchText] = useState("");
  const [err, setErr] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [assignedToMeOnly, setAssignedToMeOnly] = useState(false);
  const showStaffAssigneeFilter = shouldShowStaffAssigneeFilter({
    isPortal,
    isAdmin,
    hasPermission,
  });
  const assignedFilesOnly = staffSeesAssignedFilesOnly({ isAdmin, hasPermission });
  const effectiveAssignedToMeOnly =
    assignedFilesOnly || (showStaffAssigneeFilter && assignedToMeOnly);
  const useLibraryCustomerFilter = !isPortal && !isCustomerPortalSession && !hasPermission("customer:read") && hasPermission("file:read");
  const showCustomerFilter = !isPortal && !isStaffEmbed && !isCustomerPortalSession;
  const hideCustomerGroupBy = isStaffEmbed || isPortal || isCustomerPortalSession;

  useEffect(() => {
    if (!hideCustomerGroupBy || filesGroupBy !== "customerView") return;
    setFilesGroupBy("folderView");
  }, [hideCustomerGroupBy, filesGroupBy]);

  useEffect(() => {
    if (isPortal) return;
    if (isCustomerPortalSession) {
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
  }, [apiBase, authHeaders, isPortal, isCustomerPortalSession, useLibraryCustomerFilter]);

  useEffect(() => {
    if (!staffEmbed) return;
    setCustomerId(staffEmbed.customerId);
  }, [staffEmbed]);

  useEffect(() => {
    if (!isCustomerPortalSession || !jwtCustomerId) return;
    setCustomerId(jwtCustomerId);
  }, [isCustomerPortalSession, jwtCustomerId]);

  const customerIdFromUrl = searchParams.get("customerId")?.trim() ?? "";
  useEffect(() => {
    if (isStaffEmbed || isPortal || isCustomerPortalSession) return;
    setCustomerId(customerIdFromUrl);
  }, [customerIdFromUrl, isStaffEmbed, isPortal, isCustomerPortalSession]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchText(searchDraft.trim());
      setPaginationModel((p) => ({ ...p, page: 0 }));
    }, 350);
    return () => window.clearTimeout(t);
  }, [searchDraft]);

  const lazyExplorerScopeCustomerId =
    portalEmbed?.customerId?.trim() ||
    staffEmbed?.customerId?.trim() ||
    jwtCustomerId?.trim() ||
    customerId.trim() ||
    undefined;

  const lazyExplorerScopeCustomerName = useMemo(() => {
    if (isPortal) return portalEmbed?.customerDisplayName?.trim() || undefined;
    if (isStaffEmbed) return (staffEmbed?.customerName ?? staffEmbed?.customerId)?.trim() || undefined;
    const scopedId = lazyExplorerScopeCustomerId;
    if (!scopedId) return undefined;
    return customers.find((c) => c.id === scopedId)?.name?.trim() || scopedId;
  }, [
    isPortal,
    portalEmbed?.customerDisplayName,
    isStaffEmbed,
    staffEmbed?.customerName,
    staffEmbed?.customerId,
    lazyExplorerScopeCustomerId,
    customers,
  ]);

  /** Portal sections stay scoped; staff browse all library kinds (invoices, statements, files). */
  const lazyExplorerLibraryKind: "" | PortalLibrarySection =
    portalEmbed?.librarySection ?? staffEmbed?.lockLibraryKind ?? "";

  const sort = useMemo(() => sortModelToApiSort(sortModel), [sortModel]);

  const loadList = useCallback(async () => {
    const portalCustomerId = portalEmbed?.customerId?.trim();
    if (isPortal && !portalCustomerId) return;
    setErr("");
    setListLoading(true);
    try {
      const res = await fetchDocumentsList(apiBase, authHeaders(), {
        page: paginationModel.page + 1,
        limit: paginationModel.pageSize,
        sort,
        customerId: (isPortal ? portalCustomerId : customerId) || undefined,
        libraryKind: isPortal
          ? portalEmbed?.librarySection
          : staffEmbed?.lockLibraryKind || undefined,
        searchText: searchText || undefined,
        assignedOnly: effectiveAssignedToMeOnly ? true : undefined,
      });
      let rows = res.data;
      if (isAdmin && !isPortal && rows.length > 0) {
        try {
          const accessById = await fetchDocumentsFileAccessLatest(
            apiBase,
            authHeaders(),
            rows.map((row) => row.id),
          );
          rows = rows.map((row) => ({
            ...row,
            fileAccess:
              accessById[row.id] ??
              row.fileAccess ??
              ({ uploadedBy: null, lastViewedBy: null, lastDownloadedBy: null } satisfies FileDocumentAccessSummary),
          }));
        } catch {
          /* list still usable without access enrichment */
        }
      }
      setDocs(rows);
      setListRowCount(res.total);
      setLastRefresh(nowLabel());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load documents");
      setDocs([]);
      setListRowCount(0);
    } finally {
      setListLoading(false);
    }
  }, [
    apiBase,
    authHeaders,
    paginationModel.page,
    paginationModel.pageSize,
    sort,
    customerId,
    searchText,
    effectiveAssignedToMeOnly,
    isAdmin,
    isPortal,
    portalEmbed?.customerId,
    portalEmbed?.librarySection,
    staffEmbed?.lockLibraryKind,
  ]);

  useEffect(() => {
    if (filesView !== "list") return;
    void loadList();
  }, [filesView, loadList, explorerBust, location.key]);

  useEffect(() => {
    if (filesView !== "list") return;
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") void loadList();
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => document.removeEventListener("visibilitychange", refreshOnVisible);
  }, [filesView, loadList]);

  const effectiveErr = isPortal ? (portalEmbed?.err ?? "") : err;
  const listRows = useMemo(() => docs.map(docToGridRow), [docs]);

  useEffect(() => {
    setSelectedGridIds([]);
  }, [paginationModel.page, paginationModel.pageSize, filesView, customerId, searchText]);

  const scopeLabel = useMemo(() => {
    if (isPortal) return portalEmbed?.customerDisplayName ?? "Your account";
    if (isStaffEmbed) return staffEmbed?.customerName ?? staffEmbed?.customerId ?? "Customer";
    if (isCustomerPortalSession) return "Your account";
    if (customerId) {
      return customers.find((c) => c.id === customerId)?.name ?? customerId;
    }
    return "All customers";
  }, [
    isPortal,
    portalEmbed?.customerDisplayName,
    isStaffEmbed,
    staffEmbed?.customerName,
    staffEmbed?.customerId,
    isCustomerPortalSession,
    customerId,
    customers,
  ]);

  const openStaffDocument = useCallback(
    (documentId: string) => {
      navigate(`/files/documents/${documentId}`);
    },
    [navigate],
  );

  const openDocument = useCallback(
    (documentId: string) => {
      if (isPortal && portalEmbed) {
        portalEmbed.onOpenDocument(documentId);
      } else {
        openStaffDocument(documentId);
      }
    },
    [isPortal, portalEmbed, openStaffDocument],
  );

  const openAssigneeDialog = useCallback(
    async (row: DocGridRow) => {
      if (!canManageAssignees) return;
      setAssigneeDialogDocument(row);
      setAssigneeDialogOpen(true);
      setAssigneeErr("");
      setAssigneeLoading(true);
      setAssigneeCandidates([]);
      try {
        let customerScope = row.customerId?.trim() || undefined;
        if (!customerScope) {
          const doc = await fetchLibraryDocument(apiBase, authHeaders(), row.id);
          customerScope =
            doc.customerId ??
            doc.customer?.id ??
            doc.folder?.customerId ??
            doc.folder?.customer?.id ??
            undefined;
        }
        const [current, candidates] = await Promise.all([
          fetchDocumentAssignees(apiBase, authHeaders(), row.id),
          fetchDocumentAssigneeCandidates(apiBase, authHeaders(), customerScope),
        ]);
        setAssigneeCandidates(candidates);
        const allowed = new Set(candidates.map((c) => c.id));
        setAssigneeSelection(current.map((x: DocumentAssigneeRow) => x.userId).filter((id) => allowed.has(id)));
      } catch (e) {
        setAssigneeErr(e instanceof Error ? e.message : "Failed to load assignees");
        setAssigneeSelection([]);
        setAssigneeCandidates([]);
      } finally {
        setAssigneeLoading(false);
      }
    },
    [apiBase, authHeaders, canManageAssignees],
  );

  const handleAssignDocument = useCallback(
    (documentId: string, fileName: string, customerId?: string) => {
      void openAssigneeDialog({
        id: documentId,
        fileName,
        customerId,
        customer: "",
        folderName: "",
        library: "",
        uploadedAt: null,
        lastViewedBy: "—",
        lastViewedByTooltip: null,
        lastDownloadedBy: "—",
        lastDownloadedByTooltip: null,
      });
    },
    [openAssigneeDialog],
  );

  const toggleAssignee = useCallback((userId: string, checked: boolean) => {
    setAssigneeSelection((prev) => {
      const set = new Set(prev);
      if (checked) set.add(userId);
      else set.delete(userId);
      return [...set];
    });
  }, []);

  const saveAssignees = useCallback(async () => {
    if (!assigneeDialogDocument) return;
    setAssigneeSaving(true);
    setAssigneeErr("");
    try {
      await replaceDocumentAssignees(apiBase, authHeaders(), assigneeDialogDocument.id, assigneeSelection);
      setAssigneeDialogOpen(false);
      setAssigneeDialogDocument(null);
    } catch (e) {
      setAssigneeErr(e instanceof Error ? e.message : "Failed to save assignees");
    } finally {
      setAssigneeSaving(false);
    }
  }, [apiBase, authHeaders, assigneeDialogDocument, assigneeSelection]);

  const downloadDocument = useCallback(
    async (documentId: string, fileName: string, docCustomerId?: string) => {
      setDownloadingDocumentIds((prev) => new Set(prev).add(documentId));
      try {
        const blob = await fetchDocumentContentBlob(
          apiBase,
          authHeaders(),
          docCustomerId ?? lazyExplorerScopeCustomerId ?? jwtCustomerId ?? "",
          documentId,
          { download: true },
        );
        triggerBrowserDownload(blob, fileName.trim() || "download");
      } catch {
        // Ignore single download failures in the list UI.
      } finally {
        setDownloadingDocumentIds((prev) => {
          const next = new Set(prev);
          next.delete(documentId);
          return next;
        });
      }
    },
    [apiBase, authHeaders, lazyExplorerScopeCustomerId, jwtCustomerId],
  );

  const deleteDocuments = useCallback(
    (documentIds: string[]) => {
      if (!canDeleteLibraryDocuments) return;
      const ids = [...new Set(documentIds.map((id) => id.trim()).filter(Boolean))];
      if (ids.length === 0) return;
      setDeleteConfirm({
        open: true,
        title: ids.length === 1 ? "Delete document?" : `Delete ${ids.length} documents?`,
        message:
          ids.length === 1
            ? "This document will be hidden from the library. Linked extraction jobs will be removed too."
            : "These documents will be hidden from the library. Linked extraction jobs will be removed too.",
        kind: "documents",
        ids,
      });
    },
    [canDeleteLibraryDocuments],
  );

  const downloadSelectedGridZip = useCallback(() => {
    const ids = [...new Set(selectedGridIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return;
    const scopedCustomerId =
      portalEmbed?.customerId?.trim() ||
      staffEmbed?.customerId?.trim() ||
      customerId.trim() ||
      undefined;
    void startLibraryZipExport(
      {
        customerId: scopedCustomerId,
        viewMode: filesGroupBy,
        libraryKind: lazyExplorerLibraryKind || undefined,
        searchText: searchText.trim() || undefined,
        assignedOnly: effectiveAssignedToMeOnly ? true : undefined,
        documentIds: ids,
      },
      `${ids.length} selected file${ids.length === 1 ? "" : "s"}`,
    );
  }, [
    selectedGridIds,
    portalEmbed?.customerId,
    staffEmbed?.customerId,
    customerId,
    filesGroupBy,
    lazyExplorerLibraryKind,
    searchText,
    effectiveAssignedToMeOnly,
    startLibraryZipExport,
  ]);

  const deleteFolder = useCallback(
    (folderId: string, folderName: string) => {
      if (!canDeleteLibraryDocuments) return;
      setDeleteConfirm({
        open: true,
        title: `Delete folder "${folderName}"?`,
        message:
          "The folder must be empty. Delete all files in this folder first if delete is blocked.",
        kind: "folder",
        folderId,
        folderName,
      });
    },
    [canDeleteLibraryDocuments],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm.open) return;
    setDeleteConfirmBusy(true);
    setErr("");
    try {
      if (deleteConfirm.kind === "documents") {
        const ids = deleteConfirm.ids;
        setDeletingDocumentIds(new Set(ids));
        const result = await deleteLibraryDocuments(apiBase, authHeaders(), ids);
        if (result.failed.length > 0) {
          setErr(
            `Deleted ${result.deleted} of ${ids.length}. Failed: ${result.failed.map((f) => f.error).join("; ")}`,
          );
        }
        setSelectedGridIds((prev) => prev.filter((id) => !ids.includes(id)));
        setExplorerBust((n) => n + 1);
      } else {
        const { folderId, folderName } = deleteConfirm;
        setDeletingFolderId(folderId);
        await deleteLibraryFolder(apiBase, authHeaders(), folderId);
        setRemovedFolderId(folderId);
        setDeleteNotice(`Folder "${folderName}" deleted.`);
      }
      setDeleteConfirm({ open: false });
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message
          : deleteConfirm.kind === "documents"
            ? "Failed to delete documents"
            : "Failed to delete folder",
      );
    } finally {
      setDeleteConfirmBusy(false);
      setDeletingDocumentIds(new Set());
      setDeletingFolderId(null);
    }
  }, [deleteConfirm, apiBase, authHeaders]);

  const consumeRemovedFolder = useCallback(() => setRemovedFolderId(null), []);

  const clearFilesSearch = useCallback(() => {
    setSearchDraft("");
    setSearchText("");
  }, []);

  const columns: GridColDef<DocGridRow>[] = useMemo(() => {
    const base: GridColDef<DocGridRow>[] = [
      { field: "fileName", headerName: "Document", flex: 1.5, minWidth: 210, sortable: true },
    ];
    if (!isStaffEmbed && !isCustomerPortalSession) {
      base.push({ field: "customer", headerName: "Customer", flex: 1, minWidth: 160, sortable: true });
    }
    base.push({ field: "folderName", headerName: "Folder", flex: 1, minWidth: 160, sortable: true });
    base.push({
      field: "uploadedAt",
      headerName: "Uploaded",
      width: 150,
      sortable: true,
      valueGetter: (_value, row) => (row.uploadedAt ? new Date(row.uploadedAt) : null),
      valueFormatter: (value: Date | null) => (value ? formatDateTime(value) : "—"),
    });
    if (isAdmin && !isPortal) {
      base.push({
        field: "lastViewedBy",
        headerName: "Last viewed by",
        flex: 1,
        minWidth: 140,
        sortable: false,
        valueGetter: (_value, row) => row.lastViewedBy,
        renderCell: (params) => {
          const tip = params.row.lastViewedByTooltip;
          const label = params.row.lastViewedBy;
          if (!tip || label === "—") return label;
          return (
            <Tooltip title={`Viewed ${tip}`}>
              <span className="truncate">{label}</span>
            </Tooltip>
          );
        },
      });
      base.push({
        field: "lastDownloadedBy",
        headerName: "Last downloaded by",
        flex: 1,
        minWidth: 150,
        sortable: false,
        valueGetter: (_value, row) => row.lastDownloadedBy,
        renderCell: (params) => {
          const tip = params.row.lastDownloadedByTooltip;
          const label = params.row.lastDownloadedBy;
          if (!tip || label === "—") return label;
          return (
            <Tooltip title={`Downloaded ${tip}`}>
              <span className="truncate">{label}</span>
            </Tooltip>
          );
        },
      });
    }
    if (canManageAssignees) {
      base.push({
        field: "assign",
        headerName: "Assignee",
        width: 110,
        sortable: false,
        filterable: false,
        align: "center",
        headerAlign: "center",
        renderCell: (params) => (
          <Button
            size="small"
            variant="outlined"
            onClick={(e) => {
              e.stopPropagation();
              void openAssigneeDialog(params.row);
            }}
          >
            Assign
          </Button>
        ),
      });
    }
    base.push({
      field: "download",
      headerName: "",
      width: 56,
      sortable: false,
      filterable: false,
      align: "center",
      headerAlign: "center",
      renderCell: (params) => (
        <Tooltip title="Download">
          <span>
            <IconButton
              size="small"
              color="primary"
              aria-label="Download file"
              disabled={downloadingDocumentIds.has(params.row.id)}
              onClick={(e) => {
                e.stopPropagation();
                void downloadDocument(params.row.id, params.row.fileName, params.row.customerId);
              }}
            >
              <DownloadOutlined fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      ),
    });
    if (canDeleteLibraryDocuments) {
      base.push({
        field: "delete",
        headerName: "",
        width: 56,
        sortable: false,
        filterable: false,
        align: "center",
        headerAlign: "center",
        renderCell: (params) => (
          <IconButton
            size="small"
            color="error"
            aria-label="Delete document"
            disabled={deletingDocumentIds.has(params.row.id)}
            onClick={(e) => {
              e.stopPropagation();
              void deleteDocuments([params.row.id]);
            }}
          >
            <DeleteOutlined fontSize="small" />
          </IconButton>
        ),
      });
    }
    return base;
  }, [
    isAdmin,
    isPortal,
    isStaffEmbed,
    isCustomerPortalSession,
    canManageAssignees,
    canDeleteLibraryDocuments,
    deletingDocumentIds,
    downloadingDocumentIds,
    deleteDocuments,
    downloadDocument,
    openAssigneeDialog,
  ]);

  const gridRowSelectionModel = useMemo(
    (): GridRowSelectionModel => ({ type: "include", ids: new Set(selectedGridIds) }),
    [selectedGridIds],
  );

  const handleCustomerFilterChange = useCallback((id: string) => {
    setCustomerId(id);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }, []);

  const pageTitle = isPortal && portalEmbed ? PORTAL_PAGE[portalEmbed.librarySection].title : "Files";
  const pageSubtitle =
    isPortal && portalEmbed
      ? PORTAL_PAGE[portalEmbed.librarySection].subtitle
      : isStaffEmbed
        ? "Library documents for this customer."
        : isCustomerPortalSession
          ? "Your library documents."
          : "Browse and manage customer library documents.";

  const uploadCustomerId = isStaffEmbed ? staffEmbed!.customerId : customerId;
  const libraryUploadCustomerId = isCustomerPortalSession ? jwtCustomerId! : uploadCustomerId;

  const filesToolbarFilters = useMemo(
    () => (
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, minWidth: 0, flex: 1 }}>
        {showCustomerFilter ? (
          <SearchableCustomerSelect
            customers={customers}
            value={customerId}
            onChange={handleCustomerFilterChange}
            label="Customer"
            allowEmpty
            emptyLabel="All customers"
            size="small"
            className="min-w-[180px] max-w-[260px]"
          />
        ) : !isStaffEmbed ? (
          <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: { xs: "100%", sm: 360 } }}>
            Customer:{" "}
            <Box component="span" sx={{ color: "text.primary", fontWeight: 600 }}>
              {scopeLabel}
            </Box>
          </Typography>
        ) : null}
        {showStaffAssigneeFilter ? (
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={assignedToMeOnly}
                onChange={(e) => {
                  setAssignedToMeOnly(e.target.checked);
                  setPaginationModel((p) => ({ ...p, page: 0 }));
                }}
              />
            }
            label="Assigned to me"
            sx={{ ml: 0, mr: 0, "& .MuiFormControlLabel-label": { fontSize: "0.8125rem" } }}
          />
        ) : null}
        {searchText.trim() ? (
          <Chip
            size="small"
            variant="outlined"
            label={`Search: “${searchText.trim()}”`}
            onDelete={() => {
              setSearchDraft("");
              setSearchText("");
            }}
          />
        ) : null}
        {filesView === "folder" ? (
          <FormControl size="small" sx={{ minWidth: 160, flexShrink: 0 }}>
            <InputLabel id="files-group-by">Group by</InputLabel>
            <Select
              labelId="files-group-by"
              label="Group by"
              value={filesGroupBy}
              onChange={(e: SelectChangeEvent) => setFilesGroupBy(e.target.value as FilesGroupBy)}
            >
              {FILES_GROUP_BY_OPTIONS.filter(
                (o) => o.value !== "customerView" || !hideCustomerGroupBy,
              ).map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        ) : null}
      </Box>
    ),
    [
      showCustomerFilter,
      isStaffEmbed,
      customers,
      customerId,
      handleCustomerFilterChange,
      scopeLabel,
      showStaffAssigneeFilter,
      assignedToMeOnly,
      searchText,
      filesView,
      filesGroupBy,
      hideCustomerGroupBy,
    ],
  );

  const folderRootBreadcrumb =
    searchText.trim() ? "Search results" : lazyExplorerScopeCustomerName ?? "All customers";

  return (
    <PageLayout
      embedded={isStaffEmbed}
      title={pageTitle}
      subtitle={pageSubtitle}
      actions={
        <PageActions
          search={searchDraft}
          onSearch={setSearchDraft}
          placeholder="Search documents…"
          {...(isPortal && portalEmbed
            ? { addLabel: "Add files", onAdd: () => portalEmbed.onAddFiles() }
            : canUploadLibraryDocuments
              ? { addLabel: "Add files", onAdd: () => setUploadOpen(true) }
              : {})}
        />
      }
    >
      {effectiveErr ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {effectiveErr}
        </Alert>
      ) : null}

      <Card variant="outlined" sx={{ bgcolor: "background.paper", overflow: "hidden" }}>
        <Box
          sx={{
            px: 2,
            py: 1.25,
            minHeight: 52,
            borderBottom: "1px solid",
            borderColor: "divider",
            bgcolor: "background.default",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            flexWrap: { xs: "wrap", sm: "nowrap" },
          }}
        >
          {filesToolbarFilters}
          <FilesViewSwitcher view={filesView} onChange={setFilesViewPersisted} />
        </Box>

        {filesView === "folder" ? (
          filesGroupBy === "customerView" ? (
            <LazyCustomerFolderExplorer
              embedded
              apiBase={apiBase}
              headers={requestHeaders}
              fixedCustomerId={lazyExplorerScopeCustomerId}
              fixedCustomerName={lazyExplorerScopeCustomerName}
              staffBrowseForCustomer={isStaffEmbed}
              libraryKind={lazyExplorerLibraryKind}
              searchText={searchText}
              assignedToMeOnly={effectiveAssignedToMeOnly}
              onClearSearch={clearFilesSearch}
              onOpenDocument={openDocument}
              canDelete={canDeleteLibraryDocuments}
              deletingDocumentIds={deletingDocumentIds}
              onDeleteDocuments={(ids) => void deleteDocuments(ids)}
              deletingFolderId={deletingFolderId}
              onDeleteFolder={(folderId: string, folderName: string) => void deleteFolder(folderId, folderName)}
              refreshKey={explorerBust}
              removedFolderId={removedFolderId}
              onRemovedFolderConsumed={consumeRemovedFolder}
              useLibraryCustomerPicker={useLibraryCustomerFilter}
              canAssignDocuments={canManageAssignees}
              onAssignDocument={handleAssignDocument}
            />
          ) : filesGroupBy === "dateView" ? (
            <LazyLibraryDateExplorer
              embedded
              apiBase={apiBase}
              headers={requestHeaders}
              customerId={lazyExplorerScopeCustomerId}
              customerName={lazyExplorerScopeCustomerName}
              staffBrowseForCustomer={isStaffEmbed}
              libraryKind={lazyExplorerLibraryKind}
              searchText={searchText}
              assignedToMeOnly={effectiveAssignedToMeOnly}
              onOpenDocument={openDocument}
              canDelete={canDeleteLibraryDocuments}
              deletingDocumentIds={deletingDocumentIds}
              onDeleteDocuments={(ids) => void deleteDocuments(ids)}
              deletingFolderId={deletingFolderId}
              onDeleteFolder={(folderId: string, folderName: string) => void deleteFolder(folderId, folderName)}
              refreshKey={explorerBust}
              removedFolderId={removedFolderId}
              onRemovedFolderConsumed={consumeRemovedFolder}
            />
          ) : (
            <LazyLibraryFolderExplorer
              embedded
              apiBase={apiBase}
              headers={requestHeaders}
              customerId={lazyExplorerScopeCustomerId}
              customerName={lazyExplorerScopeCustomerName}
              staffBrowseForCustomer={isStaffEmbed}
              libraryKind={lazyExplorerLibraryKind}
              searchText={searchText}
              assignedToMeOnly={effectiveAssignedToMeOnly}
              onClearSearch={clearFilesSearch}
              onOpenDocument={openDocument}
              canDelete={canDeleteLibraryDocuments}
              deletingDocumentIds={deletingDocumentIds}
              onDeleteDocuments={(ids) => void deleteDocuments(ids)}
              deletingFolderId={deletingFolderId}
              onDeleteFolder={(folderId: string, folderName: string) => void deleteFolder(folderId, folderName)}
              refreshKey={explorerBust}
              removedFolderId={removedFolderId}
              onRemovedFolderConsumed={consumeRemovedFolder}
              canAssignDocuments={canManageAssignees}
              onAssignDocument={handleAssignDocument}
              hideLayoutToggle
              compactListChrome
              rootBreadcrumbLabel={folderRootBreadcrumb}
            />
          )
        ) : (
          <>
            {canDeleteLibraryDocuments && selectedGridIds.length > 0 ? (
              <ListSelectionBar
                selectedCount={selectedGridIds.length}
                pageCount={listRows.length}
                totalCount={listRowCount}
                deleting={deletingDocumentIds.size > 0}
                exporting={zipExporting}
                onDelete={() => deleteDocuments(selectedGridIds)}
                onDownloadZip={downloadSelectedGridZip}
                onClear={() => setSelectedGridIds([])}
              />
            ) : null}
            <Box sx={{ height: 660, width: "100%" }}>
              <DataGrid
                rows={listRows}
                columns={columns}
                loading={listLoading || (isPortal && Boolean(portalEmbed?.loading))}
                rowCount={listRowCount}
                paginationMode="server"
                sortingMode="server"
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
                sortModel={sortModel}
                onSortModelChange={(model) => {
                  setSortModel(model);
                  setPaginationModel((p) => ({ ...p, page: 0 }));
                }}
                pageSizeOptions={[10, 20, 50]}
                checkboxSelection={canDeleteLibraryDocuments}
                rowSelectionModel={gridRowSelectionModel}
                onRowSelectionModelChange={(model) => {
                  setSelectedGridIds(gridSelectionModelToRowIds(model, listRows.map((r) => r.id)));
                }}
                disableRowSelectionOnClick
                onRowClick={(params) => openDocument(params.row.id)}
                slots={{
                  toolbar: () => <LiveToolbar lastRefresh={lastRefresh} />,
                }}
                sx={GRID_SX}
              />
            </Box>
          </>
        )}
      </Card>

      {!isPortal && canUploadLibraryDocuments ? (
        <UploadDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          apiBase={apiBase}
          headers={authHeaders()}
          customerId={libraryUploadCustomerId}
          parentId={null}
          uploadTarget="library"
          customers={isStaffEmbed || isCustomerPortalSession ? undefined : customers}
          customerPickerInitialId={libraryUploadCustomerId || undefined}
          hideLibraryCustomerPicker={isCustomerPortalSession || isStaffEmbed}
          onUploaded={() => setExplorerBust((n) => n + 1)}
        />
      ) : null}

      <Dialog
        open={assigneeDialogOpen}
        onClose={() => {
          if (assigneeSaving) return;
          setAssigneeDialogOpen(false);
          setAssigneeDialogDocument(null);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Assign document
          {assigneeDialogDocument ? `: ${assigneeDialogDocument.fileName}` : ""}
        </DialogTitle>
        <DialogContent dividers>
          {assigneeDialogDocument?.customer && assigneeDialogDocument.customer !== "—" ? (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Showing staff with library assignee permission who are assigned to{" "}
              <strong>{assigneeDialogDocument.customer}</strong>.
            </Typography>
          ) : null}
          {assigneeErr ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {assigneeErr}
            </Alert>
          ) : null}
          {assigneeLoading ? (
            <Typography variant="body2" color="text.secondary">
              Loading assignees…
            </Typography>
          ) : assigneeCandidates.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No staff with library assignee permission are assigned to this customer. Grant document:assignee on
              their role and link them to this client under Settings → Users.
            </Typography>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
              {assigneeCandidates.map((u) => (
                <FormControlLabel
                  key={u.id}
                  control={
                    <Checkbox
                      checked={assigneeSelection.includes(u.id)}
                      onChange={(e) => toggleAssignee(u.id, e.target.checked)}
                      disabled={assigneeSaving}
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2">{u.email}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {u.roleNames.join(" · ")}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setAssigneeDialogOpen(false);
              setAssigneeDialogDocument(null);
            }}
            disabled={assigneeSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void saveAssignees()}
            variant="contained"
            disabled={assigneeSaving || assigneeLoading}
          >
            {assigneeSaving ? "Saving…" : "Save assignees"}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirm.open}
        title={deleteConfirm.open ? deleteConfirm.title : ""}
        message={deleteConfirm.open ? deleteConfirm.message : ""}
        confirmLabel="Delete"
        busy={deleteConfirmBusy}
        onCancel={() => {
          if (deleteConfirmBusy) return;
          setDeleteConfirm({ open: false });
        }}
        onConfirm={() => void handleDeleteConfirm()}
      />

      <Snackbar
        open={Boolean(deleteNotice)}
        autoHideDuration={5000}
        onClose={() => setDeleteNotice(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" onClose={() => setDeleteNotice(null)} sx={{ width: "100%" }}>
          {deleteNotice}
        </Alert>
      </Snackbar>

      <Snackbar
        open={Boolean(exportNotice)}
        autoHideDuration={8000}
        onClose={() => setExportNotice(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={exportNotice?.severity ?? "success"}
          onClose={() => setExportNotice(null)}
          sx={{ width: "100%", display: exportNotice ? undefined : "none" }}
        >
          {exportNotice?.message ?? ""}
        </Alert>
      </Snackbar>
    </PageLayout>
  );
}
