import { createFolder } from "../api/client";
import type { DriveFile } from "../types/api";

/** Normalize folder segment from a path part. */
export function normalizeFolderSegment(part: string): string | null {
  const s = part.trim();
  if (!s || s === "." || s === "..") return null;
  return s.slice(0, 1024);
}

/**
 * Walks or creates folder segments under startParentId (null = customer root).
 * Mutates nothing; returns new folder rows to merge into client state.
 */
export async function ensureFolderPath(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  segments: string[],
  startParentId: string | null,
  existingFiles: DriveFile[],
): Promise<{ leafParentId: string | null; created: DriveFile[] }> {
  const created: DriveFile[] = [];
  const working: DriveFile[] = [...existingFiles, ...created];
  let parentId: string | null = startParentId;

  const pushCreated = (f: DriveFile) => {
    created.push(f);
    working.push(f);
  };

  for (const raw of segments) {
    const name = normalizeFolderSegment(raw);
    if (!name) continue;
    const hit = working.find(
      (f) => f.fileType === "folder" && f.parentId === parentId && f.name === name,
    );
    if (hit) {
      parentId = hit.id;
      continue;
    }
    const folder = await createFolder(apiBase, headers, {
      customerId,
      parentId,
      name,
    });
    pushCreated(folder);
    parentId = folder.id;
  }

  return { leafParentId: parentId, created };
}

/** Split webkitRelativePath or plain name into directory segments and file basename. */
export function splitRelativeFilePath(relativePath: string, fallbackName: string): { dirSegments: string[]; baseName: string } {
  const norm = relativePath.replace(/\\/g, "/").trim();
  const parts = norm.split("/").filter((p) => p.length > 0);
  if (parts.length === 0) {
    return { dirSegments: [], baseName: fallbackName };
  }
  const baseName = parts.pop() ?? fallbackName;
  const dirSegments = parts.map((p) => normalizeFolderSegment(p)).filter((x): x is string => x != null);
  return { dirSegments, baseName };
}

import { isUploadableFile } from "./uploadableFiles";

/** @deprecated Use `isUploadableFile` from `./uploadableFiles`. */
export function isUploadableDriveFile(file: File): boolean {
  return isUploadableFile(file);
}
