import { inferUploadMimeType } from "./uploadableFiles";

export type FilePreviewKind = "image" | "heic" | "pdf" | "docx" | "csv" | "spreadsheet" | "text" | "download";

export function isHeicFile(mimeType: string | null | undefined, fileName?: string): boolean {
  const mime = resolveDocumentMime(mimeType, fileName).toLowerCase();
  const name = (fileName ?? "").toLowerCase();
  return (
    mime === "image/heic" ||
    mime === "image/heif" ||
    mime === "image/heic-sequence" ||
    mime === "image/heif-sequence" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

export function resolveDocumentMime(mimeType: string | null | undefined, fileName?: string): string {
  const trimmed = mimeType?.trim();
  if (trimmed && trimmed !== "application/octet-stream") return trimmed;
  return inferUploadMimeType(fileName ?? "");
}

export function resolvePreviewKind(mimeType: string | null | undefined, fileName?: string): FilePreviewKind {
  const mime = resolveDocumentMime(mimeType, fileName).toLowerCase();
  const name = (fileName ?? "").toLowerCase();

  if (isHeicFile(mimeType, fileName)) return "heic";
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  if (mime === "text/csv" || mime === "application/csv" || name.endsWith(".csv")) return "csv";
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "application/vnd.oasis.opendocument.spreadsheet" ||
    /\.(xlsx?|xlsm|ods)$/i.test(name)
  ) {
    return "spreadsheet";
  }
  if (mime === "text/plain" || name.endsWith(".txt")) return "text";
  return "download";
}
