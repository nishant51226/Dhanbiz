import * as path from "node:path";
import { readFile } from "node:fs/promises";
import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import type { DocumentEntity } from "../entities/document.entity.js";
import { renderPdfPageToPng } from "../pdf.js";
import type { S3Service } from "../s3/s3.service.js";

const MAX_EMBED_SOURCE_BYTES = 20 * 1024 * 1024;

export type DocumentPreviewImage = {
  extension: "png" | "jpeg" | "gif";
  buffer: Buffer;
};

export type DocumentPreviewResult =
  | { kind: "image"; image: DocumentPreviewImage }
  | { kind: "unavailable"; note: string };

export function resolveDocumentMime(doc: DocumentEntity): string {
  const fromCol = typeof doc.mimeType === "string" ? doc.mimeType.trim() : "";
  const fromMeta =
    doc.metadata && typeof doc.metadata.mimeType === "string" ? doc.metadata.mimeType.trim() : "";
  const mime = (fromCol || fromMeta || "").toLowerCase();
  if (mime) return mime;
  const ext = (doc.extension ?? path.extname(doc.name ?? "")).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

export async function readDocumentBytes(
  doc: DocumentEntity,
  s3: S3Service,
  storageRoot: string | undefined,
): Promise<Buffer> {
  const s3Key = doc.s3Key?.trim();
  if (s3Key) {
    return s3.getObjectBufferByKey(s3Key);
  }
  const customerId = doc.customerId ?? doc.folder?.customerId ?? null;
  if (!customerId) {
    throw new NotFoundException(`Document ${doc.id} has no customer scope`);
  }
  if (!storageRoot) {
    throw new ServiceUnavailableException("FILE_STORAGE_ROOT not configured");
  }
  const rel = doc.fileUrl?.trim().replace(/^\/+/, "");
  if (!rel) {
    throw new NotFoundException(`Document ${doc.id} has no storage path`);
  }
  const abs = path.join(storageRoot, customerId, rel);
  return readFile(abs);
}

export async function buildDocumentPreview(
  doc: DocumentEntity,
  s3: S3Service,
  storageRoot: string | undefined,
): Promise<DocumentPreviewResult> {
  const mime = resolveDocumentMime(doc);
  let bytes: Buffer;
  try {
    bytes = await readDocumentBytes(doc, s3, storageRoot);
  } catch {
    return { kind: "unavailable", note: "Could not load file from storage" };
  }
  if (bytes.length > MAX_EMBED_SOURCE_BYTES) {
    return {
      kind: "unavailable",
      note: `File too large to embed (${Math.round(bytes.length / (1024 * 1024))} MB)`,
    };
  }

  if (mime === "application/pdf") {
    try {
      const png = await renderPdfPageToPng(bytes, 1);
      return { kind: "image", image: { extension: "png", buffer: png } };
    } catch {
      return { kind: "unavailable", note: "PDF preview could not be rendered" };
    }
  }

  if (mime === "image/png") {
    return { kind: "image", image: { extension: "png", buffer: bytes } };
  }
  if (mime === "image/jpeg" || mime === "image/jpg") {
    return { kind: "image", image: { extension: "jpeg", buffer: bytes } };
  }
  if (mime === "image/gif") {
    return { kind: "image", image: { extension: "gif", buffer: bytes } };
  }
  if (mime.startsWith("image/")) {
    return {
      kind: "unavailable",
      note: `Image type ${mime} is not supported for Excel embed (use PNG, JPEG, or GIF)`,
    };
  }

  const label = mime && mime !== "application/octet-stream" ? mime : doc.extension ?? "unknown type";
  return {
    kind: "unavailable",
    note: `No visual preview for ${label}. Open the original file in the library.`,
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}
