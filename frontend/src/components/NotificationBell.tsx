import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { downloadCustomerDocumentsExport, downloadLibraryExportZip } from "../api/client";
import { useNotifications } from "../hooks/useNotifications";
import type { InboxNotificationRow } from "../types/api";
import {
  buildNotificationDisplay,
  NOTIFICATION_ACCENT_STYLES,
  type NotificationAccent,
} from "../utils/notificationDisplay";

const btn =
  "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-raised text-ink shadow-sm transition hover:bg-surface-muted";

function NotificationIcon({ accent }: { accent: NotificationAccent }) {
  const styles = NOTIFICATION_ACCENT_STYLES[accent];
  if (accent === "success") {
    return (
      <svg className={`h-5 w-5 ${styles.icon}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (accent === "error") {
    return (
      <svg className={`h-5 w-5 ${styles.icon}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
        <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
      </svg>
    );
  }
  if (accent === "info") {
    return (
      <svg className={`h-5 w-5 ${styles.icon}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="18" x2="12" y2="12" strokeLinecap="round" />
        <line x1="12" y1="8" x2="12.01" y2="8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className={`h-5 w-5 ${styles.icon}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type NotificationItemProps = {
  notification: InboxNotificationRow;
  token: string | null;
  isDownloading: boolean;
  downloadError?: string;
  onMarkRead: (id: string) => void;
  onDownloadExport: (notification: InboxNotificationRow, exportId: string) => void;
  onOpenLink: (notification: InboxNotificationRow, linkUrl: string) => void;
};

function NotificationItem({
  notification,
  token,
  isDownloading,
  downloadError,
  onMarkRead,
  onDownloadExport,
  onOpenLink,
}: NotificationItemProps) {
  const display = buildNotificationDisplay(notification);
  const styles = NOTIFICATION_ACCENT_STYLES[display.accent];
  const unread = !notification.read_at;
  const linkUrl =
    typeof notification.data?.linkUrl === "string" && notification.data.linkUrl.trim()
      ? notification.data.linkUrl.trim()
      : null;

  return (
    <li>
      <div
        className={`relative border-b border-border px-3 py-3 transition ${
          unread ? "bg-brand/[0.04]" : "opacity-80 hover:opacity-100"
        }`}
      >
        {unread ? (
          <span
            className="absolute left-1.5 top-5 h-2 w-2 rounded-full bg-brand"
            aria-label="Unread"
          />
        ) : null}

        <div className="flex gap-3 pl-2">
          <div
            className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${styles.iconWrap}`}
          >
            <NotificationIcon accent={display.accent} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles.badge}`}
                >
                  {display.category}
                </span>
                <p className="mt-1 text-sm font-semibold leading-snug text-ink">{display.title}</p>
              </div>
              <time
                dateTime={notification.created_at}
                title={display.time.full}
                className="shrink-0 pt-1 text-[10px] font-medium text-muted"
              >
                {display.time.relative}
              </time>
            </div>

            {display.summary ? (
              <p className="mt-1.5 text-xs leading-relaxed text-ink/80">{display.summary}</p>
            ) : null}

            {display.details.length > 0 ? (
              <dl className="mt-2.5 space-y-1.5 rounded-lg border border-border/70 bg-surface-muted/50 px-2.5 py-2">
                {display.details.map((row) => (
                  <div key={`${row.label}-${row.value}`} className="grid grid-cols-[4.5rem_1fr] gap-2 text-[11px]">
                    <dt className="font-semibold uppercase tracking-wide text-muted">{row.label}</dt>
                    <dd className="min-w-0 truncate font-medium text-ink" title={row.value}>
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {linkUrl ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm shadow-sm"
                  onClick={() => onOpenLink(notification, linkUrl)}
                >
                  View file
                </button>
              ) : null}
              {display.exportId ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm gap-1.5 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isDownloading || !token}
                  onClick={() => onDownloadExport(notification, display.exportId!)}
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {isDownloading ? "Starting…" : display.downloadButtonLabel ?? "Download"}
                </button>
              ) : null}
              {unread ? (
                <button
                  type="button"
                  className="text-[11px] font-semibold text-muted transition hover:text-ink"
                  onClick={() => onMarkRead(notification.id)}
                >
                  Mark read
                </button>
              ) : null}
            </div>

            {downloadError ? (
              <p className="mt-2 rounded-md bg-red-500/10 px-2 py-1.5 text-[11px] font-medium text-red-700">
                {downloadError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

export function NotificationBell({ className = "" }: { className?: string }) {
  const { token, userId, apiBase } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [downloadingExportIds, setDownloadingExportIds] = useState<Set<string>>(() => new Set());
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const panelRef = useRef<HTMLDivElement>(null);
  const { items, unreadCount, loading, refresh, markRead, markAllRead, primeNotificationSound } =
    useNotifications(token, userId);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const handleOpenLink = async (notification: InboxNotificationRow, linkUrl: string) => {
    if (!notification.read_at) {
      await markRead(notification.id);
    }
    setOpen(false);
    navigate(linkUrl.startsWith("/") ? linkUrl : `/${linkUrl}`);
  };

  const handleDownloadExport = async (notification: InboxNotificationRow, exportId: string) => {
    if (!token || downloadingExportIds.has(exportId)) return;
    setDownloadErrors((prev) => {
      if (!prev[exportId]) return prev;
      const next = { ...prev };
      delete next[exportId];
      return next;
    });
    setDownloadingExportIds((prev) => new Set(prev).add(exportId));
    try {
      const markReadPromise = !notification.read_at ? markRead(notification.id) : Promise.resolve();
      if (notification.event_key?.startsWith("customer.documents.export")) {
        await downloadCustomerDocumentsExport(apiBase, { Authorization: `Bearer ${token}` }, exportId);
      } else {
        await downloadLibraryExportZip(apiBase, { Authorization: `Bearer ${token}` }, exportId);
        window.dispatchEvent(new CustomEvent("library-export-downloaded"));
      }
      await markReadPromise;
    } catch (e) {
      setDownloadErrors((prev) => ({
        ...prev,
        [exportId]: e instanceof Error ? e.message : "Download failed",
      }));
    } finally {
      setDownloadingExportIds((prev) => {
        const next = new Set(prev);
        next.delete(exportId);
        return next;
      });
    }
  };

  return (
    <div ref={panelRef} className={`relative ${className}`.trim()}>
      <button
        type="button"
        className={btn}
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={() => {
          primeNotificationSound();
          setOpen((v) => {
            const next = !v;
            if (next) void refresh();
            return next;
          });
        }}
      >
        <svg
          className="h-5 w-5 text-brand"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-xl">
          <div className="flex items-center justify-between border-b border-border bg-surface-muted/40 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-ink">Notifications</p>
              {unreadCount > 0 ? (
                <p className="text-[11px] text-muted">
                  {unreadCount} unread {unreadCount === 1 ? "message" : "messages"}
                </p>
              ) : (
                <p className="text-[11px] text-muted">You&apos;re all caught up</p>
              )}
            </div>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-xs font-semibold text-brand transition hover:bg-brand/10"
                onClick={() => void markAllRead()}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <ul className="max-h-[min(24rem,70vh)] overflow-y-auto">
            {loading && items.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-muted">Loading notifications…</li>
            ) : null}
            {!loading && items.length === 0 ? (
              <li className="px-4 py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted">
                  <svg className="h-6 w-6 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-ink">No notifications yet</p>
                <p className="mt-1 text-xs text-muted">Export updates and alerts will appear here.</p>
              </li>
            ) : null}
            {items.map((n) => {
              const exportId =
                (n.event_key === "library.export.ready" ||
                  n.event_key === "customer.documents.export.ready") &&
                typeof n.data?.exportId === "string" &&
                n.data.exportId.trim()
                  ? n.data.exportId.trim()
                  : null;
              return (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  token={token}
                  isDownloading={exportId ? downloadingExportIds.has(exportId) : false}
                  downloadError={exportId ? downloadErrors[exportId] : undefined}
                  onMarkRead={(id) => void markRead(id)}
                  onDownloadExport={(notification, id) => void handleDownloadExport(notification, id)}
                  onOpenLink={(notification, linkUrl) => void handleOpenLink(notification, linkUrl)}
                />
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
