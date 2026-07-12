import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchAdminNotificationGroups,
  previewAdminBroadcast,
  sendAdminBroadcast,
  type AdminBroadcastDeliveryResult,
  type AdminBroadcastPreviewResult,
  type AdminBroadcastPushOutcome,
  type AdminNotificationGroupListRow,
} from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { NotificationGroupsPanel } from "./notifications/NotificationGroupsPanel";
import { NotificationEventsPanel } from "./notifications/NotificationEventsPanel";
import { NotificationRecipientUserPicker } from "./notifications/NotificationRecipientUserPicker";
import { notificationFieldClass } from "./notifications/notificationFieldStyles";
import {
  RECIPIENT_CHOICES,
  broadcastAudiencesFromRecipients,
  broadcastPresetsFromRecipients,
  type RecipientKey,
} from "./notifications/notification-recipients";

const fieldClass = notificationFieldClass;

function pushOutcomeLabel(outcome: AdminBroadcastPushOutcome): string {
  switch (outcome) {
    case "sent":
      return "Mobile push sent";
    case "noTokens":
      return "No device token";
    case "fcmDisabled":
      return "FCM not configured";
    case "failed":
      return "Mobile push failed";
    case "skipped":
      return "Push disabled";
    default:
      return outcome;
  }
}

function BroadcastDeliveryDebug({
  delivery,
}: {
  delivery: AdminBroadcastDeliveryResult;
}) {
  const mobileSent = delivery.recipients.filter((r) => r.push === "sent");
  const mobileMissed = delivery.recipients.filter((r) => r.push !== "sent");

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-surface-muted/40 p-3 text-sm">
      <div>
        <p className="font-semibold text-ink">Delivery debug</p>
        <p className="mt-1 text-xs text-muted">
          Web notification: {delivery.recipient_count} · Mobile push sent: {delivery.push_summary.sent} ·
          No device token: {delivery.push_summary.noTokens}
          {delivery.push_summary.fcmDisabled > 0
            ? ` · FCM not configured: ${delivery.push_summary.fcmDisabled}`
            : ""}
          {delivery.push_summary.failed > 0 ? ` · Push failed: ${delivery.push_summary.failed}` : ""}
        </p>
      </div>

      {mobileSent.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Mobile push sent ({mobileSent.length})
          </p>
          <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
            {mobileSent.map((r) => (
              <li key={r.user_id} className="rounded-md bg-surface-raised px-2 py-1 text-ink">
                {r.email}
                <span className="text-muted">
                  {" "}
                  · {r.device_token_count} device{r.device_token_count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mobileMissed.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Web notification only / no mobile push ({mobileMissed.length})
          </p>
          <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto">
            {mobileMissed.map((r) => (
              <li key={r.user_id} className="rounded-md bg-surface-raised px-2 py-1 text-ink">
                {r.email}
                <span className="text-muted"> · {pushOutcomeLabel(r.push)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function BroadcastPreviewDebug({ preview }: { preview: AdminBroadcastPreviewResult }) {
  const withPush = preview.recipients.filter((r) => r.push_eligible);
  const withoutPush = preview.recipients.filter((r) => !r.push_eligible);

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-dashed border-border bg-surface-muted/30 p-3 text-sm">
      <div>
        <p className="font-semibold text-ink">Before send · delivery preview</p>
        <p className="mt-1 text-xs text-muted">
          Web notification: all {preview.recipient_count} recipient
          {preview.recipient_count === 1 ? "" : "s"} · Mobile push: {preview.push_summary.with_tokens}{" "}
          with device token{preview.push_summary.with_tokens === 1 ? "" : "s"} ·{" "}
          {preview.push_summary.without_tokens} without
          {!preview.fcm_configured ? " · Firebase Admin not configured on server" : ""}
        </p>
      </div>

      {withPush.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Will receive mobile push ({withPush.length})
          </p>
          <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">
            {withPush.map((r) => (
              <li key={r.user_id} className="rounded-md bg-surface-raised px-2 py-1 text-ink">
                {r.email}
                <span className="text-muted">
                  {" "}
                  · {r.device_token_count} device{r.device_token_count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {withoutPush.length > 0 ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Web notification only ({withoutPush.length})
          </p>
          <ul className="mt-1 max-h-32 space-y-1 overflow-y-auto">
            {withoutPush.map((r) => (
              <li key={r.user_id} className="rounded-md bg-surface-raised px-2 py-1 text-ink">
                {r.email}
                <span className="text-muted">
                  {" "}
                  ·{" "}
                  {r.device_token_count === 0
                    ? "No device token registered"
                    : !preview.fcm_configured
                      ? "FCM not configured"
                      : "Push not eligible"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function BroadcastConfirmModal({
  open,
  preview,
  title,
  message,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  preview: AdminBroadcastPreviewResult | null;
  title: string;
  message: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open || !preview) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={busy ? undefined : onCancel}
        aria-hidden
      />
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className="relative w-full max-w-lg transform overflow-hidden rounded-2xl border border-border bg-surface-raised p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="broadcast-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="absolute right-4 top-4 text-muted-soft hover:text-muted disabled:opacity-50"
              aria-label="Close"
            >
              ✕
            </button>

            <h3 id="broadcast-confirm-title" className="text-lg font-semibold text-ink">
              Send notification?
            </h3>
            <p className="mt-1 text-sm text-muted">
              Send to {preview.recipient_count} user{preview.recipient_count === 1 ? "" : "s"} now.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-surface-muted/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Web notification
                </p>
                <p className="mt-1 text-sm font-semibold text-ink">
                  All {preview.recipient_count} user{preview.recipient_count === 1 ? "" : "s"}
                </p>
                <p className="mt-1 text-xs text-muted">Bell inbox in the web app</p>
              </div>
              <div className="rounded-lg border border-border bg-surface-muted/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Mobile push
                </p>
                <p className="mt-1 text-sm font-semibold text-ink">
                  {preview.push_summary.with_tokens} with device token
                </p>
                <p className="mt-1 text-xs text-muted">
                  {preview.push_summary.without_tokens} without device token
                  {!preview.fcm_configured ? " · FCM not configured" : ""}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-border bg-surface-muted/30 px-3 py-2 text-sm">
              <p className="font-medium text-ink">{title}</p>
              <p className="mt-1 text-muted">{message}</p>
            </div>

            <BroadcastPreviewDebug preview={preview} />

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onCancel}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className="btn btn-primary btn-lg font-bold"
              >
                {busy ? "Sending…" : "Send now"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

type SettingsTab = "broadcast" | "groups" | "event";
type BroadcastTargetMode = "groups" | "users";

function parseTab(value: string | null): SettingsTab {
  if (value === "event" || value === "campaigns" || value === "deadlines") return "event";
  if (value === "groups") return "groups";
  return "broadcast";
}

function RecipientCheckboxes({
  selected,
  onChange,
}: {
  selected: Set<RecipientKey>;
  onChange: (next: Set<RecipientKey>) => void;
}) {
  return (
    <ul className="space-y-2">
      {RECIPIENT_CHOICES.map((c) => (
        <li key={c.key}>
          <label className="flex cursor-pointer gap-3 rounded-lg border border-border px-3 py-3 hover:bg-surface-muted">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-border text-brand"
              checked={selected.has(c.key)}
              onChange={() => {
                const next = new Set(selected);
                if (next.has(c.key)) next.delete(c.key);
                else next.add(c.key);
                onChange(next);
              }}
            />
            <span>
              <span className="block text-sm font-semibold text-ink">{c.label}</span>
              {c.hint ? <span className="block text-xs text-muted">{c.hint}</span> : null}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

export default function NotificationSettingsPage() {
  const { apiBase, authHeaders } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastTargetMode, setBroadcastTargetMode] = useState<BroadcastTargetMode>("groups");
  const [broadcastRecipients, setBroadcastRecipients] = useState<Set<RecipientKey>>(() => new Set());
  const [customGroups, setCustomGroups] = useState<AdminNotificationGroupListRow[]>([]);
  const [selectedCustomGroupIds, setSelectedCustomGroupIds] = useState<Set<string>>(() => new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(() => new Set());

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [deliveryReport, setDeliveryReport] = useState<AdminBroadcastDeliveryResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmPreview, setConfirmPreview] = useState<AdminBroadcastPreviewResult | null>(null);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);

  const setTab = (next: SettingsTab) => {
    if (next === "broadcast") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: next }, { replace: true });
    }
    setErr("");
    setMsg("");
    setDeliveryReport(null);
    setConfirmOpen(false);
    setConfirmPreview(null);
    setPendingPayload(null);
  };

  const loadCustomGroups = useCallback(async () => {
    try {
      setCustomGroups(await fetchAdminNotificationGroups(apiBase, authHeaders()));
    } catch {
      setCustomGroups([]);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    if (tab === "broadcast" || tab === "groups" || tab === "event") {
      void loadCustomGroups();
    }
  }, [tab, loadCustomGroups]);

  const closeConfirmModal = () => {
    if (busy) return;
    setConfirmOpen(false);
    setConfirmPreview(null);
    setPendingPayload(null);
  };

  const buildBroadcastPayload = (): Record<string, unknown> => {
    const groupIds = [...selectedCustomGroupIds];
    if (broadcastTargetMode === "users") {
      return {
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
        user_ids: [...selectedUserIds],
        ...(groupIds.length > 0 ? { group_ids: groupIds } : {}),
        in_app_enabled: true,
        push_enabled: true,
      };
    }
    return {
      title: broadcastTitle.trim(),
      body: broadcastBody.trim(),
      presets: (() => {
        const p = broadcastPresetsFromRecipients(broadcastRecipients);
        return p.length > 0 ? p : undefined;
      })(),
      audiences: (() => {
        const a = broadcastAudiencesFromRecipients(broadcastRecipients);
        return a.length > 0 ? a : undefined;
      })(),
      ...(groupIds.length > 0 ? { group_ids: groupIds } : {}),
      in_app_enabled: true,
      push_enabled: true,
    };
  };

  const sendBroadcast = async () => {
    setErr("");
    setMsg("");
    setDeliveryReport(null);
    setConfirmOpen(false);
    setConfirmPreview(null);
    setPendingPayload(null);
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      setErr("Please enter a title and message.");
      return;
    }
    if (
      broadcastTargetMode === "groups" &&
      broadcastRecipients.size === 0 &&
      selectedCustomGroupIds.size === 0
    ) {
      setErr("Choose at least one built-in audience or custom group.");
      return;
    }
    if (broadcastTargetMode === "users" && selectedUserIds.size === 0 && selectedCustomGroupIds.size === 0) {
      setErr("Select at least one user or custom group.");
      return;
    }
    setBusy(true);
    try {
      const payload = buildBroadcastPayload();
      const preview = await previewAdminBroadcast(apiBase, authHeaders(), payload);
      setPendingPayload(payload);
      setConfirmPreview(preview);
      setConfirmOpen(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not preview broadcast");
    } finally {
      setBusy(false);
    }
  };

  const confirmSendBroadcast = async () => {
    if (!pendingPayload) return;
    setBusy(true);
    try {
      const res = await sendAdminBroadcast(apiBase, authHeaders(), pendingPayload);
      setDeliveryReport(res);
      setConfirmOpen(false);
      setConfirmPreview(null);
      setPendingPayload(null);
      setMsg(
        `Sent to ${res.recipient_count} user(s). Web notification: ${res.recipient_count}. Mobile push: ${res.push_summary.sent} sent, ${res.push_summary.noTokens} no device token${res.push_summary.failed > 0 ? `, ${res.push_summary.failed} failed` : ""}.`,
      );
      setBroadcastTitle("");
      setBroadcastBody("");
      setBroadcastRecipients(new Set());
      setSelectedCustomGroupIds(new Set());
      setSelectedUserIds(new Set());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const tabBtn = (id: SettingsTab, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold transition ${
        tab === id
          ? "relative z-[1] border-border bg-surface-raised text-brand"
          : "border-transparent text-muted hover:bg-surface-muted hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className={`mx-auto ${tab === "event" ? "max-w-5xl" : "max-w-3xl"}`}>
      <div>
        <h1 className="text-xl font-bold text-ink">Notifications</h1>
        <p className="mt-1 text-sm text-muted">
          Send a message now, or design templates for automatic events.
        </p>
      </div>

      {err ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </p>
      ) : null}
      {msg ? (
        <div className="mt-4 rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand">
          <p>{msg}</p>
          {deliveryReport ? <BroadcastDeliveryDebug delivery={deliveryReport} /> : null}
        </div>
      ) : null}

      <BroadcastConfirmModal
        open={confirmOpen}
        preview={confirmPreview}
        title={broadcastTitle.trim()}
        message={broadcastBody.trim()}
        busy={busy}
        onCancel={closeConfirmModal}
        onConfirm={() => void confirmSendBroadcast()}
      />

      <div className="mt-6 flex gap-1 border-b border-border">
        {tabBtn("broadcast", "Broadcast")}
        {tabBtn("groups", "Groups")}
        {tabBtn("event", "Events")}
      </div>

      <div className="-mt-px rounded-b-xl rounded-tr-xl border border-border bg-surface-raised p-5 shadow-sm">
        {tab === "groups" ? (
          <NotificationGroupsPanel
            apiBase={apiBase}
            authHeaders={authHeaders}
            onGroupsChanged={() => void loadCustomGroups()}
          />
        ) : tab === "broadcast" ? (
          <section className="space-y-4">
            <p className="text-sm text-muted">Send a one-time message immediately.</p>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink">Title</span>
              <input
                className={fieldClass}
                value={broadcastTitle}
                onChange={(e) => setBroadcastTitle(e.target.value)}
                placeholder="e.g. Office closed tomorrow"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink">Message</span>
              <textarea
                className={`${fieldClass} min-h-[88px]`}
                value={broadcastBody}
                onChange={(e) => setBroadcastBody(e.target.value)}
                placeholder="What should people read?"
              />
            </label>

            <div>
              <p className="mb-2 text-sm font-medium text-ink">Send to</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setBroadcastTargetMode("groups")}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                    broadcastTargetMode === "groups"
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border text-muted hover:bg-surface-muted"
                  }`}
                >
                  Groups
                </button>
                <button
                  type="button"
                  onClick={() => setBroadcastTargetMode("users")}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                    broadcastTargetMode === "users"
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border text-muted hover:bg-surface-muted"
                  }`}
                >
                  Specific users
                </button>
              </div>

              {broadcastTargetMode === "groups" ? (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      Built-in audiences
                    </p>
                    <RecipientCheckboxes
                      selected={broadcastRecipients}
                      onChange={setBroadcastRecipients}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      Custom groups
                    </p>
                    {customGroups.length === 0 ? (
                      <p className="text-xs text-muted">
                        No custom groups yet.{" "}
                        <button
                          type="button"
                          className="font-semibold text-brand hover:underline"
                          onClick={() => setTab("groups")}
                        >
                          Create one
                        </button>
                        .
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {customGroups.map((g) => (
                          <li key={g.id}>
                            <label className="flex cursor-pointer gap-3 rounded-lg border border-border px-3 py-3 hover:bg-surface-muted">
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 rounded border-border text-brand"
                                checked={selectedCustomGroupIds.has(g.id)}
                                onChange={() => {
                                  const next = new Set(selectedCustomGroupIds);
                                  if (next.has(g.id)) next.delete(g.id);
                                  else next.add(g.id);
                                  setSelectedCustomGroupIds(next);
                                }}
                              />
                              <span>
                                <span className="block text-sm font-semibold text-ink">{g.name}</span>
                                <span className="block text-xs text-muted">
                                  {g.resolved_member_count} recipient
                                  {g.resolved_member_count === 1 ? "" : "s"}
                                  {g.description ? ` · ${g.description}` : ""}
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <NotificationRecipientUserPicker
                    apiBase={apiBase}
                    authHeaders={authHeaders}
                    selectedUserIds={selectedUserIds}
                    onChange={setSelectedUserIds}
                  />
                  {customGroups.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                        Also send to custom groups
                      </p>
                      <ul className="space-y-2">
                        {customGroups.map((g) => (
                          <li key={g.id}>
                            <label className="flex cursor-pointer gap-3 rounded-lg border border-border px-3 py-2 hover:bg-surface-muted">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 rounded border-border text-brand"
                                checked={selectedCustomGroupIds.has(g.id)}
                                onChange={() => {
                                  const next = new Set(selectedCustomGroupIds);
                                  if (next.has(g.id)) next.delete(g.id);
                                  else next.add(g.id);
                                  setSelectedCustomGroupIds(next);
                                }}
                              />
                              <span className="text-sm text-ink">
                                {g.name}
                                <span className="text-muted"> · {g.resolved_member_count} recipients</span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={busy}
              className="btn btn-primary btn-lg font-bold"
              onClick={() => void sendBroadcast()}
            >
              {busy ? "Sending…" : "Send notification"}
            </button>
          </section>
        ) : (
          <NotificationEventsPanel />
        )}
      </div>
    </div>
  );
}
