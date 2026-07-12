import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AddOutlined from "@mui/icons-material/AddOutlined";
import ArchiveOutlined from "@mui/icons-material/ArchiveOutlined";
import DownloadOutlined from "@mui/icons-material/DownloadOutlined";
import FilterListOutlined from "@mui/icons-material/FilterListOutlined";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Tooltip,
  Typography,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridSortModel,
} from "@mui/x-data-grid";
import { archiveDraftCustomer, fetchCustomersPageWithSubmissionData } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Can } from "../auth/Can";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { CustomersListFiltersPanel } from "../components/CustomersListFiltersPanel";
import { BusinessTypeModal } from "../components/BussinessTypeModal";
import { CustomerAccountStatusChip } from "../components/admin/CustomerAccountStatusChip";
import { ADMIN_DATA_GRID_SX } from "../components/admin/adminDataGridSx";
import { PageActions } from "../components/admin/PageActions";
import { PageLayout } from "../components/admin/PageLayout";
import type { CustomerAccountStatus, CustomerPageRowWithSubmission } from "../types/api";
import { reviveCustomerOnboarding } from "../types/customerOnboarding";
import {
  mapOnboardingToCustomerTableFields,
  subscriptionPlanDisplayName,
} from "../utils/customerListFromOnboarding";
import {
  customersListFiltersExportSearchParams,
  customersListFiltersToExportFilters,
  EMPTY_CUSTOMERS_LIST_FILTERS,
  hasActiveCustomersListFilters,
  type CustomersListFilters,
} from "../utils/customersListFilters";
import { formatDateTime } from "../utils/formatDate";

const SORT_OPTIONS = [
  { value: "name,ASC", label: "Name A–Z" },
  { value: "name,DESC", label: "Name Z–A" },
  { value: "createdAt,DESC", label: "Created newest" },
  { value: "createdAt,ASC", label: "Created oldest" },
] as const;

type CustomerGridRow = {
  id: string;
  name: string;
  accountStatus: CustomerAccountStatus;
  threeKRef: string;
  businessType: string;
  city: string;
  email: string;
  vatNumber: string;
  servicesInPack: string;
  createdAt: string;
};

function pageRowToGridRow(row: CustomerPageRowWithSubmission): CustomerGridRow {
  const merged: Record<string, unknown> = {
    ...row.latestFormSubmission?.data,
    ...row.onboardingData,
  };
  const d = reviveCustomerOnboarding(merged);
  const mapped = mapOnboardingToCustomerTableFields(d);
  const planName = subscriptionPlanDisplayName(d, row.planName);
  const threeK = d.agent?.client_reference?.trim();
  return {
    id: row.id,
    name: row.name,
    accountStatus: row.accountStatus ?? "draft",
    threeKRef: threeK || "—",
    businessType: mapped.businessType || "—",
    city: mapped.city || "—",
    email: mapped.email || "—",
    vatNumber: mapped.vatNumber || "—",
    servicesInPack: planName ?? mapped.servicesInPack?.join(", ") ?? "—",
    createdAt: row.createdAt,
  };
}

function customerDestination(status: CustomerAccountStatus, id: string): string {
  return status === "draft" ? `/customers/${id}/onboarding` : `/customers/${id}`;
}

function sortModelToApiSort(model: GridSortModel): string {
  const first = model[0];
  if (!first?.sort) return "name,ASC";
  const dir = first.sort === "asc" ? "ASC" : "DESC";
  if (first.field === "name") return `name,${dir}`;
  if (first.field === "createdAt") return `createdAt,${dir}`;
  return "name,ASC";
}

function apiSortToSortModel(sort: string): GridSortModel {
  const [field, dir] = sort.split(",");
  if (field === "createdAt") return [{ field: "createdAt", sort: dir === "DESC" ? "desc" : "asc" }];
  return [{ field: "name", sort: dir === "DESC" ? "desc" : "asc" }];
}

export default function CustomersPage() {
  const { authRequired, customerId, isAdmin } = useAuth();
  if (authRequired && customerId && !isAdmin) {
    return <Navigate to="/portal" replace />;
  }
  return <CustomersPageContent />;
}

function CustomersPageContent() {
  const navigate = useNavigate();
  const { apiBase, authHeaders, hasPermission } = useAuth();
  const canWriteCustomers = hasPermission("customer:write");

  const [rows, setRows] = useState<CustomerGridRow[]>([]);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({ page: 0, pageSize: 10 });
  const [sortModel, setSortModel] = useState<GridSortModel>([{ field: "name", sort: "asc" }]);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchText, setSearchText] = useState("");
  const [listFilters, setListFilters] = useState<CustomersListFilters>(EMPTY_CUSTOMERS_LIST_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rowCount, setRowCount] = useState(0);
  const [showBusinessModal, setShowBusinessModal] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState<
    { open: true; customer: CustomerGridRow } | { open: false }
  >({ open: false });
  const [archiveBusy, setArchiveBusy] = useState(false);

  const sort = useMemo(() => sortModelToApiSort(sortModel), [sortModel]);

  const apiFilters = useMemo(
    () => customersListFiltersToExportFilters({ ...listFilters, search: searchText }),
    [listFilters, searchText],
  );

  const activeFilterCount = useMemo(() => {
    const withSearch = { ...listFilters, search: searchText };
    return Object.keys(customersListFiltersToExportFilters(withSearch)).length;
  }, [listFilters, searchText]);

  const exportHref = `/customers/export${customersListFiltersExportSearchParams({ ...listFilters, search: searchText })}`;

  useEffect(() => {
    const t = globalThis.setTimeout(() => {
      setSearchText(searchDraft.trim());
      setPaginationModel((p) => ({ ...p, page: 0 }));
    }, 350);
    return () => globalThis.clearTimeout(t);
  }, [searchDraft]);

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const res = await fetchCustomersPageWithSubmissionData(apiBase, authHeaders(), {
        page: paginationModel.page + 1,
        limit: paginationModel.pageSize,
        ...(sort === "name,ASC" ? {} : { sort }),
        searchText: searchText,
        filters: apiFilters,
      });
      setRows(res.data.map(pageRowToGridRow));
      setRowCount(res.total);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load customers");
      setRows([]);
      setRowCount(0);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders, paginationModel.page, paginationModel.pageSize, searchText, sort, apiFilters]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleArchiveConfirm = async () => {
    if (!archiveConfirm.open) return;
    setArchiveBusy(true);
    setErr("");
    try {
      await archiveDraftCustomer(apiBase, authHeaders(), archiveConfirm.customer.id);
      setArchiveConfirm({ open: false });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not archive customer");
    } finally {
      setArchiveBusy(false);
    }
  };

  const columns: GridColDef<CustomerGridRow>[] = useMemo(() => {
    const base: GridColDef<CustomerGridRow>[] = [
      {
        field: "threeKRef",
        headerName: "3K Ref",
        width: 168,
        sortable: false,
        valueFormatter: (value) => (typeof value === "string" && value !== "—" ? value : "—"),
      },
      {
        field: "name",
        headerName: "Client name",
        flex: 1,
        minWidth: 200,
        sortable: true,
        renderCell: (params) => (
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, width: "100%" }}
            noWrap
            title={params.value as string}
          >
            {params.value}
          </Typography>
        ),
      },
      {
        field: "businessType",
        headerName: "Entity type",
        width: 130,
        sortable: false,
      },
      { field: "city", headerName: "City", width: 120, sortable: false },
      {
        field: "email",
        headerName: "Email",
        width: 200,
        sortable: false,
        renderCell: (params) => (
          <Typography variant="body2" color="text.secondary" noWrap title={params.value as string}>
            {params.value}
          </Typography>
        ),
      },
      { field: "vatNumber", headerName: "VAT no", width: 110, sortable: false },
      {
        field: "servicesInPack",
        headerName: "Services in pack",
        width: 200,
        sortable: false,
        renderCell: (params) => (
          <Typography variant="body2" color="text.secondary" noWrap title={params.value as string}>
            {params.value}
          </Typography>
        ),
      },
      {
        field: "accountStatus",
        headerName: "Status",
        width: 108,
        sortable: false,
        renderCell: (params) => <CustomerAccountStatusChip status={params.value as CustomerAccountStatus} />,
      },
      {
        field: "createdAt",
        headerName: "Created",
        width: 168,
        sortable: true,
        renderCell: (params) => (
          <Typography variant="body2" color="text.secondary" noWrap>
            {typeof params.value === "string" ? formatDateTime(params.value) : "—"}
          </Typography>
        ),
      },
    ];

    if (canWriteCustomers) {
      base.push({
        field: "actions",
        headerName: "",
        width: 56,
        sortable: false,
        filterable: false,
        align: "center",
        headerAlign: "center",
        renderCell: (params) =>
          params.row.accountStatus === "draft" ? (
            <Tooltip title="Archive draft">
              <span>
                <IconButton
                  size="small"
                  color="error"
                  aria-label="Archive draft customer"
                  disabled={archiveBusy}
                  onClick={(e) => {
                    e.stopPropagation();
                    setArchiveConfirm({ open: true, customer: params.row });
                  }}
                >
                  <ArchiveOutlined fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          ) : null,
      });
    }

    return base;
  }, [canWriteCustomers, archiveBusy]);

  const resultLabel =
    !loading && rowCount > 0
      ? `${paginationModel.page * paginationModel.pageSize + 1}–${Math.min(
          (paginationModel.page + 1) * paginationModel.pageSize,
          rowCount,
        )} of ${rowCount.toLocaleString()}`
      : null;

  return (
    <PageLayout
      title="Customers"
      subtitle="Browse client accounts, onboarding status, and subscription details."
      actions={
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Can permission="customer:read">
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadOutlined sx={{ fontSize: 16 }} />}
              onClick={() => navigate(exportHref)}
              sx={{ fontWeight: 600, fontSize: 13, height: 36, borderRadius: 1.5, whiteSpace: "nowrap" }}
            >
              Export data
            </Button>
          </Can>
          <PageActions
            search={searchDraft}
            onSearch={setSearchDraft}
            placeholder="Search customers…"
          />
          <Can permission="customer:write">
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<AddOutlined sx={{ fontSize: 16 }} />}
              disableElevation
              onClick={() => setShowBusinessModal(true)}
              sx={{ fontWeight: 600, fontSize: 13, height: 36, px: 2, borderRadius: 1.5, whiteSpace: "nowrap" }}
            >
              Add customer
            </Button>
          </Can>
        </Box>
      }
    >
      {err ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
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
            flexWrap: "wrap",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", minWidth: 0 }}>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel id="customers-sort">Sort</InputLabel>
              <Select
                labelId="customers-sort"
                label="Sort"
                value={sort}
                onChange={(e: SelectChangeEvent) => {
                  setSortModel(apiSortToSortModel(e.target.value));
                  setPaginationModel((p) => ({ ...p, page: 0 }));
                }}
              >
                {SORT_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              size="small"
              variant={showFilters ? "contained" : "outlined"}
              startIcon={<FilterListOutlined sx={{ fontSize: 16 }} />}
              onClick={() => setShowFilters((v) => !v)}
              sx={{ fontWeight: 600, height: 36, borderRadius: 1.5 }}
            >
              Filters
              {activeFilterCount > 0 ? (
                <Chip
                  label={activeFilterCount}
                  size="small"
                  color="primary"
                  sx={{ ml: 1, height: 20, minWidth: 20, "& .MuiChip-label": { px: 0.75, fontSize: 11 } }}
                />
              ) : null}
            </Button>
            {hasActiveCustomersListFilters({ ...listFilters, search: searchText }) ? (
              <Button
                size="small"
                onClick={() => {
                  setListFilters(EMPTY_CUSTOMERS_LIST_FILTERS);
                  setSearchDraft("");
                  setSearchText("");
                  setPaginationModel((p) => ({ ...p, page: 0 }));
                }}
                sx={{ fontWeight: 600 }}
              >
                Clear all
              </Button>
            ) : null}
          </Box>
          {resultLabel ? (
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
              Showing {resultLabel} customers
            </Typography>
          ) : null}
        </Box>

        {showFilters ? (
          <Box sx={{ px: 2, py: 2, borderBottom: "1px solid", borderColor: "divider", bgcolor: "background.paper" }}>
            <CustomersListFiltersPanel
              embedded
              filters={listFilters}
              hideSearch
              disabled={loading}
              onChange={(next) => {
                setListFilters(next);
                setPaginationModel((p) => ({ ...p, page: 0 }));
              }}
              onClear={() => {
                setListFilters(EMPTY_CUSTOMERS_LIST_FILTERS);
                setPaginationModel((p) => ({ ...p, page: 0 }));
              }}
            />
          </Box>
        ) : null}

        <Box sx={{ height: 640, width: "100%" }}>
          <DataGrid
            rows={rows}
            columns={columns}
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
            pageSizeOptions={[10, 20, 50]}
            disableColumnResize
            disableRowSelectionOnClick
            onRowClick={(params) => navigate(customerDestination(params.row.accountStatus, params.row.id))}
            localeText={{
              noRowsLabel: loading ? "Loading…" : "No customers match your filters.",
            }}
            sx={ADMIN_DATA_GRID_SX}
          />
        </Box>
      </Card>

      <BusinessTypeModal isOpen={showBusinessModal} onClose={() => setShowBusinessModal(false)} />

      <ConfirmDialog
        open={archiveConfirm.open}
        title={archiveConfirm.open ? `Archive draft customer "${archiveConfirm.customer.name}"?` : ""}
        message={
          archiveConfirm.open
            ? "This removes the customer from lists and staff assignments. Only draft customers can be archived. This cannot be undone from the app."
            : ""
        }
        confirmLabel="Archive"
        confirmColor="error"
        busy={archiveBusy}
        onCancel={() => {
          if (archiveBusy) return;
          setArchiveConfirm({ open: false });
        }}
        onConfirm={() => void handleArchiveConfirm()}
      />
    </PageLayout>
  );
}
