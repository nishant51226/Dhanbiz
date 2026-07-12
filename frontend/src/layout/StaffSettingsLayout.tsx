import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const subNavItem =
  "inline-flex rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-surface-muted";

type Auth = ReturnType<typeof useAuth>;

const allLinks: readonly { to: string; label: string; end: boolean; visible: (a: Auth) => boolean }[] = [
  {
    to: "/settings/information",
    label: "Basic information",
    end: true,
    visible: (a) => a.isAdmin || a.hasPermission("settings:read") || a.hasPermission("settings:write"),
  },
  {
    to: "/settings/subscription",
    label: "Subscription",
    end: false,
    visible: (a) => a.isAdmin || a.hasAnyPermission(["subscription_plan:read", "subscription_plan:write"]),
  },
  { to: "/settings/users", label: "Users", end: true, visible: (a) => a.isAdmin },
  { to: "/settings/roles", label: "Roles", end: true, visible: (a) => a.isAdmin },
  { to: "/settings/notifications", label: "Notifications", end: true, visible: (a) => a.isAdmin },
  {
    to: "/settings/queue",
    label: "Queue",
    end: true,
    visible: (a) => a.isAdmin || a.hasPermission("job:read"),
  },
];

export function StaffSettingsLayout() {
  const auth = useAuth();
  const links = allLinks.filter((l) => l.visible(auth));

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <nav aria-label="Settings sections">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Settings</p>
        <ul className="flex flex-row flex-wrap gap-1 border-b border-border pb-2">
          {links.map(({ to, label, end }) => (
            <li key={to} className="shrink-0">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `${subNavItem} ${isActive ? "border border-brand/30 bg-brand/10 text-brand" : "text-muted"}`
                }
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
