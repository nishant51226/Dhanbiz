import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";

/** Legacy route — opens edit access on the users list. */
export default function StaffSettingsUserAccessPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    const id = userId?.trim();
    navigate(id ? `/settings/users?edit=${encodeURIComponent(id)}` : "/settings/users", { replace: true });
  }, [navigate, userId]);

  return <p className="text-sm text-muted">Opening edit access…</p>;
}
