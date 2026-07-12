import type { AdminLibraryDocumentRow, FileDocumentAccessActor, FileDocumentAccessSummary } from "../types/api";
import { formatDateTime } from "./formatDate";

export function normalizeFileAccess(raw: AdminLibraryDocumentRow): FileDocumentAccessSummary | undefined {
  const fa =
    raw.fileAccess ??
    ((raw as Record<string, unknown>).file_access as FileDocumentAccessSummary | undefined);
  if (!fa || typeof fa !== "object") return undefined;

  const pickActor = (value: unknown): FileDocumentAccessActor | null => {
    if (!value || typeof value !== "object") return null;
    const actor = value as Record<string, unknown>;
    return {
      displayName: (actor.displayName ?? actor.display_name ?? null) as string | null,
      actorKind: String(actor.actorKind ?? actor.actor_kind ?? "system"),
      at: String(actor.at ?? actor.created_at ?? ""),
    };
  };

  return {
    uploadedBy: pickActor(fa.uploadedBy ?? (fa as Record<string, unknown>).uploaded_by),
    lastViewedBy: pickActor(fa.lastViewedBy ?? (fa as Record<string, unknown>).last_viewed_by),
    lastDownloadedBy: pickActor(
      fa.lastDownloadedBy ?? (fa as Record<string, unknown>).last_downloaded_by,
    ),
  };
}

export function formatFileAccessActor(
  actor: FileDocumentAccessActor | null | undefined,
): { label: string; tooltip: string | null } {
  if (!actor) {
    return { label: "—", tooltip: null };
  }
  let label = actor.displayName?.trim() || "";
  if (!label) {
    if (actor.actorKind === "staff") label = "Staff";
    else if (actor.actorKind === "portal") label = "Portal user";
    else if (actor.actorKind === "system") label = "System";
  }
  const when = actor.at ? new Date(actor.at) : null;
  const tooltip =
    when && !Number.isNaN(when.getTime()) ? formatDateTime(when.toISOString()) : null;
  if (!label) {
    return { label: "—", tooltip: null };
  }
  return { label, tooltip };
}

export function fileAccessActorTitle(label: string, tooltip: string | null, actionLabel: string): string | undefined {
  if (label === "—" || !tooltip) return undefined;
  return `${actionLabel} ${tooltip}`;
}
