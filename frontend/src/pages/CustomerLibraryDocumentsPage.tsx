import { useMemo } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import DocumentsPage from "./DocumentsPage";
import type { CustomerWorkspaceOutletContext } from "./customerWorkspaceContext";

/** Staff: same Files UI as `/files`, scoped to the workspace customer (GET /api/documents). */
export default function CustomerLibraryDocumentsPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { customer } = useOutletContext<CustomerWorkspaceOutletContext>();
  const staffEmbed = useMemo(
    () =>
      customerId
        ? {
            customerId,
            customerName: customer?.name ?? undefined,
          }
        : undefined,
    [customerId, customer?.name],
  );
  if (!customerId || !staffEmbed) return null;
  return <DocumentsPage staffEmbed={staffEmbed} />;
}
