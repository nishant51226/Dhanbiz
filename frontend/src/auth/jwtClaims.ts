/** JWT `exp` (seconds since epoch), or null if unreadable. */
export function getJwtExp(token: string | null): number | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (b64.length % 4)) % 4;
    if (pad !== 0) b64 += "=".repeat(pad);
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

/** True when access token is missing or expires within `bufferSec` seconds. */
export function accessTokenNeedsRefresh(token: string | null, bufferSec = 60): boolean {
  if (!token) return true;
  const exp = getJwtExp(token);
  if (exp === null) return true;
  return exp <= Math.floor(Date.now() / 1000) + bufferSec;
}

/** Decode JWT payload for UI only (not verified — API enforces auth). */
export function decodeJwtPayload(token: string | null): {
  isAdmin: boolean;
  customerId: string | null;
  userId: string | null;
} {
  if (!token) return { isAdmin: false, customerId: null, userId: null };
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return { isAdmin: false, customerId: null, userId: null };
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (b64.length % 4)) % 4;
    if (pad !== 0) b64 += "=".repeat(pad);
    const payload = JSON.parse(atob(b64)) as { adm?: boolean; cid?: string | null; uid?: string };
    return {
      isAdmin: payload.adm === true,
      customerId: typeof payload.cid === "string" && payload.cid.length > 0 ? payload.cid : null,
      userId: typeof payload.uid === "string" && payload.uid.length > 0 ? payload.uid : null,
    };
  } catch {
    return { isAdmin: false, customerId: null, userId: null };
  }
}
