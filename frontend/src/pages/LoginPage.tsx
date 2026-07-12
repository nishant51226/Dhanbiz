import VisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeToggle";
import { BRAND_LOGO_URL } from "../constants";
import { useAuth } from "../auth/AuthContext";

function BrandMark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-5">
      <div className="h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-sm">
        <img src={BRAND_LOGO_URL} alt="" width={512} height={512} className="h-full w-full object-contain" />
      </div>
      {subtitle ? (
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand">{subtitle}</p>
      ) : null}
    </div>
  );
}

export default function LoginPage() {
  const { apiBase, setSession } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setBusy(true);
    try {
      const emailTrimmed = email.trim().replace(/^[\u200B\u200C\u200D\uFEFF\u2060]+|[\u200B\u200C\u200D\uFEFF\u2060]+$/g, "");
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailTrimmed, password }),
      });
      const data = (await res.json()) as {
        accessToken?: string;
        refreshToken?: string;
        token?: string;
        error?: string;
        message?: string | string[];
      };
      const accessToken = (data.accessToken ?? data.token)?.trim();
      const refreshToken = data.refreshToken?.trim();
      if (!res.ok || !accessToken || !refreshToken) {
        const apiMessage = Array.isArray(data.message) ? data.message[0] : data.message;
        setLoginError(apiMessage ?? data.error ?? "Invalid credentials");
        return;
      }
      setSession(accessToken, refreshToken);
      navigate("/", { replace: true });
    } catch {
      setLoginError("Could not reach server");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col justify-center bg-surface bg-[radial-gradient(900px_circle_at_20%_-10%,rgba(234,179,8,0.1),transparent_55%)] px-4 py-12 dark:bg-[radial-gradient(900px_circle_at_20%_-10%,rgba(232,184,0,0.14),transparent_55%)] sm:px-8">
      <div className="absolute right-4 top-4 sm:right-8 sm:top-8">
        <ThemeToggle />
      </div>
      <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-brand/20 bg-surface-raised shadow-card">
        <div className="border-b border-border-subtle px-8 pb-6 pt-8">
          <BrandMark subtitle="Document services" />
          <h1 className="mt-6 text-xl font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Authorized users only.</p>
        </div>
        <div className="px-8 pb-8 pt-2">
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink/90">Email</span>
              <input
                type="text"
                inputMode="email"
                autoComplete="username"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-muted/80 px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:bg-surface-raised focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink/90">Password</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-muted/80 py-2 pl-3 pr-11 text-sm text-ink outline-none transition focus:border-brand focus:bg-surface-raised focus:ring-2 focus:ring-brand/20"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted hover:bg-surface-muted/90 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <VisibilityOffOutlined sx={{ fontSize: 22 }} />
                  ) : (
                    <VisibilityOutlined sx={{ fontSize: 22 }} />
                  )}
                </button>
              </div>
            </label>
            {loginError ? <p className="text-sm text-red-700 dark:text-red-400">{loginError}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="btn btn-primary btn-lg shadow-sm"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
