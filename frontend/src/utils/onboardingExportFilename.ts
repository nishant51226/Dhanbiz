import type { CustomerOnboardingData } from "../types/customerOnboarding";

/** Base filename without extension: onboarding-{company}-{YYYY-MM-DD}. */
export function onboardingExportBaseName(data: CustomerOnboardingData): string {
  const raw = data.company.name.trim() || "onboarding";
  const sanitized = raw
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  const slug = sanitized.length > 0 ? sanitized : "onboarding";
  const date = new Date().toISOString().slice(0, 10);
  return `onboarding-${slug}-${date}`;
}

export function sanitizeDownloadFilename(filename: string): string {
  const trimmed = filename.trim().replace(/[\\/:*?"<>|]/g, "_");
  return trimmed.length > 0 ? trimmed : "download";
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (!blob || blob.size <= 0) {
    throw new Error("Download file is empty");
  }
  const safeName = sanitizeDownloadFilename(filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = safeName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the browser has picked up the blob URL (immediate revoke can cancel the download).
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Start a file download from a remote URL (e.g. S3 presigned GET) without buffering in JS. */
export function triggerBrowserDownloadFromUrl(url: string, _filename?: string): void {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    throw new Error("Download URL is missing");
  }
  // Hidden iframe keeps the user on the app; S3 Content-Disposition triggers the browser download.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.style.cssText =
    "position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none;left:-9999px";
  iframe.src = trimmedUrl;
  document.body.appendChild(iframe);
  window.setTimeout(() => iframe.remove(), 180_000);
}
