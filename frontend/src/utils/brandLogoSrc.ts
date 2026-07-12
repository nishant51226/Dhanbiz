import { BRAND_LOGO_URL } from "../constants";

const dataUrlCache = new Map<string, string>();
const inflightByKey = new Map<string, Promise<string>>();

function publicAssetPath(file: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalized = base.endsWith("/") ? base : `${base}/`;
  const name = file.replace(/^\//, "");
  return `${normalized}${name}`;
}

function absolutePublicAssetUrl(publicPath: string, assetOrigin?: string): string {
  const path = publicAssetPath(publicPath);
  const origin = assetOrigin?.replace(/\/$/, "");
  if (origin) return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
  return path.startsWith("/") ? path : `/${path}`;
}

async function loadPublicAssetDataUrl(publicPath: string, assetOrigin?: string): Promise<string> {
  const url = absolutePublicAssetUrl(publicPath, assetOrigin);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? url));
      reader.onerror = () => reject(reader.error ?? new Error("read failed"));
      reader.readAsDataURL(blob);
    });
    return dataUrl;
  } catch {
    return url;
  }
}

/** Cached data URL for a same-origin public asset (blob preview + html2canvas PDF export). */
export async function resolvePublicAssetDataUrl(
  publicPath: string,
  assetOrigin?: string,
): Promise<string> {
  const normalized = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  const cacheKey = `${assetOrigin ?? ""}:${normalized}`;
  const cached = dataUrlCache.get(cacheKey);
  if (cached) return cached;

  let inflight = inflightByKey.get(cacheKey);
  if (!inflight) {
    inflight = loadPublicAssetDataUrl(normalized, assetOrigin).then((dataUrl) => {
      dataUrlCache.set(cacheKey, dataUrl);
      return dataUrl;
    }).finally(() => {
      inflightByKey.delete(cacheKey);
    });
    inflightByKey.set(cacheKey, inflight);
  }
  return inflight;
}

/** Cached data URL for the registration form logo (blob preview + html2canvas PDF export). */
export async function resolveBrandLogoSrc(assetOrigin?: string): Promise<string> {
  return resolvePublicAssetDataUrl(BRAND_LOGO_URL, assetOrigin);
}
