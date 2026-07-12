import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import AddSubscription from "../components/subscription/AddSubscription";

/** Full-page create plan flow (Settings → Subscription → Add plan). */
export default function StaffAddSubscriptionPage() {
  const navigate = useNavigate();
  const { apiBase, authHeaders } = useAuth();

  return (
    <div className="min-w-0 pb-24">
      <AddSubscription
        apiBase={apiBase}
        authHeaders={authHeaders}
        backHref="/settings/subscription"
        onCreated={() => void navigate("/settings/subscription")}
      />
    </div>
  );
}
