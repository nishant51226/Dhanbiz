import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import AddSubscription from "../components/subscription/AddSubscription";

/** Edit an existing pricing-matrix plan (`PUT /api/subscriptions/:planId`). */
export default function StaffEditSubscriptionPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { apiBase, authHeaders } = useAuth();

  if (!planId?.trim()) {
    return <Navigate to="/settings/subscription" replace />;
  }

  return (
    <div className="min-w-0 pb-24">
      <AddSubscription
        apiBase={apiBase}
        authHeaders={authHeaders}
        editPlanId={planId}
        backHref="/settings/subscription"
        onUpdated={() => void navigate("/settings/subscription")}
      />
    </div>
  );
}
