import { useOutletContext, useParams } from "react-router-dom";
import JobsPage from "./JobsPage";
import type { CustomerWorkspaceOutletContext } from "./customerWorkspaceContext";

export default function CustomerJobsPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { customer } = useOutletContext<CustomerWorkspaceOutletContext>();
  if (!customerId) return null;
  return <JobsPage staffEmbed={{ customerId, customerName: customer?.name ?? undefined }} />;
}
