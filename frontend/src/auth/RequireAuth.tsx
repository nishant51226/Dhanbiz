import { Navigate } from "react-router-dom";
import { BRAND_LOGO_URL } from "../constants";
import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { authRequired, authLoading, authStatusError, token, apiBase, meLoadState, refetchMe, logout } = useAuth();

  if (authStatusError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface px-4 text-center text-sm text-muted">
        <img src={BRAND_LOGO_URL} alt="" width={56} height={56} className="h-14 w-14 rounded-xl opacity-90" />
        <p className="max-w-md">
          Could not reach{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs text-brand">{apiBase}/api/auth/status</code>.
          Check that the API is running and{" "}
          <code className="rounded bg-surface-muted px-1 py-0.5 font-mono text-xs text-brand">VITE_API_BASE</code> matches
          your backend URL, then refresh.
        </p>
      </div>
    );
  }

  if (authLoading || authRequired === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface text-sm text-muted">
        <img src={BRAND_LOGO_URL} alt="" width={56} height={56} className="h-14 w-14 rounded-xl opacity-90" />
        <span>Loading…</span>
      </div>
    );
  }
  if (!authRequired) {
    return children;
  }
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  /** `fetchMe` runs in an effect — first paint can be `idle` before `loading`; must not render guarded routes yet or permission checks falsely deny and send users to `/login`. */
  if (meLoadState !== "ready" && meLoadState !== "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface text-sm text-muted">
        <img src={BRAND_LOGO_URL} alt="" width={56} height={56} className="h-14 w-14 rounded-xl opacity-90" />
        <span>Loading account…</span>
      </div>
    );
  }
  if (meLoadState === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-surface px-4 text-center text-sm text-muted">
        <img src={BRAND_LOGO_URL} alt="" width={56} height={56} className="h-14 w-14 rounded-xl opacity-90" />
        <p className="max-w-md">Could not load your permissions. Check your connection and try again.</p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="btn btn-primary btn-md"
            onClick={() => void refetchMe()}
          >
            Retry
          </button>
          <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink" onClick={logout}>
            Log out
          </button>
        </div>
      </div>
    );
  }
  return children;
}
