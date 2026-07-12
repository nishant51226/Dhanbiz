import type { AdminLibraryDocumentRow, PortalLibrarySection, PortalLibraryTreeResponse } from "../types/api";

/** Maps portal library tree into rows compatible with the staff `DocumentsPage` grid (same shape as GET /api/documents). */
export function portalTreeToAdminDocuments(
  tree: PortalLibraryTreeResponse,
  section: PortalLibrarySection,
  customerId: string,
  customerDisplayName: string,
): AdminLibraryDocumentRow[] {
  const folderById = new Map(tree.folders.map((f) => [f.id, f]));
  return tree.documents.map((d) => ({
    ...d,
    folder: {
      id: d.folderId,
      name: folderById.get(d.folderId)?.name ?? "—",
      type: section,
      customerId,
      customer: { id: customerId, name: customerDisplayName },
    },
  }));
}
