export const TOKEN_KEY = "docp_token";
export const REFRESH_TOKEN_KEY = "docp_refresh";

export const BRAND_LOGO_URL = "/brand-logo.svg";

/** HMRC wordmark (same asset as Bing image search media URL). */
export const HMRC_LOGO_IMG_URL =
  "https://logos-world.net/wp-content/uploads/2021/08/HMRC-Logo.png";

/** Bundled HMRC logo (same artwork as {@link HMRC_LOGO_IMG_URL}) for blob preview and PDF export. */
export const HMRC_LOGO_BUNDLED_URL = "/hmrc-logo.png";

/** Same-origin asset for Direct Debit PDF export. */
export const DIRECT_DEBIT_LOGO_URL = "/direct-debit-logo.svg";

/** Navbar fallback when `/me` `customer_name` is empty (practice staff / superadmin). */
export const PRACTICE_LEGAL_NAME = "3K Financial & Accounting Services Ltd";

export function getApiBase(): string {
  return import.meta.env.VITE_API_BASE !== undefined && import.meta.env.VITE_API_BASE !== ""
    ? import.meta.env.VITE_API_BASE
    : import.meta.env.PROD
      ? ""
      : "http://127.0.0.1:3000";
}

/** User guide (Docusaurus) served at `/document/` in production; proxied in Vite dev. */
export function getHelpUrl(docPath = "/docs/intro"): string {
  const path = docPath.startsWith("/") ? docPath : `/${docPath}`;
  const external = import.meta.env.VITE_HELP_BASE?.trim();
  if (external) {
    return `${external.replace(/\/$/, "")}${path}`;
  }
  return `/document${path}`;
}
