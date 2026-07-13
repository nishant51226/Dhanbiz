/** Same path as frontend `src/constants.ts` — logo URL is resolved with `assetOrigin` in registration HTML. */
export const BRAND_LOGO_URL = "/brand-logo.svg";

/** HMRC wordmark (same asset as Bing image search media URL). */
export const HMRC_LOGO_IMG_URL =
  "https://logos-world.net/wp-content/uploads/2021/08/HMRC-Logo.png";

/** Bundled HMRC logo (same artwork as {@link HMRC_LOGO_IMG_URL}) for server-side PDF export. */
export const HMRC_LOGO_BUNDLED_URL = "/hmrc-logo.png";

/** @deprecated Use {@link HMRC_LOGO_BUNDLED_URL} */
export const HMRC_LOGO_URL = HMRC_LOGO_BUNDLED_URL;

export const DIRECT_DEBIT_LOGO_URL = "/direct-debit-logo.svg";
