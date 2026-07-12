import { useMemo } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import NewJobPage from "./NewJobPage";
import type { CustomerWorkspaceOutletContext } from "./customerWorkspaceContext";

/** Staff: new job upload scoped to the workspace customer (same pattern as library Files). */
export default function CustomerNewJobPage() {
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
  return <NewJobPage staffEmbed={staffEmbed} />;
}
