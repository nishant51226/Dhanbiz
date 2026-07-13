import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchAdminNotificationGroups,
  fetchAdminRoles,
  fetchDeadlineCampaignDateFields,
  fetchDeadlineCampaignEvents,
  fetchDeadlineCampaigns,
  createDeadlineCampaign,
  patchDeadlineCampaign,
  previewDeadlineCampaign,
  upsertDeadlineCampaignByDateField,
  type AdminNotificationGroupListRow,
} from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import type {
  AdminRoleRow,
  DeadlineCampaignPreviewResult,
  DeadlineCampaignRow,
  DeadlineCampaignScheduleMode,
  DeadlineEventRow,
} from "../../types/api";
import { formatDateDisplay } from "../../utils/formatDate";
import { describeSendSchedule } from "../../utils/deadlineCampaignSchedule";
import { notificationFieldClass } from "./notificationFieldStyles";
import {
  DEADLINE_RECIPIENT_CHOICES,
  deadlineAudiencesFromRecipients,
  deadlineRecipientsFromAudiences,
  type DeadlineRecipientKey,
} from "./deadline-campaign-recipients";

const fieldClass = notificationFieldClass;

type CampaignForm = {
  schedule_mode: DeadlineCampaignScheduleMode;
  send_start_time: string;
  send_count_per_day: number;
  send_interval_hours: number;
  upcoming_enabled: boolean;
  upcoming_lead_days: number;
  overdue_enabled: boolean;
  overdue_lead_days: number;
  is_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
};

function defaultForm(): CampaignForm {
  return {
    schedule_mode: "daily_once",
    send_start_time: "09:00",
    send_count_per_day: 2,
    send_interval_hours: 4,
    upcoming_enabled: true,
    upcoming_lead_days: 30,
    overdue_enabled: true,
    overdue_lead_days: 14,
    is_enabled: true,
    push_enabled: true,
    in_app_enabled: true,
  };
}

function formFromCampaign(row: DeadlineCampaignRow): CampaignForm {
  return {
    schedule_mode: row.schedule_mode,
    send_start_time: row.send_start_time || row.send_times?.[0] || "09:00",
    send_count_per_day: row.send_count_per_day || row.send_times?.length || 2,
    send_interval_hours: row.send_interval_hours || 4,
    upcoming_enabled: row.upcoming_enabled,
    upcoming_lead_days: row.upcoming_lead_days,
    overdue_enabled: row.overdue_enabled,
    overdue_lead_days: row.overdue_lead_days,
    is_enabled: row.is_enabled,
    push_enabled: row.push_enabled,
    in_app_enabled: row.in_app_enabled,
  };
}

function eventStatus(event: DeadlineEventRow): { label: string; tone: "muted" | "brand" | "amber" } {
  if (!event.campaign) return { label: "Not set up", tone: "muted" };
  if (event.campaign.is_enabled) return { label: "On", tone: "brand" };
  return { label: "Off", tone: "amber" };
}

function PreviewList({
  title,
  rows,
}: {
  title: string;
  rows: DeadlineCampaignPreviewResult["upcoming"];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {title} ({rows.length})
      </p>
      <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm">
        {rows.map((r) => (
          <li key={`${r.customer_id}-${r.phase}`} className="rounded-md bg-surface-muted/50 px-2 py-1">
            <span className="font-medium text-ink">{r.customer_name}</span>
            <span className="text-muted">
              {" "}
              · due {formatDateDisplay(r.due_date)}
              {r.phase === "upcoming" && r.days_remaining != null
                ? ` · ${r.days_remaining}d left`
                : ""}
              {r.phase === "overdue" && r.days_overdue != null
                ? ` · ${r.days_overdue}d overdue`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DeadlineCampaignsPanel({ embedded = false }: { embedded?: boolean }) {
  const { apiBase, authHeaders } = useAuth();
  const [events, setEvents] = useState<DeadlineEventRow[]>([]);
  const [groups, setGroups] = useState<AdminNotificationGroupListRow[]>([]);
  const [roles, setRoles] = useState<AdminRoleRow[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignForm>(() => defaultForm());
  const [recipients, setRecipients] = useState<Set<DeadlineRecipientKey>>(
    () => new Set(["practice_staff"]),
  );
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState<DeadlineCampaignPreviewResult | null>(null);

  const selectedEvent = useMemo(
    () => events.find((e) => e.date_field_id === selectedFieldId) ?? null,
    [events, selectedFieldId],
  );

  const loadFormForEvent = useCallback(
    (event: DeadlineEventRow) => {
      if (event.campaign) {
        setForm(formFromCampaign(event.campaign));
        setRecipients(deadlineRecipientsFromAudiences(event.campaign.audiences, roles));
        setSelectedGroupIds(new Set(event.campaign.group_ids ?? []));
      } else {
        setForm(defaultForm());
        setRecipients(new Set(["practice_staff"]));
        setSelectedGroupIds(new Set());
      }
      setPreview(null);
      setMsg("");
      setErr("");
    },
    [roles],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const headers = authHeaders();
      const [groupList, roleList] = await Promise.all([
        fetchAdminNotificationGroups(apiBase, headers),
        fetchAdminRoles(apiBase, headers),
      ]);
      setGroups(groupList);
      setRoles(roleList);

      let eventList: DeadlineEventRow[] = [];
      try {
        eventList = await fetchDeadlineCampaignEvents(apiBase, headers);
      } catch {
        const [fields, campaigns] = await Promise.all([
          fetchDeadlineCampaignDateFields(apiBase, headers),
          fetchDeadlineCampaigns(apiBase, headers),
        ]);
        const byField = new Map(campaigns.map((c) => [c.date_field_id, c]));
        eventList = fields.map((f, index) => ({
          date_field_id: f.id,
          label: f.label,
          sort_order: index,
          campaign: byField.get(f.id) ?? null,
        }));
      }
      setEvents(eventList);

      setSelectedFieldId((prev) => {
        if (prev && eventList.some((e) => e.date_field_id === prev)) return prev;
        return eventList[0]?.date_field_id ?? null;
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load deadline events");
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedFieldId || events.length === 0) return;
    const event = events.find((e) => e.date_field_id === selectedFieldId);
    if (event) loadFormForEvent(event);
  }, [selectedFieldId, events, loadFormForEvent]);

  const payload = useMemo(() => {
    if (!selectedFieldId || !selectedEvent) return null;
    return {
      date_field_id: selectedFieldId,
      name: selectedEvent.label,
      schedule_mode: form.schedule_mode,
      send_start_time: form.send_start_time,
      send_count_per_day: form.send_count_per_day,
      send_interval_hours: form.send_interval_hours,
      upcoming_enabled: form.upcoming_enabled,
      upcoming_lead_days: form.upcoming_lead_days,
      overdue_enabled: form.overdue_enabled,
      overdue_lead_days: form.overdue_lead_days,
      audiences: deadlineAudiencesFromRecipients(recipients, roles),
      group_ids: [...selectedGroupIds],
      is_enabled: form.is_enabled,
      push_enabled: form.push_enabled,
      in_app_enabled: form.in_app_enabled,
    };
  }, [form, recipients, roles, selectedGroupIds, selectedFieldId, selectedEvent]);

  const save = async () => {
    if (!selectedFieldId || !payload || !selectedEvent) return;
    if (selectedGroupIds.size === 0 && recipients.size === 0) {
      setErr("Pick at least one notification group or recipient.");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      try {
        await upsertDeadlineCampaignByDateField(apiBase, authHeaders(), selectedFieldId, payload);
      } catch {
        const existing = selectedEvent.campaign;
        const headers = authHeaders();
        if (existing) {
          await patchDeadlineCampaign(apiBase, headers, existing.id, payload);
        } else {
          await createDeadlineCampaign(apiBase, headers, payload);
        }
      }
      setMsg(`${selectedEvent?.label ?? "Event"} saved.`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    if (!payload) return;
    setBusy(true);
    setErr("");
    setPreview(null);
    try {
      setPreview(await previewDeadlineCampaign(apiBase, authHeaders(), { draft: payload }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleRecipient = (key: DeadlineRecipientKey) => {
    setRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const scheduleNeedsTimes = form.schedule_mode !== "once";
  const schedulePreview = useMemo(
    () =>
      describeSendSchedule({
        scheduleMode: form.schedule_mode,
        sendStartTime: form.send_start_time,
        sendCountPerDay: form.send_count_per_day,
        sendIntervalHours: form.send_interval_hours,
      }),
    [form],
  );

  return (
    <div className={embedded ? "space-y-4" : "mt-4 space-y-4"}>
      {!embedded ? (
        <p className="text-sm text-muted">
          Pick a <strong className="font-medium text-ink-soft">date subtype</strong>, choose groups
          or members, then set when to notify. IST (Asia/Kolkata) times.
        </p>
      ) : (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Deadline subtype</p>
          <p className="mt-1 text-sm text-muted">
            Each date below is its own subtype — pick one, then assign groups, members, and schedule.
          </p>
        </div>
      )}

      {loading ? <p className="text-sm text-muted">Loading deadline subtypes…</p> : null}

      {!loading && events.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface-muted/60 px-3 py-2 text-sm text-muted">
          No deadline fields available.
        </p>
      ) : null}

      {!loading && events.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-[minmax(11rem,13rem)_1fr]">
          <nav className="space-y-1" aria-label="Deadline subtypes">
            {events.map((event) => {
              const status = eventStatus(event);
              const active = event.date_field_id === selectedFieldId;
              return (
                <button
                  key={event.date_field_id}
                  type="button"
                  onClick={() => setSelectedFieldId(event.date_field_id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    active
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border bg-surface-raised text-ink hover:bg-surface-muted"
                  }`}
                >
                  <span className="block font-semibold leading-snug">{event.label}</span>
                  <span
                    className={`mt-0.5 block text-xs ${
                      status.tone === "brand"
                        ? "text-brand"
                        : status.tone === "amber"
                          ? "text-amber-700"
                          : "text-muted"
                    }`}
                  >
                    {status.label}
                  </span>
                </button>
              );
            })}
          </nav>

          {selectedEvent && payload ? (
            <div className="min-w-0 rounded-xl border border-border bg-surface-raised p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-ink">{selectedEvent.label}</h2>
                  <p className="mt-1 text-xs text-muted">
                    {selectedEvent.campaign
                      ? "Update groups and schedule for this date."
                      : "Turn on reminders for this date type."}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={form.is_enabled}
                    onChange={(e) => setForm((f) => ({ ...f, is_enabled: e.target.checked }))}
                  />
                  Enabled
                </label>
              </div>

              <fieldset className="mt-4 rounded-lg border border-border p-3">
                <legend className="px-1 text-sm font-semibold text-ink">Notification groups</legend>
                <p className="mt-1 text-xs text-muted">
                  Who should be notified for this date.{" "}
                  <Link to="?tab=groups" className="text-brand hover:underline">
                    Manage groups
                  </Link>
                </p>
                {groups.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    No groups yet — create one under the Groups tab, or use recipients below.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {groups.map((g) => (
                      <li key={g.id}>
                        <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 hover:bg-surface-muted">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={selectedGroupIds.has(g.id)}
                            onChange={() => {
                              setSelectedGroupIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(g.id)) next.delete(g.id);
                                else next.add(g.id);
                                return next;
                              });
                            }}
                          />
                          <span className="text-sm">
                            <span className="font-medium text-ink">{g.name}</span>
                            <span className="text-muted">
                              {" "}
                              · {g.resolved_member_count} member
                              {g.resolved_member_count === 1 ? "" : "s"}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>

              <fieldset className="mt-4 rounded-lg border border-border p-3">
                <legend className="px-1 text-sm font-semibold text-ink">Also notify</legend>
                <ul className="mt-2 space-y-2">
                  {DEADLINE_RECIPIENT_CHOICES.map((c) => (
                    <li key={c.key}>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={recipients.has(c.key)}
                          onChange={() => toggleRecipient(c.key)}
                        />
                        <span>
                          <span className="font-medium text-ink">{c.label}</span>
                          {c.hint ? (
                            <span className="block text-xs text-muted">{c.hint}</span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-ink">Upcoming window (days)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.upcoming_enabled}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, upcoming_enabled: e.target.checked }))
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      className={fieldClass}
                      disabled={!form.upcoming_enabled}
                      value={form.upcoming_lead_days}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          upcoming_lead_days: Number(e.target.value) || 0,
                        }))
                      }
                    />
                    <span className="text-muted">days before</span>
                  </div>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-ink">Overdue window (days)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.overdue_enabled}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, overdue_enabled: e.target.checked }))
                      }
                    />
                    <input
                      type="number"
                      min={0}
                      className={fieldClass}
                      disabled={!form.overdue_enabled}
                      value={form.overdue_lead_days}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          overdue_lead_days: Number(e.target.value) || 0,
                        }))
                      }
                    />
                    <span className="text-muted">days after</span>
                  </div>
                </label>
              </div>

              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-ink">How often</span>
                  <select
                    className={fieldClass}
                    value={form.schedule_mode}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        schedule_mode: e.target.value as DeadlineCampaignScheduleMode,
                      }))
                    }
                  >
                    <option value="once">Once when entering window</option>
                    <option value="daily_once">Daily — one time</option>
                    <option value="daily_multi">Daily — multiple times</option>
                  </select>
                </label>

                {scheduleNeedsTimes ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block font-medium text-ink">First send (UK)</span>
                      <input
                        type="time"
                        className={fieldClass}
                        value={form.send_start_time}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, send_start_time: e.target.value }))
                        }
                      />
                    </label>

                    {form.schedule_mode === "daily_multi" ? (
                      <>
                        <label className="block text-sm">
                          <span className="mb-1 block font-medium text-ink">Times per day</span>
                          <input
                            type="number"
                            min={2}
                            max={24}
                            className={fieldClass}
                            value={form.send_count_per_day}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                send_count_per_day: Math.max(2, Number(e.target.value) || 2),
                              }))
                            }
                          />
                        </label>
                        <label className="block text-sm sm:col-span-2">
                          <span className="mb-1 block font-medium text-ink">
                            Hours between each send
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={23}
                            className={fieldClass}
                            value={form.send_interval_hours}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                send_interval_hours: Math.max(1, Number(e.target.value) || 1),
                              }))
                            }
                          />
                        </label>
                      </>
                    ) : null}
                  </div>
                ) : null}

                <p className="rounded-md bg-surface-muted/60 px-3 py-2 text-xs text-muted">
                  {schedulePreview}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.in_app_enabled}
                    onChange={(e) => setForm((f) => ({ ...f, in_app_enabled: e.target.checked }))}
                  />
                  In-app
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.push_enabled}
                    onChange={(e) => setForm((f) => ({ ...f, push_enabled: e.target.checked }))}
                  />
                  Mobile push
                </label>
              </div>

              {preview ? (
                <div className="mt-4 rounded-lg border border-brand/30 bg-brand/5 p-3">
                  <p className="text-sm font-semibold text-ink">Would notify now</p>
                  <PreviewList title="Upcoming" rows={preview.upcoming} />
                  <PreviewList title="Overdue" rows={preview.overdue} />
                  {preview.upcoming.length === 0 && preview.overdue.length === 0 ? (
                    <p className="mt-2 text-sm text-muted">No active customers in range.</p>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save()}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
                >
                  {busy ? "Saving…" : selectedEvent.campaign ? "Save" : "Enable for this date"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void runPreview()}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-50"
                >
                  Preview
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

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
    </div>
  );
}
