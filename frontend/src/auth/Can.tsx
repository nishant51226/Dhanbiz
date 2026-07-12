import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";

type Props = {
  children: ReactNode;
  /** If true, require every listed permission. */
  allOf?: readonly string[];
  /** If true, require at least one listed permission. */
  anyOf?: readonly string[];
  /** Single permission shorthand for `anyOf: [permission]`. */
  permission?: string;
};

/** Renders `children` only when the user is admin or passes the permission check. */
export function Can({ children, permission, anyOf, allOf }: Props) {
  const { isAdmin, hasPermission, hasAnyPermission } = useAuth();

  if (isAdmin) {
    return <>{children}</>;
  }

  if (permission) {
    return hasPermission(permission) ? <>{children}</> : null;
  }

  if (allOf?.length) {
    return allOf.every((p) => hasPermission(p)) ? <>{children}</> : null;
  }

  if (anyOf?.length) {
    return hasAnyPermission(anyOf) ? <>{children}</> : null;
  }

  return null;
}
