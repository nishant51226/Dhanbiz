import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Box,
  Button,
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Card,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import ExpandMoreOutlined from "@mui/icons-material/ExpandMoreOutlined";
import {
  DataGrid,
  GridToolbarColumnsButton,
  GridToolbarContainer,
  GridToolbarDensitySelector,
  GridToolbarExport,
  GridToolbarFilterButton,
  type GridColDef,
  type GridFilterModel,
  type GridPaginationModel,
  type GridRenderCellParams,
  type GridSortModel,
} from "@mui/x-data-grid";
import { fetchJobsList, fetchStaffScopedActiveCustomers, requeueJob } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PageActions } from "../components/admin/PageActions";
import { PageLayout } from "../components/admin/PageLayout";
import { ADMIN_DATA_GRID_SX } from "../components/admin/adminDataGridSx";
import { SearchableCustomerSelect } from "../components/SearchableCustomerSelect";
import { JobStatusChip } from "../components/admin/JobStatusChip";
import { ViewSwitcher, type JobsViewMode } from "../components/admin/ViewSwitcher";
import type { Customer, JobRow, JobStatus, PortalLibrarySection } from "../types/api";
import { formatDate, formatDateTime } from "../utils/formatDate";
import { jobDurationLabel, jobDurationSuffix } from "../utils/formatJobDuration";
import { gridDateColumnFilterOperators } from "../utils/gridDateColumnFilterOperators";

const STATUS_ORDER: JobStatus[] = ["queued", "processing", "completed", "failed", "cancelled"];

function jobCanRequeue(status: JobStatus): boolean {
  return (
    status === "failed" ||
    status === "cancelled" ||
    status === "completed" ||
    status === "queued"
  );
}

function requeueButtonLabel(status: JobStatus): string {
  if (status === "completed") return "Re-run";
  if (status === "queued") return "Retry";
  return "Requeue";
}

function nowLabel() {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function pagesFromJob(job: JobRow): number | null {
  const r = job.result;
  if (!r || typeof r !== "object") return null;
  const rec = r as Record<string, unknown>;
  if (typeof rec.pageCount === "number") return rec.pageCount;
  if (Array.isArray(rec.pages)) return rec.pages.length;
  return null;
}

function libraryLabel(kind: PortalLibrarySection | undefined | null): string {
  if (!kind) return "—";
  if (kind === "invoices") return "Invoices";
  if (kind === "statements") return "Statements";
  return "Files";
}

function jobToGridRow(job: JobRow): JobGridRow {
  const folderName = job.document?.folder?.name?.trim() || "—";
  return {
    id: job.id,
    fileName: job.document?.name ?? job.file?.name ?? job.fileId ?? job.documentId ?? "—",
    customer: job.customer?.name ?? job.customerId,
    folderName,
    library: libraryLabel(job.document?.folder?.type ?? null),
    pages: pagesFromJob(job),
    status: job.status,
    uploadedBy: "—",
    percentCompleted: job.percentCompleted ?? 0,
    error: job.error,
    createdAt: job.createdAt ? new Date(job.createdAt) : null,
    startedAt: job.startedAt ?? null,
    completedAt: job.completedAt ?? null,
    updatedAt: job.updatedAt ?? null,
    processingDurationMs: job.processingDurationMs ?? null,
    result: job.result,
  };
}

type JobGridRow = {
  id: string;
  fileName: string;
  customer: string;
  /** Portal folder name (`documents.folder`); used in column view. */
  folderName: string;
  library: string;
  pages: number | null;
  status: JobStatus;
  uploadedBy: string;
  percentCompleted: number;
  error: string | null;
  createdAt: Date | null;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string | null;
  processingDurationMs: number | null;
  result: Record<string, unknown> | null;
};

function sortModelToApiSort(model: GridSortModel): string {
  const first = model[0];
  if (!first?.sort) return "createdAt,DESC";
  const dir = first.sort === "asc" ? "ASC" : "DESC";
  const field = first.field;
  if (field === "percentCompleted" || field === "status" || field === "createdAt") {
    return `${field},${dir}`;
  }
  return "createdAt,DESC";
}

type LiveToolbarProps = {
  lastRefresh: string;
  live?: boolean;
};

function LiveToolbar({ lastRefresh, live = false }: LiveToolbarProps) {
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
        label={live ? `Live · updated ${lastRefresh}` : `Updated ${lastRefresh}`}
        size="small"
        variant="outlined"
        color={live ? "success" : "default"}
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

const CARD_TOOLBAR_SX = {
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
} as const;

const STATUS_OPTIONS: { value: JobStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "queued", label: "Queued" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

function jobTimingFromGridRow(row: JobGridRow): Parameters<typeof jobDurationLabel>[0] {
  return {
    status: row.status,
    processingDurationMs: row.processingDurationMs,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt,
    result: row.result,
  };
}

function BoardView({
  rows,
  onOpen,
  canRequeue,
  onRequeue,
  requeueBusyId,
  durationNow,
}: {
  rows: JobGridRow[];
  onOpen: (id: string) => void;
  canRequeue: boolean;
  onRequeue: (id: string) => void;
  requeueBusyId: string | null;
  durationNow: number;
}) {
  return (
    <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 1, alignItems: "flex-start" }}>
      {STATUS_ORDER.map((st) => {
        const col = rows.filter((r) => r.status === st);
        return (
          <Paper
            key={st}
            variant="outlined"
            sx={{ minWidth: 260, maxWidth: 320, flex: "0 0 auto", bgcolor: "background.paper" }}
          >
            <Box sx={{ px: 1.5, py: 1, borderBottom: "1px solid", borderColor: "divider", display: "flex", alignItems: "center", gap: 1 }}>
              <JobStatusChip status={st} />
              <Typography variant="caption" color="text.secondary">
                {col.length}
              </Typography>
            </Box>
            <Box
              sx={{
                p: 1,
                display: "flex",
                flexDirection: "column",
                gap: 1,
                maxHeight: 560,
                overflowY: "auto",
                "& > *": { flexShrink: 0 },
              }}
            >
              {col.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 2 }}>
                  No jobs
                </Typography>
              ) : (
                col.map((r) => (
                  <Card key={r.id} variant="outlined" sx={{ p: 1.25 }}>
                    <Box
                      role="button"
                      tabIndex={0}
                      onClick={() => onOpen(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onOpen(r.id);
                        }
                      }}
                      sx={{ cursor: "pointer" }}
                    >
                      <Typography variant="body2" noWrap title={r.fileName} sx={{ fontWeight: 600 }}>
                        {r.fileName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                        {r.customer} · {r.library}
                      </Typography>
                      <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 1 }}>
                        <LinearProgress variant="determinate" value={Math.min(100, r.percentCompleted)} sx={{ flex: 1, height: 6, borderRadius: 1 }} />
                        <Typography variant="caption" color="text.secondary">
                          {r.percentCompleted}%
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
                        Duration:{" "}
                        {jobDurationLabel(jobTimingFromGridRow(r), durationNow)}
                        {jobDurationSuffix({ status: r.status })}
                      </Typography>
                    </Box>
                    {canRequeue && jobCanRequeue(r.status) ? (
                      <Button
                        size="small"
                        variant="outlined"
                        fullWidth
                        disabled={requeueBusyId === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequeue(r.id);
                        }}
                        sx={{ mt: 1, fontSize: "0.7rem", fontWeight: 700, textTransform: "none" }}
                      >
                        {requeueBusyId === r.id ? "Queuing…" : requeueButtonLabel(r.status)}
                      </Button>
                    ) : null}
                  </Card>
                ))
              )}
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}

type ColumnGroupBy = "customer" | "folder" | "date";

function formatJobRowDate(d: Date | null): string {
  if (!d) return "—";
  return formatDateTime(d);
}

function dateGroupMeta(d: Date | null): { key: string; sortKey: string; label: string } {
  if (!d) return { key: "__none", sortKey: "", label: "No date" };
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const sortKey = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const label = formatDate(d);
  return { key: sortKey, sortKey, label };
}

function groupRowsForColumnView(rows: JobGridRow[], groupBy: ColumnGroupBy): { key: string; label: string; list: JobGridRow[] }[] {
  const m = new Map<string, JobGridRow[]>();
  const labels = new Map<string, string>();

  for (const r of rows) {
    let key: string;
    let label: string;
    if (groupBy === "customer") {
      key = r.customer || "Unknown";
      label = key;
    } else if (groupBy === "folder") {
      key = r.folderName || "—";
      label = key;
    } else {
      const meta = dateGroupMeta(r.createdAt);
      key = meta.key;
      label = meta.label;
    }
    if (!m.has(key)) {
      m.set(key, []);
      labels.set(key, label);
    }
    m.get(key)!.push(r);
  }

  const entries = [...m.entries()].map(([key, list]) => ({
    key,
    label: labels.get(key) ?? key,
    list: [...list].sort((a, b) => {
      const ta = a.createdAt?.getTime() ?? 0;
      const tb = b.createdAt?.getTime() ?? 0;
      return tb - ta;
    }),
  }));

  if (groupBy === "customer" || groupBy === "folder") {
    return entries.sort((a, b) => a.label.localeCompare(b.label));
  }
  return entries.sort((a, b) => {
    if (a.key === "__none") return 1;
    if (b.key === "__none") return -1;
    return b.key.localeCompare(a.key);
  });
}

type ColumnViewProps = {
  rows: JobGridRow[];
  groupBy: ColumnGroupBy;
  onOpen: (id: string) => void;
};

function ColumnView({
  rows,
  groupBy,
  onOpen,
  canRequeue,
  onRequeue,
  requeueBusyId,
}: ColumnViewProps & {
  canRequeue: boolean;
  onRequeue: (id: string) => void;
  requeueBusyId: string | null;
}) {
  const groups = useMemo(() => groupRowsForColumnView(rows, groupBy), [rows, groupBy]);

  if (groups.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
        No jobs on this page.
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {groups.map(({ key, label, list }) => (
        <Accordion key={key} defaultExpanded disableGutters>
          <AccordionSummary expandIcon={<ExpandMoreOutlined />}>
            <Typography sx={{ fontWeight: 600 }}>{label}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {list.length} job{list.length === 1 ? "" : "s"}
            </Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            {list.map((r) => (
              <Box
                key={r.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen(r.id);
                  }
                }}
                sx={{
                  py: 1,
                  borderTop: "1px solid",
                  borderColor: "divider",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 2,
                  cursor: "pointer",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" noWrap title={r.fileName}>
                    {r.fileName}
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75, mt: 0.5 }}>
                    <JobStatusChip status={r.status} />
                    <Typography variant="caption" color="text.secondary" component="span">
                      {r.customer}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="span">
                      ·
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="span" noWrap title={r.folderName}>
                      {r.folderName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="span">
                      ·
                    </Typography>
                    <Typography variant="caption" color="text.secondary" component="span">
                      {formatJobRowDate(r.createdAt)}
                    </Typography>
                  </Box>
                </Box>
                {canRequeue && jobCanRequeue(r.status) ? (
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={requeueBusyId === r.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequeue(r.id);
                    }}
                    sx={{ flexShrink: 0, minWidth: 0, px: 1.25, fontSize: "0.7rem", fontWeight: 700, textTransform: "none" }}
                  >
                    {requeueBusyId === r.id ? "…" : requeueButtonLabel(r.status)}
                  </Button>
                ) : null}
              </Box>
            ))}
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
}

export type JobsPageStaffEmbed = {
  customerId: string;
  customerName?: string;
};

type JobsPageProps = {
  staffEmbed?: JobsPageStaffEmbed;
};

export default function JobsPage({ staffEmbed }: JobsPageProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { apiBase, authHeaders, authRequired, isAdmin, hasPermission } = useAuth();
  const canCreateJob = !authRequired || isAdmin || hasPermission("job:create");
  const canReadCustomers = isAdmin || hasPermission("customer:read");
  const canReadFiles = hasPermission("file:read");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 20 });
  const [sortModel, setSortModel] = useState<GridSortModel>([{ field: "createdAt", sort: "desc" }]);
  const [filterModel, setFilterModel] = useState<GridFilterModel>({ items: [] });
  const [status, setStatus] = useState("");
  const [customerId, setCustomerId] = useState(() => staffEmbed?.customerId ?? "");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [lastRefresh, setLastRefresh] = useState(nowLabel());
  const [requeueBusyId, setRequeueBusyId] = useState<string | null>(null);
  const [view, setView] = useState<JobsViewMode>("grid");
  const [columnGroupBy, setColumnGroupBy] = useState<ColumnGroupBy>(() => (staffEmbed ? "folder" : "customer"));

  const customerIdFromUrl = searchParams.get("customerId")?.trim() ?? "";
  useEffect(() => {
    if (staffEmbed) return;
    setCustomerId(customerIdFromUrl);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }, [customerIdFromUrl, staffEmbed]);

  useEffect(() => {
    if (!staffEmbed) return;
    setCustomerId(staffEmbed.customerId);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  }, [staffEmbed]);

  useEffect(() => {
    if (staffEmbed) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchStaffScopedActiveCustomers(apiBase, authHeaders(), {
          canReadCustomers,
          canReadFiles,
        });
        if (!cancelled) setCustomers(list);
      } catch {
        if (!cancelled) setCustomers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, staffEmbed, canReadCustomers, canReadFiles]);

  useEffect(() => {
    if (!staffEmbed || columnGroupBy !== "customer") return;
    setColumnGroupBy("folder");
  }, [staffEmbed, columnGroupBy]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchText(searchDraft.trim());
      setPaginationModel((p) => ({ ...p, page: 0 }));
    }, 350);
    return () => window.clearTimeout(t);
  }, [searchDraft]);

  const sort = useMemo(() => sortModelToApiSort(sortModel), [sortModel]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    if (!silent) {
      setErr("");
      setLoading(true);
    }
    try {
      const res = await fetchJobsList(apiBase, authHeaders(), {
        page: paginationModel.page + 1,
        limit: paginationModel.pageSize,
        sort,
        status: status || undefined,
        customerId: customerId || undefined,
        searchText: searchText || undefined,
      });
      setJobs(res.data);
      setRowCount(res.total);
      setLastRefresh(nowLabel());
    } catch (e) {
      if (!silent) {
        setErr(e instanceof Error ? e.message : "Failed to load");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [
    apiBase,
    authHeaders,
    paginationModel.page,
    paginationModel.pageSize,
    sort,
    status,
    customerId,
    searchText,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const needsPoll = jobs.some((j) => j.status === "queued" || j.status === "processing");
  const [durationNow, setDurationNow] = useState(() => Date.now());
  useEffect(() => {
    if (!needsPoll) return;
    const t = window.setInterval(() => setDurationNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [needsPoll]);
  useEffect(() => {
    if (!needsPoll) return;
    const t = window.setInterval(() => void load({ silent: true }), 3000);
    return () => window.clearInterval(t);
  }, [needsPoll, load]);

  const handleRequeue = useCallback(
    async (jobId: string) => {
      setRequeueBusyId(jobId);
      setErr("");
      try {
        await requeueJob(apiBase, authHeaders(), jobId);
        await load({ silent: true });
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Re-run failed");
      } finally {
        setRequeueBusyId(null);
      }
    },
    [apiBase, authHeaders, load],
  );

  const gridRows = useMemo(() => jobs.map(jobToGridRow), [jobs]);

  const columns: GridColDef<JobGridRow>[] = useMemo(() => {
    const all: GridColDef<JobGridRow>[] = [
      { field: "fileName", headerName: "Document", flex: 1.5, minWidth: 210, sortable: false },
      { field: "customer", headerName: "Customer", flex: 1, minWidth: 160, sortable: false },
      { field: "folderName", headerName: "Folder", flex: 1, minWidth: 140, sortable: false },
      { field: "library", headerName: "Type", width: 100, sortable: false },
      {
        field: "pages",
        headerName: "Pages",
        width: 70,
        type: "number",
        align: "center",
        headerAlign: "center",
        sortable: false,
        valueFormatter: (value: number | null) => (value == null ? "—" : String(value)),
      },
      {
        field: "status",
        headerName: "Status",
        width: 130,
        renderCell: (p: GridRenderCellParams<JobGridRow>) => <JobStatusChip status={p.row.status} />,
      },
      {
        field: "percentCompleted",
        headerName: "Progress",
        width: 120,
        sortable: true,
        renderCell: (p: GridRenderCellParams<JobGridRow>) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%", pr: 1 }}>
            <LinearProgress
              variant="determinate"
              value={Math.min(100, p.row.percentCompleted)}
              sx={{ flex: 1, height: 6, borderRadius: 1 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ width: 36, textAlign: "right" }}>
              {p.row.percentCompleted}%
            </Typography>
          </Box>
        ),
      },
      {
        field: "duration",
        headerName: "Duration",
        width: 110,
        sortable: false,
        valueGetter: (_v, row) => jobDurationLabel(jobTimingFromGridRow(row), durationNow),
        renderCell: (p: GridRenderCellParams<JobGridRow>) => (
          <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
            {jobDurationLabel(jobTimingFromGridRow(p.row), durationNow)}
            {jobDurationSuffix({ status: p.row.status })}
          </Typography>
        ),
      },
      { field: "uploadedBy", headerName: "Uploaded By", width: 110, sortable: false },
      {
        field: "createdAt",
        headerName: "Created",
        width: 150,
        type: "dateTime",
        sortable: true,
        valueGetter: (_v, row) => row.createdAt,
        valueFormatter: (value: Date | null) => (value ? formatDateTime(value) : ""),
        filterOperators: gridDateColumnFilterOperators(true),
      },
    ];
    if (canCreateJob) {
      all.push({
        field: "actions",
        headerName: "",
        width: 96,
        sortable: false,
        filterable: false,
        align: "center",
        headerAlign: "center",
        renderCell: (p: GridRenderCellParams<JobGridRow>) =>
          jobCanRequeue(p.row.status) ? (
            <Button
              size="small"
              variant="outlined"
              disabled={requeueBusyId === p.row.id}
              onClick={(e) => {
                e.stopPropagation();
                void handleRequeue(p.row.id);
              }}
              sx={{ minWidth: 0, px: 1.25, py: 0.25, fontSize: "0.7rem", fontWeight: 700, textTransform: "none" }}
            >
              {requeueBusyId === p.row.id ? "…" : requeueButtonLabel(p.row.status)}
            </Button>
          ) : null,
      });
    }
    if (staffEmbed) {
      return all.filter((c) => c.field !== "customer");
    }
    return all;
  }, [staffEmbed, canCreateJob, requeueBusyId, handleRequeue, durationNow]);

  const resultLabel =
    !loading && rowCount > 0
      ? `${paginationModel.page * paginationModel.pageSize + 1}–${Math.min(
          (paginationModel.page + 1) * paginationModel.pageSize,
          rowCount,
        )} of ${rowCount.toLocaleString()}`
      : null;

  const gridSlots = useMemo(
    () => ({
      toolbar: () => <LiveToolbar lastRefresh={lastRefresh} live={needsPoll} />,
    }),
    [lastRefresh, needsPoll],
  );

  const jobsToolbarFilters = (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 1.5, minWidth: 0, flex: 1 }}>
      <FormControl size="small" sx={{ minWidth: 140 }}>
        <InputLabel id="jobs-status-filter">Status</InputLabel>
        <Select
          labelId="jobs-status-filter"
          label="Status"
          value={status}
          onChange={(e: SelectChangeEvent) => {
            setStatus(e.target.value);
            setPaginationModel((p) => ({ ...p, page: 0 }));
          }}
        >
          {STATUS_OPTIONS.map((o) => (
            <MenuItem key={o.value || "__all"} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      {!staffEmbed ? (
        <SearchableCustomerSelect
          customers={customers}
          value={customerId}
          onChange={(id) => {
            setCustomerId(id);
            setPaginationModel((p) => ({ ...p, page: 0 }));
          }}
          label="Customer"
          allowEmpty
          emptyLabel="All customers"
          size="small"
          className="min-w-[160px] max-w-[220px]"
        />
      ) : null}
      {view === "column" ? (
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel id="jobs-column-group">Group by</InputLabel>
          <Select
            labelId="jobs-column-group"
            label="Group by"
            value={columnGroupBy}
            onChange={(e: SelectChangeEvent) => setColumnGroupBy(e.target.value as ColumnGroupBy)}
          >
            {!staffEmbed ? <MenuItem value="customer">Customer</MenuItem> : null}
            <MenuItem value="folder">Folder</MenuItem>
            <MenuItem value="date">Date</MenuItem>
          </Select>
        </FormControl>
      ) : null}
      {status ? (
        <Chip
          size="small"
          variant="outlined"
          label={`Status: ${STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}`}
          onDelete={() => {
            setStatus("");
            setPaginationModel((p) => ({ ...p, page: 0 }));
          }}
        />
      ) : null}
      {searchText.trim() ? (
        <Chip
          size="small"
          variant="outlined"
          label={`Search: “${searchText.trim()}”`}
          onDelete={() => setSearchDraft("")}
        />
      ) : null}
    </Box>
  );

  return (
    <PageLayout
      embedded={Boolean(staffEmbed)}
      title="Jobs"
      subtitle={
        staffEmbed
          ? "Pipeline jobs for this customer. Refreshes while queued or processing."
          : "AI pipeline jobs for file processing. Refreshes while jobs are queued or processing."
      }
      actions={
        <PageActions
          search={searchDraft}
          onSearch={setSearchDraft}
          placeholder="Search jobs…"
          {...(canCreateJob
            ? {
                addLabel: "New job",
                onAdd: () =>
                  navigate(
                    staffEmbed
                      ? `/customers/${encodeURIComponent(staffEmbed.customerId)}/jobs/new`
                      : "/jobs/new",
                  ),
              }
            : {})}
        />
      }
    >
      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      ) : null}

      <Card variant="outlined" sx={{ bgcolor: "background.paper", overflow: "hidden" }}>
        <Box sx={CARD_TOOLBAR_SX}>
          {jobsToolbarFilters}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexShrink: 0 }}>
            {resultLabel ? (
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                {resultLabel} jobs
              </Typography>
            ) : null}
            <ViewSwitcher view={view} onChange={setView} />
          </Box>
        </Box>

        {view === "grid" ? (
          <Box sx={{ height: 660, width: "100%" }}>
            <DataGrid
              rows={gridRows}
              columns={columns}
              onRowClick={(params) => navigate(`/jobs/${params.row.id}`)}
              loading={loading}
              rowCount={rowCount}
              paginationMode="server"
              sortingMode="server"
              paginationModel={paginationModel}
              onPaginationModelChange={setPaginationModel}
              sortModel={sortModel}
              onSortModelChange={(model) => {
                setSortModel(model);
                setPaginationModel((p) => ({ ...p, page: 0 }));
              }}
              filterModel={filterModel}
              onFilterModelChange={setFilterModel}
              pageSizeOptions={[10, 20, 50]}
              disableRowSelectionOnClick
              slots={gridSlots}
              sx={{ ...ADMIN_DATA_GRID_SX, "& .MuiDataGrid-row": { cursor: "pointer" } }}
            />
          </Box>
        ) : (
          <Box sx={{ p: 2, minHeight: 400 }}>
            {loading ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                Loading jobs…
              </Typography>
            ) : view === "board" ? (
              <BoardView
                rows={gridRows}
                onOpen={(id) => navigate(`/jobs/${id}`)}
                canRequeue={canCreateJob}
                onRequeue={(id) => void handleRequeue(id)}
                requeueBusyId={requeueBusyId}
                durationNow={durationNow}
              />
            ) : (
              <ColumnView
                rows={gridRows}
                groupBy={columnGroupBy}
                onOpen={(id) => navigate(`/jobs/${id}`)}
                canRequeue={canCreateJob}
                onRequeue={(id) => void handleRequeue(id)}
                requeueBusyId={requeueBusyId}
              />
            )}
          </Box>
        )}
      </Card>
    </PageLayout>
  );
}
