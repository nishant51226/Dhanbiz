import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  fetchAdminNotificationConfigs,
  patchAdminNotificationConfig,
} from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type { NotificationEventConfigRow } from "../../types/api";
import { DeadlineCampaignsPanel } from "./DeadlineCampaignsPanel";
import { notificationFieldClass } from "./notificationFieldStyles";
import { FILE_UPLOAD_EVENT, FILE_UPLOAD_EVENT_KEY } from "./notification-recipients";

const fieldClass = notificationFieldClass;

export type NotificationEventType = "file_upload" | "deadlines";

const EVENT_TYPES: { id: NotificationEventType; label: string; description: string }[] = [
  {
    id: "file_upload",
    label: "File upload",
    description: "When a file is uploaded for a customer",
  },
  {
    id: "deadlines",
    label: "Deadlines",
    description: "Upcoming or overdue dates per customer",
  },
];

type FileUploadTemplateForm = {
  title: string;
  body: string;
  enabled: boolean;
};

function parseEventType(raw: string | null): NotificationEventType {
  return raw === "deadlines" ? "deadlines" : "file_upload";
}

function FileUploadEventConfig({
  config,
  form,
  loading,
  busy,
  onFormChange,
  onSave,
}: {
  config: NotificationEventConfigRow | null;
  form: FileUploadTemplateForm;
  loading: boolean;
  busy: boolean;
  onFormChange: (next: FileUploadTemplateForm) => void;
  onSave: () => void;
}) {
  if (loading) return <p className="text-sm text-muted">Loading…</p>;
  if (!config) {
    return (
      <p className="text-sm text-muted">
        File upload notification is not set up yet. Run database migrations first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-ink">{FILE_UPLOAD_EVENT.label}</h3>
        <p className="mt-1 text-sm text-muted">{FILE_UPLOAD_EVENT.description}</p>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => onFormChange({ ...form, enabled: e.target.checked })}
        />
        <span className="font-medium">Enabled</span>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">Title</span>
        <input
          className={fieldClass}
          value={form.title}
          onChange={(e) => onFormChange({ ...form, title: e.target.value })}
          placeholder="New file uploaded"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">Message</span>
        <textarea
          className={`${fieldClass} min-h-[88px]`}
          value={form.body}
          onChange={(e) => onFormChange({ ...form, body: e.target.value })}
          placeholder="A new file was uploaded for {{customerName}}."
        />
      </label>

      <p className="text-xs text-muted">{FILE_UPLOAD_EVENT.placeholderHint}</p>

      <button
        type="button"
        disabled={busy}
        className="rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-muted disabled:opacity-50"
        onClick={onSave}
      >
        {busy ? "Saving…" : "Save template"}
      </button>
    </div>
  );
}

export function NotificationEventsPanel() {
  const { apiBase, authHeaders } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const eventType = parseEventType(searchParams.get("event"));

  const [fileUploadConfig, setFileUploadConfig] = useState<NotificationEventConfigRow | null>(null);
  const [fileUploadForm, setFileUploadForm] = useState<FileUploadTemplateForm>({
    title: "",
    body: "",
    enabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const setEventType = (next: NotificationEventType) => {
    setSearchParams({ tab: "event", event: next }, { replace: true });
    setErr("");
    setMsg("");
  };

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const list = await fetchAdminNotificationConfigs(apiBase, authHeaders());
      const row = list.find((c) => c.event_key === FILE_UPLOAD_EVENT_KEY) ?? null;
      setFileUploadConfig(row);
      if (row) {
        setFileUploadForm({
          title: row.title_template,
          body: row.body_template,
          enabled: row.is_enabled,
        });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load events");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveFileUploadTemplate = async () => {
    if (!fileUploadConfig) return;
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      await patchAdminNotificationConfig(apiBase, authHeaders(), fileUploadConfig.id, {
        event_key: fileUploadConfig.event_key,
        label: fileUploadConfig.label,
        description: fileUploadConfig.description,
        trigger_type: "event",
        title_template: fileUploadForm.title.trim(),
        body_template: fileUploadForm.body.trim(),
        is_enabled: fileUploadForm.enabled,
        push_enabled: fileUploadConfig.push_enabled,
        in_app_enabled: fileUploadConfig.in_app_enabled,
        available_placeholders: fileUploadConfig.available_placeholders,
        sort_order: fileUploadConfig.sort_order,
        audiences: fileUploadConfig.audiences.map((a) => ({
          audience_type: a.audience_type,
          role_id: a.role_id,
        })),
      });
      await load();
      setMsg("File upload template saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-5">
      <p className="text-sm text-muted">
        Choose an <strong className="font-medium text-ink-soft">event type</strong>, then configure
        it. Deadline events have a <strong className="font-medium text-ink-soft">subtype</strong>{" "}
        for each date (accounts due, VAT, etc.).
      </p>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Event type</p>
        <div className="flex flex-wrap gap-2">
          {EVENT_TYPES.map((t) => {
            const active = eventType === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setEventType(t.id)}
                className={`rounded-lg border px-4 py-2 text-left text-sm transition ${
                  active
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border bg-surface-raised text-ink hover:bg-surface-muted"
                }`}
              >
                <span className="block font-semibold">{t.label}</span>
                <span className={`mt-0.5 block text-xs ${active ? "text-brand/80" : "text-muted"}`}>
                  {t.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface-muted/30 p-4">
        {eventType === "file_upload" ? (
          <FileUploadEventConfig
            config={fileUploadConfig}
            form={fileUploadForm}
            loading={loading}
            busy={busy}
            onFormChange={setFileUploadForm}
            onSave={() => void saveFileUploadTemplate()}
          />
        ) : (
          <DeadlineCampaignsPanel embedded />
        )}
      </div>

      {err ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-brand">
          {msg}
        </p>
      ) : null}
    </section>
  );
}
