import { Link, Outlet, useLocation } from "react-router-dom";
import { NotificationBell } from "../components/NotificationBell";
import { ThemeToggle } from "../components/ThemeToggle";
import { BRAND_LOGO_URL } from "../constants";
import { useAuth } from "../auth/AuthContext";
import { isClientOnboardingRoute } from "./clientOnboardingRoutes";

const navLink =
  "rounded-lg px-4 py-2 text-sm font-semibold transition hover:bg-surface-muted";
const navActive = "bg-brand/10 text-brand";

export function AppLayout() {
  const { authRequired, logout, isAdmin } = useAuth();
  const showJobsNav = !authRequired || isAdmin;
  const showStaffSettingsNav = !authRequired || isAdmin;
  const loc = useLocation();
  const path = loc.pathname;
  const stickyOnboardingNav = isClientOnboardingRoute(path);

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header
        className={`border-b border-brand/10 bg-surface-raised px-4 py-3 shadow-header ${
          stickyOnboardingNav ? "sticky top-0 z-40" : ""
        }`}
      >
        <div className="flex w-full min-w-0 items-center justify-between gap-4">
          <Link to="/customers" className="flex shrink-0 items-center gap-3">
            <img
              src={BRAND_LOGO_URL}
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-xl border border-border object-contain"
            />
            <span className="hidden text-sm font-semibold text-ink sm:inline">3k limited</span>
          </Link>

          <nav className="flex flex-1 items-center justify-center gap-1 sm:gap-2">
            <Link
              to="/customers"
              className={`${navLink} ${path.startsWith("/customers") ? navActive : "text-muted"}`}
            >
              Customers
            </Link>
            {showJobsNav ? (
              <Link
                to="/files"
                className={`${navLink} ${path.startsWith("/files") ? navActive : "text-muted"}`}
              >
                Files
              </Link>
            ) : null}
            {showJobsNav ? (
              <Link
                to="/jobs"
                className={`${navLink} ${path.startsWith("/jobs") ? navActive : "text-muted"}`}
              >
                Jobs
              </Link>
            ) : null}
            {showStaffSettingsNav ? (
              <Link
                to="/settings"
                className={`${navLink} ${path.startsWith("/settings") ? navActive : "text-muted"}`}
              >
                Settings
              </Link>
            ) : null}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <NotificationBell />
            <ThemeToggle />
            {authRequired ? (
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink shadow-sm hover:bg-surface-muted"
              >
                Sign out
              </button>
            ) : (
              <span className="w-16" />
            )}
          </div>
        </div>
      </header>
      <main className="w-full min-w-0 flex-1 overflow-x-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}