import type { ReactElement } from "react";
import { useMemo } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { HelpLink } from "../components/HelpLink";
import { NotificationBell } from "../components/NotificationBell";
import { ThemeToggle } from "../components/ThemeToggle";
import { BRAND_LOGO_URL, PRACTICE_LEGAL_NAME } from "../constants";
import { useAuth } from "../auth/AuthContext";
import { portalCanAnyUpload, visiblePortalNavItems, type PortalNavKey } from "../auth/portalNav";

const topNavLink =
  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition sm:px-4 hover:bg-surface-muted hover:text-ink";
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

function IconInvoices({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`${svgBase} ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  );
}

function IconStatements({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`${svgBase} ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

function IconFiles({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`${svgBase} ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.16 3.1A2 2 0 0 0 7.47 2H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h16Z" />
    </svg>
  );
}

function IconSupport({ active }: { active: boolean }) {
  const c = active ? "text-brand" : "text-muted";
  return (
    <svg className={`${svgBase} ${c}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

const PORTAL_ICONS: Record<PortalNavKey, (p: { active: boolean }) => ReactElement> = {
  dash: IconDashboard,
  inv: IconInvoices,
  stmt: IconStatements,
  files: IconFiles,
};

export function CustomerPortalLayout() {
  const { logout, hasAnyPermission, customerName } = useAuth();
  const permCtx = useMemo(() => ({ hasAnyPermission }), [hasAnyPermission]);
  const navItems = useMemo(() => visiblePortalNavItems(permCtx), [permCtx]);
  const showUpload = useMemo(() => portalCanAnyUpload(permCtx), [permCtx]);
  const headerBrandName = customerName.trim() ? customerName.trim() : PRACTICE_LEGAL_NAME;

  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      <header className="border-b border-brand/10 bg-surface-raised shadow-sm">
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="flex min-w-0 shrink-0 items-center gap-3">
            <img src={BRAND_LOGO_URL} alt="" width={40} height={40} className="h-10 w-10 rounded-lg border border-border object-contain" />
            <div>
              <p className="min-w-0 break-words text-sm font-bold leading-tight text-brand">{headerBrandName}</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">Ledger v1.0</p>
            </div>
          </div>

          <nav className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-1 lg:justify-center" aria-label="Portal">
            {navItems.map(({ key, to, end, label }) => {
              const Icon = PORTAL_ICONS[key];
              return (
                <NavLink
                  key={key}
                  to={to}
                  end={end}
                  className={({ isActive }) => `${topNavLink} ${isActive ? topNavActive : "text-muted"}`}
                >
                  {({ isActive }) => (
                    <>
                      <Icon active={isActive} />
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="flex shrink-0 flex-wrap items-center justify-start gap-2 lg:justify-end">
            {showUpload ? (
              <button
                type="button"
                id="portal-new-upload-trigger"
                className="btn btn-primary btn-sm font-bold uppercase tracking-wide shadow-sm"
              >
                New upload
              </button>
            ) : null}
            <a
              href="mailto:support@example.com"
              className={`${topNavLink} text-muted normal-case`}
            >
              <IconSupport active={false} />
              <span>Support</span>
            </a>
            <HelpLink docPath="/docs/customer-portal/overview" />
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

      <main className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-hidden px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
