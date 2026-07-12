import { fetchFilesForCustomer, uploadFile } from "../api/client";
import { ensureFolderPath, splitRelativeFilePath } from "./driveFolderPath";
import { isUploadableFile } from "./uploadableFiles";
import type { DriveFile } from "../types/api";

export type FolderUploadProgress = {
  current: number;
  total: number;
  fileName: string;
};

export type UploadFolderTreeOptions = {
  apiBase: string;
  headers: HeadersInit;
  customerId: string;
  /** Parent folder in the drive; null = library root. Relative paths extend under this. */
  rootParentId: string | null;
  pickedFiles: File[];
  /** When omitted, the latest drive list is fetched before creating paths. */
  existingFiles?: DriveFile[];
  runExtraction: boolean;
  onProgress?: (p: FolderUploadProgress) => void;
};

export type UploadFolderTreeResult = {
  uploaded: DriveFile[];
  skipped: number;
  errors: string[];
  /** New folder rows created while ensuring paths (merge into local drive state). */
  createdFolders: DriveFile[];
};

/**
 * Uploads each allowed file under `rootParentId`, mirroring relative directory segments
 * (e.g. from a browser folder picker: Year / Month / Supplier / doc.pdf).
 */
export async function uploadFolderTree(options: UploadFolderTreeOptions): Promise<UploadFolderTreeResult> {
  const { apiBase, headers, customerId, rootParentId, pickedFiles, runExtraction, onProgress } = options;

  const snapshot =
    options.existingFiles ??
    (await fetchFilesForCustomer(apiBase, headers, customerId));

  const list = pickedFiles.filter(isUploadableFile);
  const skipped = pickedFiles.length - list.length;
  const uploaded: DriveFile[] = [];
  const errors: string[] = [];
  const createdFolders: DriveFile[] = [];
  const working: DriveFile[] = [...snapshot];

  const total = list.length;
  let current = 0;

  for (const file of list) {
    current += 1;
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    onProgress?.({ current, total, fileName: file.name });

    const { dirSegments, baseName } = splitRelativeFilePath(rel, file.name);
    if (!baseName.trim()) {
      errors.push(`Skip (no name): ${rel}`);
      continue;
    }

    try {
      const { leafParentId, created } = await ensureFolderPath(
        apiBase,
        headers,
        customerId,
        dirSegments,
        rootParentId,
        working,
      );
      createdFolders.push(...created);
      working.push(...created);

      const { file: saved } = await uploadFile(apiBase, headers, {
        file,
        customerId,
        parentId: leafParentId,
        runExtraction,
      });
      uploaded.push(saved);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${file.name}: ${msg}`);
    }
  }

  return { uploaded, skipped, errors, createdFolders };
}
