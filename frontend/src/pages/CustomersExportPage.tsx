import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { CustomersExportModal } from "../components/CustomersExportModal";
import { useAuth } from "../auth/AuthContext";
import type { CustomersListFilters } from "../utils/customersListFilters";

function filtersFromSearchParams(params: URLSearchParams): Partial<CustomersListFilters> {
  const formStatus = params.get("formStatus");
  const accountStatus = params.get("accountStatus");
  return {
    search: params.get("search")?.trim() ?? "",
    createdFrom: params.get("createdFrom")?.trim() ?? "",
    createdTo: params.get("createdTo")?.trim() ?? "",
    updatedFrom: params.get("updatedFrom")?.trim() ?? "",
    updatedTo: params.get("updatedTo")?.trim() ?? "",
    formStatus:
      formStatus === "draft" || formStatus === "completed" ? formStatus : "all",
    accountStatus:
      accountStatus === "draft" ||
      accountStatus === "active" ||
      accountStatus === "inactive" ||
      accountStatus === "proposed"
        ? accountStatus
        : "all",
  };
}

export default function CustomersExportPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { apiBase, authHeaders, authRequired, customerId, isAdmin } = useAuth();
  if (authRequired && customerId && !isAdmin) {
    return <Navigate to="/portal" replace />;
  }
  const initialFilters = filtersFromSearchParams(searchParams);
  const initialSearch = initialFilters.search ?? "";

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Export customers</h1>
          <p className="text-sm text-muted">Choose filters and columns, preview results, then export CSV or Excel.</p>
        </div>
      </div>
      <CustomersExportModal
        isOpen
        mode="page"
        onClose={() => navigate("/customers")}
        apiBase={apiBase}
        authHeaders={authHeaders}
        initialSearch={initialSearch}
        initialFilters={initialFilters}
      />
    </div>
  );
}
