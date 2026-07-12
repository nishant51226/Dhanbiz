import { useAuth } from "../auth/AuthContext";
import { AdminStaffLayout } from "./AdminStaffLayout";
import { AppLayout } from "./AppLayout";

/** Staff chrome vs customer portal shell based on JWT (`adm` / `cid`). */
export function AuthLayoutRouter() {
  const { authRequired } = useAuth();
  if (authRequired) {
    return <AdminStaffLayout />;
  }
  return <AppLayout />;
}
