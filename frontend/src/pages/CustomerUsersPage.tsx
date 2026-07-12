import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import {
  activateAdminPortalUser,
  createCustomerPortalUser,
  deleteAdminPracticeUser,
  fetchCustomerPortalAssignableRoles,
  patchCustomerPortalUserRole,
  postCustomerPortalUserPassword,
  type PortalAssignableRoleRow,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ModalDialog } from "../components/ui/ModalDialog";
import type { CustomerPortalUserAssignment } from "../types/api";
import { formatDateTime } from "../utils/formatDate";
import { portalRoleDisplayLabel } from "../utils/portalRoleLabel";
import { roleDisplayDescription } from "../utils/roleDescriptions";
import type { CustomerWorkspaceOutletContext } from "./customerWorkspaceContext";

function portalRoleCanManageUsers(permissions: string[] | undefined): boolean {
  return Array.isArray(permissions) && permissions.includes("portal:user:write");
}

function canRemovePortalUser(
  row: CustomerPortalUserAssignment,
  opts: { isSuperadmin: boolean; canManagePortalUsers: boolean },
): boolean {
  if (!opts.canManagePortalUsers || !row.user?.id) return false;
  if (opts.isSuperadmin) return true;
  return !portalRoleCanManageUsers(row.role?.permissions);
}

export default function CustomerUsersPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { apiBase, authHeaders, isAdmin, hasPermission } = useAuth();
  const canManagePortalUsers = isAdmin || hasPermission("portal:user:write");
  const { customer, loading, err, reload } = useOutletContext<CustomerWorkspaceOutletContext>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<PortalAssignableRoleRow[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesErr, setRolesErr] = useState("");
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<{ userId: string; email: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [actionBusyUserId, setActionBusyUserId] = useState<string | null>(null);
  const [roleChangeBusyUserId, setRoleChangeBusyUserId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; email: string; archive: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRolesLoading(true);
      setRolesErr("");
      try {
        const list = await fetchCustomerPortalAssignableRoles(apiBase, authHeaders());
        if (!cancelled) {
          setRoles(list);
          const preferred = list.find((r) => r.name === "customer_admin") ?? list[0];
          setRoleId((id) => id || preferred?.id || "");
        }
      } catch (e) {
        if (!cancelled) {
          setRolesErr(e instanceof Error ? e.message : "Could not load roles");
          setRoles([]);
        }
      } finally {
        if (!cancelled) setRolesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders]);

  const onCreate = async () => {
    if (!customerId || !roleId) return;
    setMsg("");
    setCreds(null);
    setBusy(true);
    try {
      const res = await createCustomerPortalUser(apiBase, authHeaders(), customerId, {
        email: email.trim() || undefined,
        roleId,
        password: password.trim() || undefined,
      });
      setCreds({ email: res.email, password: res.password });
      setMsg("Portal user created. Copy the password now — it will not be shown again.");
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  const openPasswordReset = (userId: string, email: string) => {
    setPasswordResetUser({ userId, email });
    setResetPassword("");
  };

  const onChangePortalRole = async (userId: string, nextRoleId: string) => {
    if (!customerId || !nextRoleId) return;
    setMsg("");
    setCreds(null);
    setRoleChangeBusyUserId(userId);
    try {
      await patchCustomerPortalUserRole(apiBase, authHeaders(), customerId, userId, nextRoleId);
      setMsg("Portal role updated.");
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Role update failed");
    } finally {
      setRoleChangeBusyUserId(null);
    }
  };

  const onActivatePortalUser = async (userId: string) => {
    setMsg("");
    setCreds(null);
    setActionBusyUserId(userId);
    try {
      await activateAdminPortalUser(apiBase, authHeaders(), userId);
      setMsg("Portal user activated.");
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Activation failed");
    } finally {
      setActionBusyUserId(null);
    }
  };

  const onDeletePortalUser = async (userId: string, archive: boolean) => {
    setMsg("");
    setCreds(null);
    setActionBusyUserId(userId);
    try {
      await deleteAdminPracticeUser(apiBase, authHeaders(), userId, { archive });
      setMsg(archive ? "Portal user deactivated." : "Portal user deleted.");
      if (passwordResetUser?.userId === userId) setPasswordResetUser(null);
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setActionBusyUserId(null);
    }
  };

  const onConfirmPasswordReset = async () => {
    if (!customerId || !passwordResetUser) return;
    const pw = resetPassword.trim();
    if (pw.length > 0 && pw.length < 8) {
      setMsg("Password must be at least 8 characters, or leave blank to generate one.");
      return;
    }
    setMsg("");
    setCreds(null);
    setResetBusy(true);
    try {
      const res = await postCustomerPortalUserPassword(apiBase, authHeaders(), customerId, passwordResetUser.userId, {
        password: pw || undefined,
      });
      setCreds({ email: res.email, password: res.password });
      setMsg("Password updated. Copy the new password now — it will not be shown again.");
      setPasswordResetUser(null);
      setResetPassword("");
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Request failed");
    } finally {
      setResetBusy(false);
    }
  };

  if (loading && !customer) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (err) {
    return <p className="text-sm text-red-400">{err}</p>;
  }

  const portalUsers: CustomerPortalUserAssignment[] = customer?.portalUsers ?? [];
  const selectedCreateRole = roles.find((r) => r.id === roleId) ?? null;

  return (
    <div className="w-full max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Portal users</h1>
        <p className="mt-1 text-sm text-muted">Logins for this customer&apos;s portal (not staff admin accounts).</p>
      </div>

      <section className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Portal logins</h2>
        <p className="mt-2 text-sm text-muted">
          Users linked to <span className="font-medium text-ink-soft">{customer?.name ?? "this customer"}</span> via
          customer portal access.
        </p>
        {portalUsers.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No portal logins yet. Create one below.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted/50 text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2.5">Email</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Linked</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {portalUsers.map((row) => (
                  <tr key={row.id} className="border-b border-border/80 last:border-0">
                    <td className="px-3 py-2.5 font-mono text-ink">{row.user?.email ?? "—"}</td>
                    <td className="px-3 py-2.5 text-ink">
                      {canManagePortalUsers && row.user?.id && row.isActive ? (
                        <select
                          value={row.role?.id ?? ""}
                          disabled={roleChangeBusyUserId === row.user.id || rolesLoading}
                          onChange={(e) => void onChangePortalRole(row.user!.id, e.target.value)}
                          className="rounded-lg border border-border bg-surface-input px-2 py-1 text-xs text-ink"
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {portalRoleDisplayLabel(r.name, r.permissions)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-ink">
                          {portalRoleDisplayLabel(row.role?.name, row.role?.permissions)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.isActive ? (
                        <span className="badge-success normal-case tracking-normal">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-soft">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-2.5 text-right">
                      {row.user?.id ? (
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {canManagePortalUsers && row.isActive ? (
                            <button
                              type="button"
                              disabled={actionBusyUserId === row.user.id}
                              onClick={() => {
                                const u = row.user;
                                if (u?.id) openPasswordReset(u.id, u.email);
                              }}
                              className="rounded-lg border border-border bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink hover:bg-surface-input disabled:opacity-50"
                            >
                              Change password
                            </button>
                          ) : null}
                          {canRemovePortalUser(row, { isSuperadmin: isAdmin, canManagePortalUsers }) ? (
                            <>
                              {row.isActive ? (
                                <button
                                  type="button"
                                  disabled={actionBusyUserId === row.user.id}
                                  onClick={() => setDeleteConfirm({ userId: row.user!.id, email: row.user!.email, archive: true })}
                                  className="rounded-lg border border-border bg-surface-muted px-2.5 py-1 text-xs font-semibold text-muted hover:bg-surface-input disabled:opacity-50"
                                >
                                  {actionBusyUserId === row.user.id ? "…" : "Deactivate"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={actionBusyUserId === row.user.id}
                                  onClick={() => void onActivatePortalUser(row.user!.id)}
                                  className="btn btn-accent btn-sm"
                                >
                                  {actionBusyUserId === row.user.id ? "…" : "Activate"}
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={actionBusyUserId === row.user.id}
                                onClick={() => setDeleteConfirm({ userId: row.user!.id, email: row.user!.email, archive: false })}
                                className="btn btn-danger btn-sm disabled:opacity-50"
                              >
                                {actionBusyUserId === row.user.id ? "Deleting…" : "Delete"}
                              </button>
                            </>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManagePortalUsers ? (
      <section className="rounded-lg border border-border bg-surface-raised p-5 shadow-sm">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted">Create portal login</h2>
        <p className="mt-2 text-sm text-muted">
          Choose the role for this login (permissions). Leave email blank to use a generated login address (shown once
          after create). Leave password blank to generate one; otherwise use at least 8 characters.
        </p>
        {rolesLoading ? <p className="mt-3 text-sm text-muted">Loading roles…</p> : null}
        {rolesErr ? <p className="mt-3 text-sm text-red-400">{rolesErr}</p> : null}
        {!rolesLoading && roles.length === 0 && !rolesErr ? (
          <p className="mt-3 text-sm text-amber-200">No assignable roles found. Add roles in Settings first.</p>
        ) : null}
        <label className="mt-4 block text-sm">
          <span className="font-medium text-ink">Role</span>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            disabled={rolesLoading || roles.length === 0}
            className="mt-1 w-full max-w-md rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {portalRoleDisplayLabel(r.name, r.permissions)}
              </option>
            ))}
          </select>
          {selectedCreateRole ? (
            <p className="mt-1 text-xs text-muted">
              {roleDisplayDescription(selectedCreateRole) ?? "Standard portal access."}
            </p>
          ) : null}
        </label>
        <label className="mt-4 block text-sm">
          <span className="font-medium text-ink">Email (optional)</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            className="mt-1 w-full max-w-md rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="font-medium text-ink">Password (optional)</span>
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to auto-generate"
            className="mt-1 w-full max-w-md rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-muted-soft"
          />
        </label>
        <button
          type="button"
          disabled={busy || !customerId || !roleId || rolesLoading}
          onClick={() => void onCreate()}
          className="mt-4 btn btn-primary btn-md"
        >
          {busy ? "Creating…" : "Create portal user"}
        </button>
        {msg ? <p className="mt-3 text-sm text-muted">{msg}</p> : null}
        {creds ? (
          <div className="mt-4 alert-success">
            <p className="font-semibold text-emerald-200">Login</p>
            <p className="mt-2 text-ink">
              <span className="text-muted">Email:</span> <span className="font-mono">{creds.email}</span>
            </p>
            <p className="mt-1 text-ink">
              <span className="text-muted">Password:</span>{" "}
              <span className="font-mono font-semibold text-brand">{creds.password}</span>
            </p>
          </div>
        ) : null}
      </section>
      ) : null}

      {passwordResetUser ? (
        <ModalDialog
          open
          onClose={() => {
            if (!resetBusy) setPasswordResetUser(null);
          }}
          disabled={resetBusy}
          titleId="portal-password-reset-title"
          className="max-w-md"
        >
            <h2 id="portal-password-reset-title" className="text-lg font-semibold text-ink">
              Change portal password
            </h2>
            <p className="mt-2 text-sm text-muted">
              New password for{" "}
              <span className="font-mono font-medium text-ink-soft">{passwordResetUser.email}</span>. Leave blank to
              generate one (shown once after you save).
            </p>
            <label className="mt-4 block text-sm">
              <span className="font-medium text-ink">New password (optional)</span>
              <input
                type="password"
                autoComplete="new-password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Leave blank to auto-generate"
                disabled={resetBusy}
                className="mt-1 w-full rounded-lg border border-border bg-surface-input px-3 py-2 text-sm text-ink placeholder:text-muted-soft disabled:opacity-60"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={resetBusy}
                onClick={() => !resetBusy && setPasswordResetUser(null)}
                className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-ink hover:bg-surface-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetBusy}
                onClick={() => void onConfirmPasswordReset()}
                className="btn btn-primary btn-sm"
              >
                {resetBusy ? "Saving…" : "Save password"}
              </button>
            </div>
        </ModalDialog>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteConfirm)}
        title={deleteConfirm?.archive ? "Deactivate portal user" : "Delete portal user"}
        message={
          deleteConfirm
            ? `Are you sure you want to ${deleteConfirm.archive ? "deactivate" : "permanently delete"} portal user "${deleteConfirm.email}"?`
            : ""
        }
        confirmLabel={deleteConfirm?.archive ? "Deactivate" : "Delete"}
        busy={actionBusyUserId !== null}
        onConfirm={() => {
          if (!deleteConfirm) return;
          const { userId, archive } = deleteConfirm;
          setDeleteConfirm(null);
          void onDeletePortalUser(userId, archive);
        }}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
