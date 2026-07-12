import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { STAFF_REPORTS, reportBasePath } from "../reports/reportsCatalog";

const subNavItem =
  "inline-block rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-surface-muted hover:text-ink";

export function ReportsLayout() {
  const { isAdmin } = useAuth();
  const visibleReports = STAFF_REPORTS.filter((r) => !r.adminOnly || isAdmin);

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <aside className="min-w-0 shrink-0 lg:w-52">
        <div>
          <h1 className="text-xl font-bold text-ink">Reports</h1>
          <p className="mt-1 text-sm text-muted">Operational insights for document parsing and AI usage.</p>
        </div>
        <nav aria-label="Reports" className="mt-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Available reports</p>
          <ul className="flex flex-row flex-wrap gap-1 lg:flex-col lg:gap-0.5">
            {visibleReports.map((report) => (
              <li key={report.id} className="shrink-0 lg:w-full">
                <NavLink
                  to={reportBasePath(report)}
                  end
                  className={({ isActive }) =>
                    `${subNavItem} block lg:w-full ${isActive ? "border border-brand/30 bg-brand/10 text-brand" : "text-muted"}`
                  }
                >
                  {report.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
