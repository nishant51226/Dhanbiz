import { HMRC_LOGO_BUNDLED_URL, HMRC_LOGO_IMG_URL } from "../constants";
import { resolvePublicAssetDataUrl } from "./brandLogoSrc";

let cachedDataUrl: string | undefined;
let inflight: Promise<string> | undefined;

/** Rasterize a remote or data-URL image to PNG so html2canvas can paint it. */
function imageUrlToPngDataUrl(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const h = img.naturalHeight || 38;
        const w = img.naturalWidth || Math.max(1, Math.round((img.naturalWidth / img.naturalHeight) * h));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Data URL for HMRC 64-8 preview (blob iframe cannot load `/public` paths). */
export async function resolveHmrcLogoPreviewSrc(assetOrigin?: string): Promise<string> {
  const bundled = await resolvePublicAssetDataUrl(HMRC_LOGO_BUNDLED_URL, assetOrigin);
  if (bundled.startsWith("data:")) return bundled;
  return HMRC_LOGO_IMG_URL;
}

async function loadHmrcLogoDataUrl(assetOrigin?: string): Promise<string> {
  const fromRemote = await imageUrlToPngDataUrl(HMRC_LOGO_IMG_URL);
  if (fromRemote) return fromRemote;

  const bundled = await resolvePublicAssetDataUrl(HMRC_LOGO_BUNDLED_URL, assetOrigin);
  if (bundled.startsWith("data:")) {
    const fromBundled = await imageUrlToPngDataUrl(bundled);
    if (fromBundled) return fromBundled;
    return bundled;
  }

  return HMRC_LOGO_IMG_URL;
}

/** Data URL (or remote URL fallback) for HMRC 64-8 header logo in PDF export. */
export async function resolveHmrcLogoSrc(assetOrigin?: string): Promise<string> {
  if (cachedDataUrl) return cachedDataUrl;
  if (!inflight) {
    inflight = loadHmrcLogoDataUrl(assetOrigin)
      .then((dataUrl) => {
        cachedDataUrl = dataUrl;
        return dataUrl;
      })
      .finally(() => {
        inflight = undefined;
      });
  }
  return inflight;
}
