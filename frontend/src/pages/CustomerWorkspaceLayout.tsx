import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import ArrowBackOutlined from "@mui/icons-material/ArrowBackOutlined";
import { fetchCustomer, fetchLatestCustomerFormSubmission } from "../api/client";
import { accountStatusForCustomerDisplay } from "../utils/customerAccountStatusFromPageRow";
import { mergedOnboardingDataForCustomer } from "../utils/customerOnboardingDisplayRoot";
import { CustomerAccountStatusChip } from "../components/admin/CustomerAccountStatusChip";
import { useAuth } from "../auth/AuthContext";
import {
  buildWorkspaceTabCtx,
  firstAccessibleWorkspaceTab,
  workspaceTabVisible,
  type CustomerWorkspaceTab,
} from "../auth/customerWorkspaceNav";
import type { Customer, CustomerAccountStatus, CustomerFormSubmission } from "../types/api";
import type { CustomerWorkspaceOutletContext } from "./customerWorkspaceContext";
import { formatDate } from "../utils/formatDate";

function IconDetails({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`h-4 w-4 shrink-0 ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10v6M12 7h.01" />
    </svg>
  );
}

function IconDashboard({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`h-4 w-4 shrink-0 ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function IconLibraryDocuments({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`h-4 w-4 shrink-0 ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.17a2 2 0 0 1-1.41-.59L9.17 3.59A2 2 0 0 0 7.76 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <path d="M8 10h8M8 14h5" />
    </svg>
  );
}

function IconWorkspaceJobs({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`h-4 w-4 shrink-0 ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
      <path d="M10 13h4" />
      <path d="M10 17h4" />
    </svg>
  );
}

function IconWorkspaceSettings({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`h-4 w-4 shrink-0 ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const ALL_NAV: { segment: CustomerWorkspaceTab; label: string; Icon: typeof IconDetails }[] = [
  { segment: "dashboard", label: "Dashboard", Icon: IconDashboard },
  { segment: "details", label: "Details", Icon: IconDetails },
  { segment: "library-documents", label: "Files", Icon: IconLibraryDocuments },
  { segment: "jobs", label: "Jobs", Icon: IconWorkspaceJobs },
  { segment: "settings", label: "Settings", Icon: IconWorkspaceSettings },
];

const workspaceNavLink =
  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-[13px] font-semibold transition hover:bg-surface-muted hover:text-ink";
const workspaceNavActive = "bg-brand/10 text-brand";

function workspaceAccountStatusPresentation(
  status: CustomerAccountStatus | undefined,
): { label: string; dotClass: string } {
  const s = status ?? "draft";
  if (s === "active") return { label: "Active", dotClass: "bg-emerald-500" };
  if (s === "inactive") return { label: "Inactive", dotClass: "bg-slate-400" };
  if (s === "proposed") return { label: "Proposed", dotClass: "bg-violet-400" };
  return { label: "Draft", dotClass: "bg-amber-500" };
}

function isWorkspaceTab(seg: string | undefined): seg is CustomerWorkspaceTab {
  return (
    seg === "dashboard" ||
    seg === "details" ||
    seg === "subscription" ||
    seg === "users" ||
    seg === "forms" ||
    seg === "library-documents" ||
    seg === "jobs" ||
    seg === "settings"
  );
}

export default function CustomerWorkspaceLayout() {
  const { customerId } = useParams<{ customerId: string }>();
  const { pathname } = useLocation();
  const {
    apiBase,
    authHeaders,
    authRequired,
    customerId: jwtCid,
    customerName: authCustomerName,
    customerAccountStatus: authCustomerAccountStatus,
    isAdmin,
    hasPermission,
    hasAnyPermission,
    permissions,
    permissionsReady,
    portalHomePath,
  } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [latestSubmission, setLatestSubmission] = useState<CustomerFormSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const isPortalScopedUser = Boolean(authRequired && jwtCid && !isAdmin);

  const tabCtx = useMemo(
    () => buildWorkspaceTabCtx(isAdmin, permissions, hasPermission, hasAnyPermission, isPortalScopedUser),
    [isAdmin, hasPermission, hasAnyPermission, isPortalScopedUser, permissions],
  );

  const visibleNav = useMemo(() => ALL_NAV.filter((item) => workspaceTabVisible(item.segment, tabCtx)), [tabCtx]);

  const authFallbackCustomer = useMemo((): Customer | null => {
    if (!jwtCid || !isPortalScopedUser) return null;
    return {
      id: jwtCid,
      name: authCustomerName.trim() || "Customer",
      accountStatus: authCustomerAccountStatus ?? undefined,
    };
  }, [authCustomerAccountStatus, authCustomerName, isPortalScopedUser, jwtCid]);

  const accountStatus = useMemo(
    () => accountStatusForCustomerDisplay(customer ?? authFallbackCustomer, latestSubmission),
    [authFallbackCustomer, customer, latestSubmission],
  );

  const accountPresentation = workspaceAccountStatusPresentation(accountStatus);

  const displayName =
    customer?.name?.trim() ||
    authCustomerName.trim() ||
    (loading ? "…" : "Customer");

  const reload = useCallback(async () => {
    if (!customerId) return;
    setErr("");
    setLoading(true);
    try {
      const headers = authHeaders();
      const [c, latestSubmission] = await Promise.all([
        fetchCustomer(apiBase, headers, customerId),
        fetchLatestCustomerFormSubmission(apiBase, headers, customerId).catch(() => null),
      ]);
      setLatestSubmission(latestSubmission);
      const mergedOnboarding = mergedOnboardingDataForCustomer(c, latestSubmission);
      setCustomer(
        mergedOnboarding !== null
          ? { ...c, onboardingData: mergedOnboarding }
          : c,
      );
    } catch (e) {
      if (isPortalScopedUser && jwtCid) {
        setCustomer({
          id: jwtCid,
          name: authCustomerName.trim() || "Customer",
          accountStatus: authCustomerAccountStatus ?? undefined,
        });
        setLatestSubmission(null);
        setErr("");
      } else {
        setErr(e instanceof Error ? e.message : "Failed to load customer");
      }
    } finally {
      setLoading(false);
    }
  }, [
    apiBase,
    authCustomerAccountStatus,
    authCustomerName,
    authHeaders,
    customerId,
    isPortalScopedUser,
    jwtCid,
  ]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (authRequired && jwtCid && !isAdmin) {
    if (!customerId || customerId !== jwtCid) {
      return <Navigate to={portalHomePath ?? `/customers/${jwtCid}/dashboard`} replace />;
    }
  }

  if (!customerId) {
    return <Navigate to="/customers" replace />;
  }

  const pathParts = pathname.split("/").filter(Boolean);
  const lastSeg = pathParts[pathParts.length - 1];
  /** Avoid redirect before `/auth/me` — `hasPermission` is false while loading, which wrongly sends Files → dashboard. */
  if (
    permissionsReady &&
    isWorkspaceTab(lastSeg) &&
    !workspaceTabVisible(lastSeg, tabCtx)
  ) {
    const fallback = firstAccessibleWorkspaceTab(tabCtx);
    if (fallback && fallback !== lastSeg) {
      return <Navigate to={`/customers/${customerId}/${fallback}`} replace />;
    }
    if (!fallback) {
      return (
        <div className="mx-auto max-w-lg px-4 py-12 text-center">
          <h1 className="text-lg font-semibold text-ink">No access</h1>
          <p className="mt-2 text-sm text-muted">
            Your account does not have permission to open any section. Contact your practice administrator.
          </p>
        </div>
      );
    }
  }

  const ctx: CustomerWorkspaceOutletContext = { customer, loading, err, reload };

  const since = customer?.createdAt != null ? formatDate(customer.createdAt) : null;

  return (
    <div className="flex min-h-[calc(100vh-10rem)] w-full min-w-0 flex-col">
      <div className="shrink-0 border-b border-border bg-surface-raised px-4 py-3 md:px-6">
        {!isPortalScopedUser ? (
          <div className="relative flex min-h-[56px] items-center justify-center">
            <Link
              to="/customers"
              className="absolute left-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted transition hover:bg-surface-muted hover:text-ink"
            >
              <ArrowBackOutlined sx={{ fontSize: 16 }} aria-hidden />
              Customers
            </Link>
            <div className="min-w-0 max-w-full px-20 text-center">
              <p
                className="truncate text-base font-bold leading-snug text-ink md:text-lg"
                style={{ fontFamily: "'Newsreader', Georgia, 'Times New Roman', serif" }}
                title={displayName !== "Customer" && displayName !== "…" ? displayName : undefined}
              >
                {displayName}
              </p>
              <div className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                <CustomerAccountStatusChip status={accountStatus} />
                {since ? <span className="text-[11px] text-muted-soft">Since {since}</span> : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="text-base font-bold leading-snug text-ink md:text-[17px]"
                style={{ fontFamily: "'Newsreader', Georgia, 'Times New Roman', serif" }}
              >
                {displayName}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accountPresentation.dotClass}`} aria-hidden />
                  {accountPresentation.label}
                </span>
                {since ? <span className="text-muted-soft">Since {since}</span> : null}
              </div>
            </div>
            {workspaceTabVisible("dashboard", tabCtx) ? (
              <NavLink
                to={`/customers/${customerId}/dashboard`}
                className={({ isActive }) =>
                  `inline-flex shrink-0 items-center rounded-lg border px-3 py-2 text-xs font-semibold uppercase tracking-wide transition sm:text-[13px] sm:normal-case sm:tracking-normal ${
                    isActive
                      ? "border-brand/40 bg-brand/10 text-brand"
                      : "border-border bg-surface-muted/50 text-muted hover:border-border-subtle hover:bg-surface-muted hover:text-ink"
                  }`
                }
              >
                Dashboard
              </NavLink>
            ) : null}
          </div>
        )}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        {!isPortalScopedUser ? (
          <aside
            className="shrink-0 border-b border-border bg-surface-muted/30 md:w-52 md:border-b-0 md:border-r md:py-5 lg:w-56"
            aria-label="Customer workspace sections"
          >
            <nav className="flex gap-1 overflow-x-auto px-3 py-2 md:flex-col md:overflow-visible md:px-3 md:py-0" aria-label="Customer workspace">
              {visibleNav.map(({ segment, label, Icon }) => (
                <NavLink
                  key={segment}
                  to={`/customers/${customerId}/${segment}`}
                  className={({ isActive }) =>
                    `${workspaceNavLink} shrink-0 ${isActive ? workspaceNavActive : "text-muted"}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon active={isActive} />
                      {label}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </aside>
        ) : null}
        <main
          className={`min-h-0 min-w-0 flex-1 bg-surface ${
            isPortalScopedUser ? "px-4 py-6 md:px-8 md:py-8" : "px-4 py-5 md:px-6 md:py-6"
          }`}
        >
          <Outlet context={ctx} />
        </main>
      </div>
    </div>
  );
}
