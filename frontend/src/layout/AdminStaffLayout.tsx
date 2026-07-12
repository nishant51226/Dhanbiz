import type { ReactElement } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { HelpLink } from "../components/HelpLink";
import { NotificationBell } from "../components/NotificationBell";
import { ThemeToggle } from "../components/ThemeToggle";
import { BRAND_LOGO_URL, PRACTICE_LEGAL_NAME } from "../constants";
import { useAuth } from "../auth/AuthContext";
import { isClientOnboardingRoute } from "./clientOnboardingRoutes";

const topNavLink =
  "rounded-lg px-3 py-2 text-sm font-semibold transition sm:px-4 hover:bg-surface-muted hover:text-ink";
const topNavActive = "bg-brand/10 text-brand";

const svgBase = "h-4 w-4 shrink-0 sm:h-5 sm:w-5";

function IconDashboard({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`${svgBase} ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
      <path d="M14 6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V6Z" />
      <path d="M4 16a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2Z" />
      <path d="M14 16a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2Z" />
    </svg>
  );
}

function IconCustomers({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`${svgBase} ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconFileTasks({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`${svgBase} ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
      <path d="M10 13h4" />
      <path d="M10 17h4" />
    </svg>
  );
}

function IconFiles({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`${svgBase} ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.17a2 2 0 0 1-1.41-.59L9.17 3.59A2 2 0 0 0 7.76 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <path d="M8 10h8M8 14h5" />
    </svg>
  );
}

function IconReports({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`${svgBase} ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3v18h18" />
      <path d="M7 16l4-6 4 3 5-8" />
    </svg>
  );
}

function IconSubscription({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`${svgBase} ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </svg>
  );
}

function IconSettings({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`${svgBase} ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

type NavEntry = {
  key: string;
  to: string;
  end?: boolean;
  label: string;
  Icon: (p: { active: boolean }) => ReactElement;
  visible: boolean;
};

export function AdminStaffLayout() {
  const { pathname } = useLocation();
  const stickyOnboardingNav = isClientOnboardingRoute(pathname);
  const { logout, isAdmin, customerId, customerName, roleNames, hasPermission, hasAnyPermission, portalHomePath } =
    useAuth();
  const isPortalScopedUser = Boolean(customerId && !isAdmin);
  const headerBrandName = customerName.trim() ? customerName.trim() : PRACTICE_LEGAL_NAME;
  const roleLabel = isAdmin ? "Superadmin" : roleNames.length > 0 ? roleNames.join(" | ") : "Staff";
  const showDashboard = !isPortalScopedUser && (isAdmin || hasPermission("dashboard:read"));
  const showCustomers = !isPortalScopedUser && (isAdmin || hasPermission("customer:read"));
  const showJobs = !isPortalScopedUser && (isAdmin || hasPermission("job:read"));
  const showReports = !isPortalScopedUser && (isAdmin || hasPermission("report:read"));
  const showFiles =
    isAdmin ||
    (isPortalScopedUser
      ? hasAnyPermission(["portal:file:read", "portal:file:write", "portal:file:delete"])
      : hasAnyPermission(["file:read", "file:write", "file:delete"]));
  const showSettings =
    isAdmin ||
    (isPortalScopedUser
      ? hasAnyPermission(["portal:settings:read", "portal:settings:write"])
      : hasAnyPermission([
          "settings:read",
          "settings:write",
          "subscription_plan:read",
          "subscription_plan:write",
        ]));
  const showPortalSubscription =
    isPortalScopedUser &&
    Boolean(customerId) &&
    hasAnyPermission(["subscription_plan:read", "subscription_plan:write"]);

  const showPortalDashboardNav =
    isPortalScopedUser &&
    Boolean(customerId) &&
    (isAdmin || hasPermission("portal:dashboard:read") || hasPermission("customer:read"));

  const entries: NavEntry[] = [
    ...(showPortalDashboardNav
      ? [
          {
            key: "portal-dash",
            to: portalHomePath ?? `/customers/${customerId}/dashboard`,
            end: true,
            label: "Dashboard",
            Icon: IconDashboard,
            visible: true,
          } satisfies NavEntry,
        ]
      : []),
    ...(showPortalSubscription
      ? [
          {
            key: "portal-subscription",
            to: `/customers/${customerId}/subscription`,
            label: "Subscription",
            Icon: IconSubscription,
            visible: true,
          } satisfies NavEntry,
        ]
      : []),
    { key: "dash", to: "/dashboard", end: true, label: "Dashboard", Icon: IconDashboard, visible: showDashboard },
    {
      key: "files",
      to: isPortalScopedUser ? `/customers/${customerId}/library-documents` : "/files",
      label: "Files",
      Icon: IconFiles,
      visible: showFiles,
    },
    {
      key: "jobs",
      to: isPortalScopedUser ? `/customers/${customerId}/jobs` : "/jobs",
      label: "Jobs",
      Icon: IconFileTasks,
      visible: showJobs,
    },
    { key: "cust", to: "/customers", label: "Customers", Icon: IconCustomers, visible: showCustomers },
    {
      key: "reports",
      to: "/reports",
      end: false,
      label: "Reports",
      Icon: IconReports,
      visible: showReports,
    },
    {
      key: "set",
      to: isPortalScopedUser ? `/customers/${customerId}/settings` : "/settings",
      label: "Settings",
      Icon: IconSettings,
      visible: showSettings,
    },
  ].filter((e) => e.visible);

  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <header
        className={`border-b border-brand/10 bg-surface-raised shadow-sm ${
          stickyOnboardingNav ? "sticky top-0 z-40" : ""
        }`}
      >
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <img src={BRAND_LOGO_URL} alt="" width={40} height={40} className="h-10 w-10 rounded-lg border border-border object-contain" />
            <div>
              <p className="min-w-0 break-words text-sm font-bold leading-tight text-brand">{headerBrandName}</p>
              <p className="text-[10px] font-semibold tracking-[0.12em] text-muted">{roleLabel}</p>
            </div>
          </div>

          <nav className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-1 lg:justify-center" aria-label="Main">
            {entries.map(({ key, to, end, label, Icon }) => (
              <NavLink
                key={key}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 ${topNavLink} ${isActive ? topNavActive : "text-muted"}`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon active={isActive} />
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center justify-start gap-2 lg:justify-end">
            <HelpLink docPath={isAdmin ? "/docs/admin/overview" : "/docs/staff/dashboard"} />
            <NotificationBell />
            <ThemeToggle />
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-surface-muted"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto min-h-0 w-full max-w-[1600px] flex-1 overflow-auto px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
