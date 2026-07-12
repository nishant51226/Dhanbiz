import type { DeadlineCampaignScheduleMode } from "../entities/deadline-campaign.entity";

export function normalizeHm(raw: string | null | undefined, fallback = "09:00"): string {
  const t = raw?.trim() ?? "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function minutesFromHm(hm: string): number {
  const [h, m] = normalizeHm(hm).split(":").map(Number);
  return h * 60 + m;
}

function hmFromMinutes(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(totalMinutes, 23 * 60 + 59));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Build London send slots from schedule settings. */
export function buildSendSlots(params: {
  scheduleMode: DeadlineCampaignScheduleMode;
  sendStartTime: string;
  sendCountPerDay: number;
  sendIntervalHours: number;
}): string[] {
  if (params.scheduleMode === "once") return [];

  const start = normalizeHm(params.sendStartTime);
  const count =
    params.scheduleMode === "daily_once" ? 1 : Math.max(2, Math.min(params.sendCountPerDay, 24));
  const intervalHours = Math.max(1, Math.min(params.sendIntervalHours, 23));

  const slots: string[] = [];
  const startMin = minutesFromHm(start);
  for (let i = 0; i < count; i++) {
    const at = startMin + i * intervalHours * 60;
    if (at >= 24 * 60) break;
    slots.push(hmFromMinutes(at));
  }
  return slots;
}

export function describeSendSchedule(params: {
  scheduleMode: DeadlineCampaignScheduleMode;
  sendStartTime: string;
  sendCountPerDay: number;
  sendIntervalHours: number;
}): string {
  if (params.scheduleMode === "once") return "Once when entering the reminder window";
  const slots = buildSendSlots(params);
  if (params.scheduleMode === "daily_once") {
    return `Daily at ${slots[0] ?? normalizeHm(params.sendStartTime)} UK`;
  }
  if (slots.length === 0) return "Daily (multiple times)";
  return `${slots.length}× daily at ${slots.join(", ")} UK (every ${params.sendIntervalHours}h from ${normalizeHm(params.sendStartTime)})`;
}

/** Infer count/interval from legacy `send_times` JSON. */
export function inferScheduleFromLegacySendTimes(sendTimes: string[]): {
  sendStartTime: string;
  sendCountPerDay: number;
  sendIntervalHours: number;
} {
  const times = sendTimes.map((t) => normalizeHm(t)).filter(Boolean);
  if (times.length === 0) {
    return { sendStartTime: "09:00", sendCountPerDay: 1, sendIntervalHours: 4 };
  }
  if (times.length === 1) {
    return { sendStartTime: times[0], sendCountPerDay: 1, sendIntervalHours: 4 };
  }
  const a = minutesFromHm(times[0]);
  const b = minutesFromHm(times[1]);
  const diffHours = Math.max(1, Math.round((b - a) / 60));
  return { sendStartTime: times[0], sendCountPerDay: times.length, sendIntervalHours: diffHours };
}
