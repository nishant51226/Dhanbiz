import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getApiBase, REFRESH_TOKEN_KEY, TOKEN_KEY } from "../constants";
import { accessTokenNeedsRefresh, decodeJwtPayload, getJwtExp } from "./jwtClaims";
import { firstAccessibleStaffPath, type StaffLandingInput } from "./staffLanding";
import { portalWorkspaceHomePath } from "./customerWorkspaceNav";
import type { CustomerAccountStatus } from "../types/api";

type MeResponse = {
  userId: string;
  customerId: string | null;
  /** Organisation display name when `customerId` is set (portal); empty string for staff/admin. */
  customer_name?: string;
  customer_account_status?: CustomerAccountStatus | null;
  customer_created_at?: string | null;
  isAdmin: boolean;
  permissions: string[];
  roles?: string[];
};

type MeLoadState = "idle" | "loading" | "ready" | "error";

type TokenPairResponse = {
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  token?: string;
};

type AuthCtx = {
  apiBase: string;
  authRequired: boolean | null;
  authLoading: boolean;
  /** True when /api/auth/status could not be loaded (wrong API URL, CORS, or server down). */
  authStatusError: boolean;
  token: string | null;
  /** From JWT `adm` claim; false when unauthenticated or token unreadable. */
  isAdmin: boolean;
  /** From JWT `cid` claim. */
  customerId: string | null;
  /** From `GET /api/auth/me` or JWT `uid`. */
  userId: string | null;
  /** From `GET /api/auth/me` `customer_name` (portal organisation name; empty string for staff/admin). */
  customerName: string;
  /** From `GET /api/auth/me` `customer_account_status` (portal lifecycle; null for staff/admin). */
  customerAccountStatus: CustomerAccountStatus | null;
  /** Effective permissions from `GET /api/auth/me` (empty for admins — treat as full access). */
  permissions: string[];
  /** Assigned role names from `GET /api/auth/me` for UI labeling. */
  roleNames: string[];
  /** When auth is on and a token exists, tracks `GET /api/auth/me`. */
  meLoadState: MeLoadState;
  /** True when permissions are known (`/auth/me` succeeded) or auth is off / no token. */
  permissionsReady: boolean;
  setToken: (t: string | null) => void;
  setSession: (access: string | null, refresh?: string | null) => void;
  authHeaders: () => HeadersInit;
  logout: () => void;
  refreshSession: () => Promise<string | null>;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (ids: readonly string[]) => boolean;
  /** First staff route for home redirect; `null` if authenticated staff has no allowed modules. */
  staffHomePath: string | null;
  /** First customer workspace route for portal logins; `null` for staff/admin. */
  portalHomePath: string | null;
  /** Input for `firstAccessibleStaffPath` / `nextStaffPathAfterDeny` (same permission logic as hooks). */
  staffLandingInput: StaffLandingInput;
  refetchMe: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

const PORTAL_PERMISSION_ALIASES: Record<string, readonly string[]> = {
  "customer:read": ["portal:customer:read", "portal:settings:read", "portal:settings:write"],
  "customer:write": ["portal:customer:write", "portal:settings:write"],
  "file:read": ["portal:file:read", "portal:file:write"],
  "file:write": ["portal:file:write"],
  "subscription_plan:read": ["portal:subscription_plan:read"],
  "subscription_plan:write": ["portal:subscription_plan:write"],
  /** `customer_admin` had settings write before `portal:user:*` was added; keep equivalent access. */
  "portal:user:read": ["portal:settings:read", "portal:settings:write"],
  "portal:user:write": ["portal:settings:write"],
};

function withPortalAlias(permission: string): readonly string[] {
  const aliases = PORTAL_PERMISSION_ALIASES[permission];
  return aliases ? [permission, ...aliases] : [permission];
}

function buildStaffInput(
  authRequired: boolean,
  customerId: string | null,
  isAdmin: boolean,
  permissions: string[],
  permissionsReady: boolean
): StaffLandingInput {
  const hasPermission = (p: string) => {
    if (!authRequired) {
      return true;
    }
    if (isAdmin) {
      return true;
    }
    if (!permissionsReady) {
      return false;
    }
    for (const candidate of withPortalAlias(p)) {
      if (permissions.includes(candidate)) return true;
    }
    return false;
  };
  const hasAnyPermission = (ids: readonly string[]) => ids.some((p) => hasPermission(p));
  return { authRequired, customerId, isAdmin, hasPermission, hasAnyPermission };
}

function readStoredToken(): string | null {
  try {
    const s = localStorage.getItem(TOKEN_KEY)?.trim();
    return s || null;
  } catch {
    return null;
  }
}

function readStoredRefreshToken(): string | null {
  try {
    const s = localStorage.getItem(REFRESH_TOKEN_KEY)?.trim();
    return s || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const apiBase = getApiBase();
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authStatusError, setAuthStatusError] = useState(false);
  /** Hydrate from storage immediately so refresh never briefly looks logged-out before `/auth/status` runs. */
  const [token, setTokenState] = useState<string | null>(readStoredToken);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roleNames, setRoleNames] = useState<string[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerAccountStatus, setCustomerAccountStatus] = useState<CustomerAccountStatus | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [meLoadState, setMeLoadState] = useState<MeLoadState>("idle");
  const refreshInFlight = useRef<Promise<string | null> | null>(null);
  const tokenRef = useRef<string | null>(token);
  const meLoadedForSessionRef = useRef(false);
  tokenRef.current = token;

  const clearSessionState = useCallback(() => {
    setPermissions([]);
    setRoleNames([]);
    setCustomerName("");
    setCustomerAccountStatus(null);
    setUserId(null);
    setMeLoadState("idle");
  }, []);

  const setSession = useCallback(
    (access: string | null, refresh?: string | null) => {
      try {
        if (access) {
          localStorage.setItem(TOKEN_KEY, access);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
        if (refresh !== undefined) {
          if (refresh) {
            localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
          } else {
            localStorage.removeItem(REFRESH_TOKEN_KEY);
          }
        }
      } catch {
        /* ignore storage errors */
      }
      if (!access) {
        clearSessionState();
      }
      setTokenState(access);
    },
    [clearSessionState]
  );

  const setToken = useCallback(
    (t: string | null) => {
      setSession(t, t ? undefined : null);
    },
    [setSession]
  );

  const refreshSession = useCallback(async (): Promise<string | null> => {
    const storedRefresh = readStoredRefreshToken();
    if (!storedRefresh) return null;
    if (refreshInFlight.current) return refreshInFlight.current;

    refreshInFlight.current = (async (): Promise<string | null> => {
      try {
        const res = await fetch(`${apiBase}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: storedRefresh }),
        });
        if (res.status === 401 || res.status === 403) {
          try {
            localStorage.removeItem(REFRESH_TOKEN_KEY);
          } catch {
            /* ignore */
          }
          return null;
        }
        if (!res.ok) {
          console.warn("[auth] /api/auth/refresh returned", res.status, res.statusText);
          return readStoredToken();
        }
        const data = (await res.json()) as TokenPairResponse;
        const access = (data.accessToken ?? data.token)?.trim();
        const refresh = data.refreshToken?.trim();
        if (!access || !refresh) return readStoredToken();
        setSession(access, refresh);
        return access;
      } catch (err) {
        console.warn("[auth] Failed to reach /api/auth/refresh:", err);
        return readStoredToken();
      } finally {
        refreshInFlight.current = null;
      }
    })();

    return refreshInFlight.current;
  }, [apiBase, setSession]);

  const logout = useCallback(() => {
    const storedRefresh = readStoredRefreshToken();
    if (storedRefresh) {
      void fetch(`${apiBase}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: storedRefresh }),
      }).catch(() => undefined);
    }
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      /* ignore */
    }
    meLoadedForSessionRef.current = false;
    setTokenState(null);
    clearSessionState();
  }, [apiBase, clearSessionState]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAuthStatusError(false);
      try {
        const res = await fetch(`${apiBase}/api/auth/status`);
        if (!res.ok) {
          console.error("[auth] /api/auth/status returned", res.status, res.statusText);
          if (!cancelled) setAuthStatusError(true);
          return;
        }
        const data = (await res.json()) as { authRequired?: boolean };
        if (cancelled) return;
        const req = Boolean(data.authRequired);
        setAuthRequired(req);
        if (req) {
          setTokenState(readStoredToken());
        } else {
          setSession(null, null);
        }
      } catch (err) {
        console.error("[auth] Failed to reach /api/auth/status:", err);
        if (!cancelled) setAuthStatusError(true);
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, setSession]);

  useEffect(() => {
    if (authLoading || !authRequired) return;
    let cancelled = false;
    (async () => {
      const refresh = readStoredRefreshToken();
      if (!refresh) return;
      const access = readStoredToken();
      if (!accessTokenNeedsRefresh(access)) return;
      const newAccess = await refreshSession();
      if (!newAccess && !cancelled && accessTokenNeedsRefresh(readStoredToken())) logout();
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, authRequired, refreshSession, logout]);

  const fetchMe = useCallback(
    async (accessOverride?: string) => {
      const access = accessOverride ?? tokenRef.current;
      if (!authRequired || !access) {
        clearSessionState();
        meLoadedForSessionRef.current = false;
        return;
      }
      const alreadyLoaded = meLoadedForSessionRef.current;
      if (!alreadyLoaded) setMeLoadState("loading");
      const load = async (bearer: string) =>
        fetch(`${apiBase}/api/auth/me`, {
          headers: { Authorization: `Bearer ${bearer}` },
        });

      try {
        let res = await load(access);
        if (res.status === 401) {
          const newAccess = await refreshSession();
          if (newAccess) {
            res = await load(newAccess);
          } else if (accessTokenNeedsRefresh(tokenRef.current)) {
            logout();
            return;
          }
        }
        if (!res.ok) {
          console.error("[auth] /api/auth/me returned", res.status, res.statusText);
          clearSessionState();
          setMeLoadState("error");
          return;
        }
        const data = (await res.json()) as MeResponse;
        setPermissions(Array.isArray(data.permissions) ? data.permissions : []);
        setRoleNames(Array.isArray(data.roles) ? data.roles : []);
        setCustomerName(typeof data.customer_name === "string" ? data.customer_name : "");
        const rawStatus = data.customer_account_status;
        setCustomerAccountStatus(
          rawStatus === "draft" ||
            rawStatus === "active" ||
            rawStatus === "inactive" ||
            rawStatus === "proposed"
            ? rawStatus
            : null,
        );
        setUserId(typeof data.userId === "string" && data.userId ? data.userId : null);
        setMeLoadState("ready");
        meLoadedForSessionRef.current = true;
      } catch (err) {
        console.error("[auth] Failed to reach /api/auth/me:", err);
        clearSessionState();
        setMeLoadState("error");
      }
    },
    [apiBase, authRequired, refreshSession, clearSessionState, logout]
  );

  useEffect(() => {
    if (authLoading || !authRequired) return;
    if (!token) {
      meLoadedForSessionRef.current = false;
      return;
    }
    // JWT rotation updates `token` — do not refetch /me or flash the loading shell.
    if (meLoadedForSessionRef.current) return;
    void fetchMe();
  }, [authLoading, authRequired, token, fetchMe]);

  useEffect(() => {
    if (!authRequired || !token) return;
    const exp = getJwtExp(token);
    if (exp === null) return;
    const delayMs = (exp - 60) * 1000 - Date.now();
    const runRefresh = (attempt = 0) => {
      void refreshSession().then((access) => {
        if (access) return;
        const storedAccess = readStoredToken();
        if (!accessTokenNeedsRefresh(storedAccess)) return;
        if (attempt < 1 && readStoredRefreshToken()) {
          window.setTimeout(() => runRefresh(attempt + 1), 2000);
          return;
        }
        logout();
      });
    };
    if (delayMs <= 0) {
      runRefresh();
      return;
    }
    const timer = window.setTimeout(runRefresh, delayMs);
    return () => window.clearTimeout(timer);
  }, [authRequired, token, refreshSession, logout]);

  const authHeaders = useCallback((): HeadersInit => {
    const access = tokenRef.current;
    if (authRequired && access) {
      return { Authorization: `Bearer ${access}` };
    }
    return {};
  }, [authRequired]);

  const jwtClaims = useMemo(() => decodeJwtPayload(token), [token]);
  const { isAdmin, customerId } = jwtClaims;
  const effectiveUserId = userId ?? jwtClaims.userId;

  const permissionsReady = !authRequired || !token || meLoadState === "ready";

  const staffInput = useMemo(
    () => buildStaffInput(Boolean(authRequired), customerId, isAdmin, permissions, permissionsReady),
    [authRequired, customerId, isAdmin, permissions, permissionsReady]
  );

  const hasPermission = useCallback(
    (permission: string) => staffInput.hasPermission(permission),
    [staffInput]
  );

  const hasAnyPermission = useCallback(
    (ids: readonly string[]) => staffInput.hasAnyPermission(ids),
    [staffInput]
  );

  const staffHomePath = useMemo(() => firstAccessibleStaffPath(staffInput), [staffInput]);

  const portalHomePath = useMemo(() => {
    if (!authRequired || !customerId || isAdmin) {
      return null;
    }
    if (!permissionsReady) {
      return `/customers/${customerId}/dashboard`;
    }
    return portalWorkspaceHomePath(customerId, permissions, staffInput.hasPermission, staffInput.hasAnyPermission, isAdmin);
  }, [authRequired, customerId, isAdmin, permissions, permissionsReady, staffInput]);

  const value = useMemo(
    () => ({
      apiBase,
      authRequired,
      authLoading,
      authStatusError,
      token,
      isAdmin,
      customerId,
      userId: effectiveUserId,
      customerName,
      customerAccountStatus,
      permissions,
      roleNames,
      meLoadState,
      permissionsReady,
      setToken,
      setSession,
      authHeaders,
      logout,
      refreshSession,
      hasPermission,
      hasAnyPermission,
      staffHomePath,
      portalHomePath,
      staffLandingInput: staffInput,
      refetchMe: () => fetchMe(),
    }),
    [
      apiBase,
      authRequired,
      authLoading,
      authStatusError,
      token,
      isAdmin,
      customerId,
      effectiveUserId,
      customerName,
      customerAccountStatus,
      permissions,
      roleNames,
      meLoadState,
      permissionsReady,
      setToken,
      setSession,
      authHeaders,
      logout,
      refreshSession,
      hasPermission,
      hasAnyPermission,
      staffHomePath,
      portalHomePath,
      staffInput,
      fetchMe,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}
