import * as path from "node:path";

const ALLOWED_EXACT_MIMES = new Set([
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroEnabled.12",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
};

const UPLOADABLE_EXTENSION = /\.(pdf|png|jpe?g|gif|webp|tiff?|docx?|csv|txt|xlsx?|xlsm|odt|ods)$/i;
const EXTRACTABLE_EXTENSION = /\.(pdf|png|jpe?g|gif|webp|tiff?)$/i;

export const UPLOAD_MIME_TYPE_ERROR =
  "Expected a supported file type (PDF, images, Word, Excel, or CSV).";

/** Infer MIME from filename when the client sends an empty or generic type. */
export function inferUploadMimeType(fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase();
  return EXTENSION_TO_MIME[ext] ?? null;
}

/** Library / drive uploads: PDF, images, Word, Excel, CSV, and plain text. */
export function isAllowedUploadMime(mimeType: string, fileName?: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (ALLOWED_EXACT_MIMES.has(mime)) return true;
  const name = fileName?.trim() ?? "";
  if (mime === "application/octet-stream" && name) {
    return UPLOADABLE_EXTENSION.test(name);
  }
  if (name) {
    const inferred = inferUploadMimeType(name);
    if (inferred && (inferred.startsWith("image/") || ALLOWED_EXACT_MIMES.has(inferred))) {
      return true;
    }
    return UPLOADABLE_EXTENSION.test(name);
  }
  return false;
}

/** AI extraction supports PDF and images only. */
export function isExtractableUploadMime(mimeType: string, fileName?: string): boolean {
  const mime = mimeType.trim().toLowerCase();
  if (mime === "application/pdf" || mime.startsWith("image/")) return true;
  const name = fileName?.trim() ?? "";
  if (!name) return false;
  return name.toLowerCase().endsWith(".pdf") || EXTRACTABLE_EXTENSION.test(name);
}
