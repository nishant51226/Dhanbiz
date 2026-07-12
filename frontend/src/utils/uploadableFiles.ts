/** Must match backend `DEFAULT_UPLOAD_MAX_BYTES` / `PRESIGNED_UPLOAD_MAX_BYTES` (100 MiB). */
export const MAX_UPLOAD_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_UPLOAD_FILE_MB = 100;

const UPLOADABLE_MIMES = new Set([
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

const UPLOADABLE_EXTENSION = /\.(pdf|png|jpe?g|gif|webp|heic|heif|tiff?|docx?|csv|txt|xlsx?|xlsm|odt|ods)$/i;
const EXTRACTABLE_EXTENSION = /\.(pdf|png|jpe?g|gif|webp|heic|heif|tiff?)$/i;

export const UPLOAD_FILE_TYPES_HINT = "PDF, images, Word, Excel, or CSV";

/** HTML `accept` for library / drive file inputs. */
export const UPLOAD_FILE_ACCEPT =
  "image/*,.pdf,application/pdf,.doc,.docx,.csv,.txt,.xls,.xlsx,.xlsm,.odt,.ods,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function inferUploadMimeType(fileName: string): string {
  const n = fileName.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".heic")) return "image/heic";
  if (n.endsWith(".heif")) return "image/heif";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".tif") || n.endsWith(".tiff")) return "image/tiff";
  if (n.endsWith(".doc")) return "application/msword";
  if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (n.endsWith(".csv")) return "text/csv";
  if (n.endsWith(".txt")) return "text/plain";
  if (n.endsWith(".xls")) return "application/vnd.ms-excel";
  if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (n.endsWith(".xlsm")) return "application/vnd.ms-excel.sheet.macroEnabled.12";
  if (n.endsWith(".odt")) return "application/vnd.oasis.opendocument.text";
  if (n.endsWith(".ods")) return "application/vnd.oasis.opendocument.spreadsheet";
  return "application/octet-stream";
}

/** PDF, images, Word, Excel, CSV, and plain text allowed for library / drive uploads. */
export function isUploadableFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (UPLOADABLE_MIMES.has(mime)) return true;
  if (mime === "application/octet-stream") return UPLOADABLE_EXTENSION.test(file.name);
  return UPLOADABLE_EXTENSION.test(file.name);
}

/** AI extraction supports PDF and images only. */
export function isExtractableFile(file: File): boolean {
  const mime = (file.type || "").toLowerCase();
  if (mime === "application/pdf" || mime.startsWith("image/")) return true;
  const n = file.name.toLowerCase();
  return n.endsWith(".pdf") || EXTRACTABLE_EXTENSION.test(n);
}

export function pickUploadableFiles(fileList: FileList | null): {
  files: File[];
  rejectedType: number;
  rejectedSize: number;
} {
  const all = fileList ? Array.from(fileList) : [];
  const files: File[] = [];
  let rejectedType = 0;
  let rejectedSize = 0;
  for (const f of all) {
    if (!isUploadableFile(f)) {
      rejectedType += 1;
      continue;
    }
    if (f.size > MAX_UPLOAD_FILE_BYTES) {
      rejectedSize += 1;
      continue;
    }
    files.push(f);
  }
  return { files, rejectedType, rejectedSize };
}

export function describeRejectedUploadFiles(rejectedType: number, rejectedSize: number): string {
  const parts: string[] = [];
  if (rejectedType > 0) {
    parts.push(
      rejectedType === 1
        ? `1 file was skipped (only ${UPLOAD_FILE_TYPES_HINT} are supported)`
        : `${rejectedType} files were skipped (only ${UPLOAD_FILE_TYPES_HINT} are supported)`,
    );
  }
  if (rejectedSize > 0) {
    parts.push(
      rejectedSize === 1
        ? `1 file exceeded ${MAX_UPLOAD_FILE_MB} MB`
        : `${rejectedSize} files exceeded ${MAX_UPLOAD_FILE_MB} MB each`,
    );
  }
  return parts.join(". ");
}

export type UploadProgress = {
  /** Number of files finished (success or failure). */
  completed: number;
  total: number;
  fileName: string;
};

/** @deprecated Use `UploadProgress` */
export type SequentialUploadProgress = UploadProgress;

/** Default parallel S3 upload workers (init → PUT → complete per file). */
export const DEFAULT_UPLOAD_CONCURRENCY = 3;

export type MultiFileUploadOptions = {
  /** Max files uploading at once after any lead file. Default 3. */
  concurrency?: number;
  /**
   * Upload `files[0]` alone first, then the rest in parallel.
   * Use when creating a new folder by `supplierName` so the backend can resolve the folder by name.
   */
  leadSequential?: boolean;
  onProgress?: (progress: UploadProgress) => void;
};

export type MultiFileUploadFailure = { file: File; index: number; error: Error };

export type MultiFileUploadResult<T> = {
  results: T[];
  failures: MultiFileUploadFailure[];
};

async function runPool<T>(
  indices: readonly number[],
  files: readonly File[],
  uploadOne: (file: File, index: number) => Promise<T>,
  concurrency: number,
  onProgress: MultiFileUploadOptions["onProgress"],
  results: T[],
  failures: MultiFileUploadFailure[],
  progressOffset: { completed: number },
): Promise<void> {
  if (indices.length === 0) return;
  const workers = Math.min(Math.max(1, concurrency), indices.length);
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const pos = cursor++;
      if (pos >= indices.length) return;
      const index = indices[pos]!;
      const file = files[index]!;
      try {
        const value = await uploadOne(file, index);
        results.push(value);
      } catch (e) {
        failures.push({
          file,
          index,
          error: e instanceof Error ? e : new Error(String(e)),
        });
      } finally {
        progressOffset.completed += 1;
        onProgress?.({
          completed: progressOffset.completed,
          total: files.length,
          fileName: file.name,
        });
      }
    }
  };

  await Promise.all(Array.from({ length: workers }, () => worker()));
}

/**
 * Upload many files with limited parallelism (presigned S3: init → PUT → complete per file).
 */
export async function uploadFilesWithConcurrency<T>(
  files: readonly File[],
  uploadOne: (file: File, index: number) => Promise<T>,
  options?: MultiFileUploadOptions,
): Promise<MultiFileUploadResult<T>> {
  const results: T[] = [];
  const failures: MultiFileUploadFailure[] = [];
  if (files.length === 0) {
    return { results, failures };
  }

  const concurrency = options?.concurrency ?? DEFAULT_UPLOAD_CONCURRENCY;
  const leadSequential = options?.leadSequential ?? false;
  const onProgress = options?.onProgress;
  const progress = { completed: 0 };

  const runOne = async (index: number) => {
    const file = files[index]!;
    try {
      const value = await uploadOne(file, index);
      results.push(value);
    } catch (e) {
      failures.push({
        file,
        index,
        error: e instanceof Error ? e : new Error(String(e)),
      });
    } finally {
      progress.completed += 1;
      onProgress?.({
        completed: progress.completed,
        total: files.length,
        fileName: file.name,
      });
    }
  };

  if (leadSequential) {
    await runOne(0);
    const rest = files.map((_, i) => i).slice(1);
    await runPool(rest, files, uploadOne, concurrency, onProgress, results, failures, progress);
  } else {
    const all = files.map((_, i) => i);
    await runPool(all, files, uploadOne, concurrency, onProgress, results, failures, progress);
  }

  return { results, failures };
}

/** Strictly one file at a time (legacy). */
export async function uploadFilesSequentially<T>(
  files: readonly File[],
  uploadOne: (file: File, index: number) => Promise<T>,
  onProgress?: (progress: UploadProgress) => void,
): Promise<MultiFileUploadResult<T>> {
  return uploadFilesWithConcurrency(files, uploadOne, { concurrency: 1, onProgress });
}

export function formatUploadFailureSummary(
  failures: Array<{ file: File; error: Error }>,
  maxNames = 3,
): string {
  if (failures.length === 0) return "";
  const names = failures.slice(0, maxNames).map((f) => f.file.name);
  const extra = failures.length > maxNames ? ` (+${failures.length - maxNames} more)` : "";
  const firstErr = failures[0]?.error.message ?? "Upload failed";
  return `${failures.length} file(s) failed (${names.join(", ")}${extra}): ${firstErr}`;
}

/** True when uploads should create/resolve a new folder by name (avoid parallel race). */
export function shouldLeadSequentialFolderUpload(params: {
  supplierFolderId?: string | null;
  supplierName?: string | null;
}): boolean {
  const hasFolder = Boolean(params.supplierFolderId?.trim());
  const hasName = Boolean(params.supplierName?.trim());
  return !hasFolder && hasName;
}
