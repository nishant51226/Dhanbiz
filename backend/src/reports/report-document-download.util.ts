import * as crypto from "node:crypto";

export function signReportDocumentDownload(
  secret: string,
  documentId: string,
  customerId: string,
  expiresAtSec: number,
): string {
  const payload = `${documentId}\n${customerId}\n${expiresAtSec}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function verifyReportDocumentDownload(
  secret: string,
  documentId: string,
  customerId: string,
  expiresAtSec: number,
  token: string,
): boolean {
  if (!Number.isFinite(expiresAtSec) || expiresAtSec < Math.floor(Date.now() / 1000)) {
    return false;
  }
  const expected = signReportDocumentDownload(secret, documentId, customerId, expiresAtSec);
  const a = Buffer.from(expected);
  const b = Buffer.from(token.trim());
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildReportDocumentDownloadPath(
  apiOrigin: string,
  customerId: string,
  documentId: string,
  expiresAtSec: number,
  token: string,
): string {
  const base = apiOrigin.replace(/\/$/, "");
  const qs = new URLSearchParams({
    customerId,
    exp: String(expiresAtSec),
    token,
  });
  return `${base}/api/admin/reports/documents/${encodeURIComponent(documentId)}/file?${qs.toString()}`;
}
