import type { InboxNotificationRow } from "../types/api";
import { formatDateTime } from "./formatDate";

export type NotificationAccent = "brand" | "success" | "error" | "info" | "neutral";

export type NotificationDetailRow = {
  label: string;
  value: string;
};

export type NotificationDisplay = {
  accent: NotificationAccent;
  category: string;
  title: string;
  summary: string;
  details: NotificationDetailRow[];
  exportId: string | null;
  zipFileName: string | null;
  downloadButtonLabel: string | null;
  time: { relative: string; full: string };
};

const VIEW_MODE_LABELS: Record<string, string> = {
  folderView: "Folder view",
  customerView: "Customer view",
  dateView: "Date view",
};

function dataString(data: Record<string, unknown> | undefined, key: string): string | null {
  const value = data?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dataBoolean(data: Record<string, unknown> | undefined, key: string): boolean {
  return data?.[key] === true;
}

function parseFilterDetails(data: Record<string, unknown>): NotificationDetailRow[] {
  const raw = data.filterDetails;
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as { label?: unknown; value?: unknown };
        if (typeof row.label !== "string" || typeof row.value !== "string") return null;
        const label = row.label.trim();
        const value = row.value.trim();
        return label && value ? { label, value } : null;
      })
      .filter((row): row is NotificationDetailRow => row != null)
      .filter((row) => row.label !== "Library" && row.label !== "ZIP");
  }

  const fallback: NotificationDetailRow[] = [];
  const viewMode = dataString(data, "viewMode");
  if (viewMode && VIEW_MODE_LABELS[viewMode]) {
    fallback.push({ label: "View", value: VIEW_MODE_LABELS[viewMode] });
  }
  const customerName = dataString(data, "customerName");
  if (customerName) fallback.push({ label: "Customer", value: customerName });
  const searchText = dataString(data, "searchText");
  if (searchText) fallback.push({ label: "Search", value: `"${searchText}"` });
  if (dataBoolean(data, "assignedOnly")) {
    fallback.push({ label: "Assigned", value: "Assigned to me only" });
  }
  const folderName = dataString(data, "folderName");
  if (folderName) fallback.push({ label: "Folder", value: folderName });
  return fallback;
}

function buildLibraryExportDetails(
  data: Record<string, unknown>,
  fileCount: number | null,
): NotificationDetailRow[] {
  const details = parseFilterDetails(data).filter((row) => row.label !== "Library" && row.label !== "ZIP");
  const customerName = dataString(data, "customerName");
  if (customerName && !details.some((row) => row.label === "Customer")) {
    details.unshift({ label: "Customer", value: customerName });
  }
  if (fileCount != null && !details.some((row) => row.label === "Files")) {
    details.push({ label: "Files", value: fileCount.toLocaleString() });
  }
  const order = (label: string) => {
    if (label === "Customer") return 0;
    if (label === "View") return 1;
    if (label === "Files") return 2;
    return 3;
  };
  details.sort((a, b) => order(a.label) - order(b.label) || a.label.localeCompare(b.label));
  return details;
}

function dataNumber(data: Record<string, unknown> | undefined, key: string): number | null {
  const value = data?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function libraryExportSummary(
  notification: InboxNotificationRow,
  isFailed: boolean,
): string {
  if (isFailed) {
    return notification.body.trim() || "The ZIP export could not be completed.";
  }
  return "";
}

export function formatNotificationTime(iso: string): { relative: string; full: string } {
  const date = new Date(iso);
  const full = formatDateTime(iso);
  if (Number.isNaN(date.getTime())) return { relative: full, full };

  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 45) return { relative: "Just now", full };
  if (diffSec < 3600) {
    const mins = Math.max(1, Math.round(diffSec / 60));
    return { relative: `${mins} min ago`, full };
  }
  if (diffSec < 86400) {
    const hours = Math.max(1, Math.round(diffSec / 3600));
    return { relative: `${hours} hr ago`, full };
  }
  if (diffSec < 604800) {
    const days = Math.max(1, Math.round(diffSec / 86400));
    return { relative: `${days} day${days === 1 ? "" : "s"} ago`, full };
  }
  return { relative: full, full };
}

function eventCategory(eventKey: string | null): string {
  if (!eventKey) return "Notification";
  if (eventKey.startsWith("customer.documents.export")) return "Extraction report";
  if (eventKey.startsWith("library.export")) return "Library export";
  if (eventKey === "file.uploaded") return "File upload";
  if (eventKey === "file.assigned") return "File assignment";
  if (eventKey === "customer.created") return "Customer";
  if (eventKey === "broadcast") return "Announcement";
  return eventKey.replace(/\./g, " · ");
}

function libraryExportDisplay(notification: InboxNotificationRow): NotificationDisplay {
  const data = notification.data ?? {};
  const fileCount = dataNumber(data, "fileCount");
  const customerName = dataString(data, "customerName");
  const zipFileName = dataString(data, "zipFileName");
  const exportId = dataString(data, "exportId");
  const isFailed = notification.event_key === "library.export.failed";
  const time = formatNotificationTime(notification.created_at);
  const details = buildLibraryExportDetails(data, fileCount);

  if (isFailed) {
    return {
      accent: "error",
      category: "Library export",
      title: customerName ? `${customerName} export failed` : "Export failed",
      summary: libraryExportSummary(notification, true),
      details,
      exportId: null,
      zipFileName: null,
      downloadButtonLabel: null,
      time,
    };
  }

  return {
    accent: "success",
    category: "Library export",
    title: customerName ? `${customerName} export ready` : "Export ready",
    summary: libraryExportSummary(notification, false),
    details,
    exportId,
    zipFileName,
    downloadButtonLabel: "Download ZIP",
    time,
  };
}

function customerDocumentsExportDisplay(notification: InboxNotificationRow): NotificationDisplay {
  const data = notification.data ?? {};
  const documentCount = dataNumber(data, "documentCount");
  const customerName = dataString(data, "customerName");
  const xlsxFileName = dataString(data, "xlsxFileName");
  const exportId = dataString(data, "exportId");
  const isFailed = notification.event_key === "customer.documents.export.failed";
  const time = formatNotificationTime(notification.created_at);

  const details: NotificationDetailRow[] = [];
  if (customerName) details.push({ label: "Customer", value: customerName });
  const from = dataString(data, "from");
  const to = dataString(data, "to");
  if (from && to) details.push({ label: "Dates", value: `${from} → ${to}` });
  const layoutLabel = dataString(data, "layoutLabel");
  if (layoutLabel) details.push({ label: "Layout", value: layoutLabel });
  if (documentCount != null) details.push({ label: "Documents", value: documentCount.toLocaleString() });
  if (xlsxFileName) details.push({ label: "File", value: xlsxFileName });

  if (isFailed) {
    return {
      accent: "error",
      category: "Customer report",
      title: customerName ? `${customerName} report failed` : "Report failed",
      summary: (notification.body ?? "").trim() || "The Excel export could not be completed.",
      details,
      exportId: null,
      zipFileName: null,
      downloadButtonLabel: null,
      time,
    };
  }

  return {
    accent: "success",
    category: "Customer report",
    title: customerName ? `${customerName} Excel report ready` : "Excel report ready",
    summary: "",
    details,
    exportId,
    zipFileName: xlsxFileName,
    downloadButtonLabel: "Download Excel",
    time,
  };
}

function fileUploadedDisplay(notification: InboxNotificationRow): NotificationDisplay {
  const data = notification.data ?? {};
  const fileName = dataString(data, "fileName");
  const customerName = dataString(data, "customerName");
  const details: NotificationDetailRow[] = [];
  if (customerName) details.push({ label: "Customer", value: customerName });
  if (fileName) details.push({ label: "File", value: fileName });

  return {
    accent: "info",
    category: "File upload",
    title: notification.name.trim() || "New file uploaded",
    summary:
      fileName && customerName
        ? `${fileName} uploaded for ${customerName}`
        : notification.body.trim() || "A new file was uploaded.",
    details,
    exportId: null,
    zipFileName: null,
    downloadButtonLabel: null,
    time: formatNotificationTime(notification.created_at),
  };
}

function fileAssignedDisplay(notification: InboxNotificationRow): NotificationDisplay {
  const data = notification.data ?? {};
  const fileName = dataString(data, "fileName");
  const customerName = dataString(data, "customerName");
  const details: NotificationDetailRow[] = [];
  if (customerName) details.push({ label: "Customer", value: customerName });
  if (fileName) details.push({ label: "File", value: fileName });

  return {
    accent: "brand",
    category: "File assignment",
    title: notification.name.trim() || "File assigned to you",
    summary:
      fileName && customerName
        ? `${fileName} for ${customerName} was assigned to you`
        : notification.body.trim() || "A file was assigned to you.",
    details,
    exportId: null,
    zipFileName: null,
    downloadButtonLabel: null,
    time: formatNotificationTime(notification.created_at),
  };
}

export function buildNotificationDisplay(notification: InboxNotificationRow): NotificationDisplay {
  const eventKey = notification.event_key;
  if (eventKey === "customer.documents.export.ready" || eventKey === "customer.documents.export.failed") {
    return customerDocumentsExportDisplay(notification);
  }
  if (eventKey === "library.export.ready" || eventKey === "library.export.failed") {
    return libraryExportDisplay(notification);
  }
  if (eventKey === "file.uploaded") {
    return fileUploadedDisplay(notification);
  }
  if (eventKey === "file.assigned") {
    return fileAssignedDisplay(notification);
  }

  return {
    accent: "neutral",
    category: eventCategory(eventKey),
    title: notification.name.trim() || "Notification",
    summary: notification.body.trim() || "You have a new notification.",
    details: [],
    exportId: null,
    zipFileName: null,
    downloadButtonLabel: null,
    time: formatNotificationTime(notification.created_at),
  };
}

export const NOTIFICATION_ACCENT_STYLES: Record<
  NotificationAccent,
  { iconWrap: string; icon: string; badge: string }
> = {
  brand: {
    iconWrap: "bg-brand/10 text-brand",
    icon: "text-brand",
    badge: "bg-brand/10 text-brand",
  },
  success: {
    iconWrap: "bg-emerald-500/10 text-emerald-700",
    icon: "text-emerald-600",
    badge: "bg-emerald-500/10 text-emerald-700",
  },
  error: {
    iconWrap: "bg-red-500/10 text-red-700",
    icon: "text-red-600",
    badge: "bg-red-500/10 text-red-700",
  },
  info: {
    iconWrap: "bg-sky-500/10 text-sky-700",
    icon: "text-sky-600",
    badge: "bg-sky-500/10 text-sky-700",
  },
  neutral: {
    iconWrap: "bg-surface-muted text-muted",
    icon: "text-muted",
    badge: "bg-surface-muted text-muted",
  },
};
