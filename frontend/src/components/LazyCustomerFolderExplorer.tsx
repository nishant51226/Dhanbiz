import { useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
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
import NavigateNext from "@mui/icons-material/NavigateNext";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import PersonOutlined from "@mui/icons-material/PersonOutlined";
import { fetchCustomersList, fetchCustomerLibraryDocumentCounts, fetchLibraryCustomerFilterOptionsList, LIBRARY_FOLDER_PAGE_SIZE } from "../api/client";
import type { Customer, PortalLibrarySection } from "../types/api";
import { formatDate } from "../utils/formatDate";
import { useLibraryZipExport } from "../hooks/useLibraryZipExport";
import { LazyLibraryFolderExplorer } from "./LazyLibraryFolderExplorer";

type SelectedCustomer = { id: string; name: string };

type Props = {
  apiBase: string;
  headers: HeadersInit;
  /** When set (portal / staff embed), skip the customer list and open folders for this account. */
  fixedCustomerId?: string;
  fixedCustomerName?: string;
  libraryKind?: "" | PortalLibrarySection;
  searchText?: string;
  assignedToMeOnly?: boolean;
  onClearSearch?: () => void;
  onOpenDocument: (documentId: string) => void;
  canDelete?: boolean;
  deletingDocumentIds?: ReadonlySet<string> | null;
  onDeleteDocuments?: (documentIds: string[]) => void;
  deletingFolderId?: string | null;
  onDeleteFolder?: (folderId: string, folderName: string) => void;
  refreshKey?: number;
  removedFolderId?: string | null;
  onRemovedFolderConsumed?: () => void;
  /** Staff customer drill-down uses admin folder APIs, not portal routes. */
  staffBrowseForCustomer?: boolean;
  /** Use `GET /api/documents/library-customer-filter-options` instead of `/api/customers`. */
  useLibraryCustomerPicker?: boolean;
  /** Omit outer Paper; parent supplies card chrome (Files page). */
  embedded?: boolean;
  canAssignDocuments?: boolean;
  onAssignDocument?: (documentId: string, fileName: string, customerId?: string) => void;
};

export function LazyCustomerFolderExplorer({
  apiBase,
  headers,
  fixedCustomerId,
  fixedCustomerName,
  libraryKind = "",
  searchText = "",
  assignedToMeOnly = false,
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
  staffBrowseForCustomer = true,
  useLibraryCustomerPicker = false,
  embedded = false,
  canAssignDocuments = false,
  onAssignDocument,
}: Readonly<Props>) {
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(() =>
    fixedCustomerId
      ? { id: fixedCustomerId, name: fixedCustomerName?.trim() || "Customer" }
      : null,
  );
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerPage, setCustomerPage] = useState(0);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [customerHasMore, setCustomerHasMore] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerLoadingMore, setCustomerLoadingMore] = useState(false);
  const [customerError, setCustomerError] = useState("");
  const [customerFileCounts, setCustomerFileCounts] = useState<Record<string, number>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fetchLockRef = useRef(false);
  const headersRef = useRef(headers);
  headersRef.current = headers;

  const { exporting, exportNotice, setExportNotice, startLibraryZipExport } =
    useLibraryZipExport(apiBase, () => headersRef.current);

  const searchQuery = searchText.trim();
  const showCustomerList = !fixedCustomerId && !selectedCustomer;
  const showFolderExplorer = Boolean(selectedCustomer);

  const handleCustomerListZipExport = useCallback(() => {
    void startLibraryZipExport(
      {
        viewMode: "customerView",
        libraryKind: libraryKind || undefined,
        searchText: searchQuery || undefined,
        assignedOnly: assignedToMeOnly ? true : undefined,
      },
      searchQuery ? `filtered customers` : "all customers",
    );
  }, [startLibraryZipExport, libraryKind, searchQuery, assignedToMeOnly]);

  useEffect(() => {
    if (fixedCustomerId) {
      setSelectedCustomer({
        id: fixedCustomerId,
        name: fixedCustomerName?.trim() || "Customer",
      });
      return;
    }
    setSelectedCustomer(null);
  }, [fixedCustomerId, fixedCustomerName]);

  const loadCustomerPage = useCallback(
    async (page: number, append: boolean) => {
      if (fetchLockRef.current || fixedCustomerId) return;
      fetchLockRef.current = true;
      if (page === 1) {
        setCustomerLoading(true);
        setCustomerError("");
      } else {
        setCustomerLoadingMore(true);
      }
      try {
        const res = useLibraryCustomerPicker
          ? await fetchLibraryCustomerFilterOptionsList(apiBase, headersRef.current, {
              page,
              limit: LIBRARY_FOLDER_PAGE_SIZE,
              searchText: searchQuery || undefined,
            })
          : await fetchCustomersList(apiBase, headersRef.current, {
              page,
              limit: LIBRARY_FOLDER_PAGE_SIZE,
              sort: "name,ASC",
              searchText: searchQuery || undefined,
              activeOnly: true,
            });
        const customerRows: Customer[] = res.data.map((row): Customer =>
          useLibraryCustomerPicker
            ? { id: row.id, name: row.name, accountStatus: "active" }
            : row,
        );
        const counts =
          customerRows.length > 0
            ? await fetchCustomerLibraryDocumentCounts(
                apiBase,
                headersRef.current,
                customerRows.map((c) => c.id),
                {
                  libraryKind: libraryKind || undefined,
                  assignedOnly: assignedToMeOnly ? true : undefined,
                },
              )
            : {};
        setCustomers((prev) => (append ? [...prev, ...customerRows] : customerRows));
        setCustomerFileCounts((prev) => (append ? { ...prev, ...counts } : counts));
        setCustomerPage(res.page);
        setCustomerTotal(res.total);
        setCustomerHasMore(res.page < res.pageCount);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load customers";
        if (!append) {
          setCustomers([]);
          setCustomerTotal(0);
        }
        setCustomerError(msg);
        setCustomerHasMore(false);
      } finally {
        fetchLockRef.current = false;
        setCustomerLoading(false);
        setCustomerLoadingMore(false);
      }
    },
    [apiBase, fixedCustomerId, searchQuery, libraryKind, assignedToMeOnly, useLibraryCustomerPicker],
  );

  const loadCustomerPageRef = useRef(loadCustomerPage);
  loadCustomerPageRef.current = loadCustomerPage;

  useEffect(() => {
    if (!showCustomerList) return;
    setCustomers([]);
    setCustomerPage(0);
    setCustomerTotal(0);
    setCustomerHasMore(false);
    setCustomerError("");
    setCustomerFileCounts({});
    void loadCustomerPageRef.current(1, false);
  }, [showCustomerList, searchQuery, refreshKey, libraryKind, assignedToMeOnly]);

  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!showCustomerList || !root || !sentinel || !customerHasMore || customerLoading || customerLoadingMore) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadCustomerPageRef.current(customerPage + 1, true);
      },
      { root, rootMargin: "120px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    showCustomerList,
    customerHasMore,
    customerLoading,
    customerLoadingMore,
    customerPage,
    customers.length,
  ]);

  if (showFolderExplorer && selectedCustomer) {
    return (
      <>
        <LazyLibraryFolderExplorer
          apiBase={apiBase}
          headers={headers}
          customerId={selectedCustomer.id}
          customerName={selectedCustomer.name}
          staffBrowseForCustomer={staffBrowseForCustomer}
        libraryKind={libraryKind}
        searchText={searchText}
        assignedToMeOnly={assignedToMeOnly}
        onClearSearch={onClearSearch}
        onOpenDocument={onOpenDocument}
        canDelete={canDelete}
        deletingDocumentIds={deletingDocumentIds}
        onDeleteDocuments={onDeleteDocuments}
        deletingFolderId={deletingFolderId}
        onDeleteFolder={onDeleteFolder}
        refreshKey={refreshKey}
        removedFolderId={removedFolderId}
        onRemovedFolderConsumed={onRemovedFolderConsumed}
        embedded={embedded}
        canAssignDocuments={canAssignDocuments}
        onAssignDocument={onAssignDocument}
        rootBreadcrumbLabel="Folders"
        exportViewMode="customerView"
        breadcrumbPrefix={
          fixedCustomerId
            ? undefined
            : [{ label: "All customers", onNavigate: () => setSelectedCustomer(null) }]
        }
        />
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

  const customerListPanel = (
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
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Breadcrumbs separator={<NavigateNext fontSize="small" />}>
            <Typography variant="body2" color="text.primary" sx={{ fontWeight: 600 }}>
              All customers
            </Typography>
          </Breadcrumbs>
          {searchQuery ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              Matching &ldquo;{searchQuery}&rdquo; in customer names
              {customerTotal > 0 ? ` (${customers.length}${customerHasMore ? "+" : ""} of ${customerTotal})` : ""}
            </Typography>
          ) : customerTotal > 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {customers.length}
              {customerHasMore ? "+" : ""} of {customerTotal} customers
            </Typography>
          ) : null}
        </Box>
        <Tooltip title="Download ZIP for all customers shown below">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={exporting ? <CircularProgress size={14} /> : <DownloadOutlined fontSize="small" />}
              disabled={exporting}
              onClick={handleCustomerListZipExport}
            >
              Download ZIP
            </Button>
          </span>
        </Tooltip>
      </Box>
      <Box ref={scrollRef} className="scroll-subtle" sx={{ maxHeight: 640, overflowY: "auto" }}>
        {customerLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
            <CircularProgress size={24} />
          </Box>
        ) : customerError ? (
          <Typography variant="body2" color="error" sx={{ px: 3, py: 4 }}>
            {customerError}
          </Typography>
        ) : customers.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 3, py: 6, textAlign: "center" }}>
            {searchQuery ? "No customers match your search." : "No customers found."}
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small" aria-label="Customers">
              <TableHead>
                <TableRow sx={{ bgcolor: "background.default" }}>
                  <TableCell
                    sx={{
                      fontWeight: 700,
                      fontSize: "0.7rem",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    Name
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 700,
                      fontSize: "0.7rem",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      display: { xs: "none", sm: "table-cell" },
                      width: 100,
                    }}
                  >
                    Files
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{
                      fontWeight: 700,
                      fontSize: "0.7rem",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      width: 140,
                    }}
                  >
                    Created
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    hover
                    onClick={() => setSelectedCustomer({ id: customer.id, name: customer.name })}
                    sx={{ cursor: "pointer", "&:last-child td": { borderBottom: 0 } }}
                  >
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}>
                        <PersonOutlined sx={{ color: "primary.main", fontSize: 22 }} />
                        <Typography variant="body2" noWrap title={customer.name} sx={{ fontWeight: 500 }}>
                          {customer.name}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: "none", sm: "table-cell" } }}>
                      <Typography variant="caption" color="text.secondary">
                        {(() => {
                          const n = customerFileCounts[customer.id];
                          if (n == null) return "…";
                          return `${n} file${n === 1 ? "" : "s"}`;
                        })()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption" color="text.secondary">
                        {customer.createdAt ? formatDate(customer.createdAt) : "—"}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {customerLoadingMore ? (
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
      {embedded ? customerListPanel : (
        <Paper variant="outlined" sx={{ overflow: "hidden", bgcolor: "background.paper" }}>
          {customerListPanel}
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
