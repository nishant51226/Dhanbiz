import type { DriveFile, PortalLibraryDocumentRow, PortalLibraryFolderRow, PortalLibraryTreeResponse } from "../types/api";

export function portalDocumentToDriveFile(customerId: string, d: PortalLibraryDocumentRow): DriveFile {
  const fileId = typeof d.metadata?.fileId === "string" ? d.metadata.fileId : null;
  return {
    id: fileId ?? d.id,
    customerId,
    parentId: d.folderId,
    fileType: "file",
    name: d.name,
    mimeType: typeof d.metadata?.mimeType === "string" ? d.metadata.mimeType : null,
    sizeBytes:
      d.metadata?.sizeBytes !== undefined && d.metadata?.sizeBytes !== null
        ? String(d.metadata.sizeBytes as number | string)
        : null,
    storageRelativePath: d.fileUrl,
    metadata: { ...d.metadata, documentId: d.id },
  };
}

/** Maps `folders` + `documents` API payload into flat `DriveFile[]` (e.g. legacy Miller UI or drive helpers). */
export function portalLibraryTreeToDriveFiles(
  customerId: string,
  tree: PortalLibraryTreeResponse,
): DriveFile[] {
  const folderRows: DriveFile[] = tree.folders.map((f: PortalLibraryFolderRow) => ({
    id: f.id,
    customerId,
    parentId: f.parentId,
    fileType: "folder" as const,
    name: f.name,
    mimeType: null,
    sizeBytes: null,
    storageRelativePath: null,
    metadata: {},
  }));
  const docRows = tree.documents.map((d) => portalDocumentToDriveFile(customerId, d));
  return [...folderRows, ...docRows];
}
