import { DIRECT_DEBIT_LOGO_URL } from "../constants";
import { resolvePublicAssetDataUrl } from "./brandLogoSrc";

/** Embedded mark when the bundled SVG cannot be fetched. */
const DIRECT_DEBIT_LOGO_EMBEDDED_SVG_DATA_URL =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 48" role="img" aria-label="Direct Debit"><text x="0" y="22" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" fill="#1a5d1a">Direct</text><text x="0" y="38" font-family="Arial,Helvetica,sans-serif" font-size="11" font-weight="700" fill="#b91c1c">Debit</text></svg>`,
  );

/** Data URL for Direct Debit header logo (blob preview + html2canvas PDF export). */
export async function resolveDirectDebitLogoSrc(assetOrigin?: string): Promise<string> {
  const resolved = await resolvePublicAssetDataUrl(DIRECT_DEBIT_LOGO_URL, assetOrigin);
  return resolved.startsWith("data:") ? resolved : DIRECT_DEBIT_LOGO_EMBEDDED_SVG_DATA_URL;
}
