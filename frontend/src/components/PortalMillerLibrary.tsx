import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DriveFile } from "../types/api";
import { formatDate } from "../utils/formatDate";

function createdMs(f: DriveFile): number {
  const t = new Date(f.createdAt ?? 0).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function sortEntries(items: DriveFile[]): DriveFile[] {
  return [...items].sort((a, b) => {
    if (a.fileType !== b.fileType) return a.fileType === "folder" ? -1 : 1;
    const ca = createdMs(a);
    const cb = createdMs(b);
    if (ca !== cb) return cb - ca;
    return a.name.localeCompare(b.name);
  });
}

function childrenOf(files: DriveFile[], parentId: string | null): DriveFile[] {
  return sortEntries(files.filter((f) => f.parentId === parentId));
}

function folderOnly(items: DriveFile[]): DriveFile[] {
  return items.filter((f) => f.fileType === "folder");
}

function fmtBytes(sizeBytes: string | null): string {
  if (sizeBytes == null) return "-";
  const n = Number(sizeBytes);
  if (Number.isNaN(n) || n < 0) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function timeAgo(iso: string | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hours ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} days ago`;
  return formatDate(iso);
}

function fileAccent(mime: string | null, name: string): { bg: string; label: string } {
  const m = (mime ?? "").toLowerCase();
  const n = name.toLowerCase();
  if (m.includes("pdf") || n.endsWith(".pdf")) return { bg: "bg-red-500/90", label: "PDF" };
  if (m.includes("spreadsheet") || m.includes("excel") || n.endsWith(".xlsx") || n.endsWith(".xls"))
    return { bg: "bg-amber-500/90", label: "XLS" };
  if (m.startsWith("image/")) return { bg: "bg-sky-500/90", label: "IMG" };
  return { bg: "bg-slate-500/90", label: "FILE" };
}

type Props = {
  files: DriveFile[];
  rootFolderId: string | null;
  /**
   * When true, `rootFolderId` may be null: column 0 lists folders with `parentId === null`
   * (portal `folders` table — year roots). When false, null `rootFolderId` shows `emptyMessage` (legacy drive section root missing).
   */
  allowNullRoot?: boolean;
  emptyMessage: string;
  onOpenFile: (f: DriveFile) => void;
  openingFileId: string | null;
};

export function PortalMillerLibrary({
  files,
  rootFolderId,
  allowNullRoot = false,
  emptyMessage,
  onOpenFile,
  openingFileId,
}: Props) {
  const [chain, setChain] = useState<string[]>([]);
  const [fileView, setFileView] = useState<"list" | "grid">("list");

  useEffect(() => {
    setChain([]);
  }, [rootFolderId, allowNullRoot]);

  const col0 = useMemo(() => {
    if (!rootFolderId && !allowNullRoot) return [];
    return folderOnly(childrenOf(files, rootFolderId ?? null));
  }, [files, rootFolderId, allowNullRoot]);
  const col1 = useMemo(() => (chain[0] ? folderOnly(childrenOf(files, chain[0])) : []), [files, chain]);
  const col2 = useMemo(() => (chain[1] ? folderOnly(childrenOf(files, chain[1])) : []), [files, chain]);

  const fileParentId = useMemo(() => {
    if (chain[2]) return chain[2];
    if (chain.length >= 2 && folderOnly(childrenOf(files, chain[1])).length === 0) return chain[1];
    if (chain.length >= 1 && folderOnly(childrenOf(files, chain[0])).length === 0) return chain[0];
    return null;
  }, [files, chain]);

  const fileItems = useMemo(() => (fileParentId ? childrenOf(files, fileParentId) : []), [files, fileParentId]);

  const setChainAt = (depth: number, id: string) => {
    setChain((prev) => [...prev.slice(0, depth), id]);
  };

  const drillFolderFromFilePane = (f: DriveFile) => {
    setChain((prev) => {
      if (prev.length === 0) return [f.id];
      if (prev.length === 1) return [prev[0], f.id];
      return [prev[0], prev[1], f.id];
    });
  };

  const folderRow = (f: DriveFile, selectedId: string | null, onPick: () => void) => {
    const active = selectedId === f.id;
    return (
      <button
        key={f.id}
        type="button"
        onClick={onPick}
        className={`flex w-full items-center gap-2 border-b border-border-subtle px-3 py-2.5 text-left text-sm transition last:border-b-0 ${
          active ? "bg-brand/10 font-semibold text-brand" : "text-ink-soft hover:bg-surface-muted/60 hover:text-ink"
        }`}
      >
        <span className="text-base opacity-80" aria-hidden>
          {"\uD83D\uDCC1"}
        </span>
        <span className="min-w-0 flex-1 truncate">{f.name}</span>
        {active ? <span className="shrink-0 text-brand">{"\u203A"}</span> : null}
      </button>
    );
  };

  const columnShell = (title: string, body: ReactNode, muted?: boolean) => (
    <div
      className={`flex min-h-0 min-w-[200px] max-w-[280px] flex-1 flex-col border-r border-border bg-surface-muted/15 ${
        muted ? "opacity-60" : ""
      }`}
    >
      <div className="shrink-0 border-b border-border px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{title}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
    </div>
  );

  const filesHeaderCount = fileItems.filter((f) => f.fileType === "file").length;

  if (!rootFolderId && !allowNullRoot) {
    return <p className="rounded-xl border border-border bg-surface-muted/20 p-6 text-sm text-muted">{emptyMessage}</p>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-raised shadow-inner">
      <div className="flex min-h-[min(520px,calc(100vh-14rem))] min-w-0 flex-1 divide-x divide-border">
        {columnShell(
          "Fiscal year",
          col0.length === 0 ? (
            <p className="p-3 text-xs text-muted">No folders yet.</p>
          ) : (
            col0.map((f) => folderRow(f, chain[0] ?? null, () => setChainAt(0, f.id)))
          ),
        )}
        {columnShell(
          "Period",
          !chain[0] ? (
            <p className="p-3 text-xs text-muted">Select a year.</p>
          ) : col1.length === 0 ? (
            <p className="p-3 text-xs text-muted">No period folders.</p>
          ) : (
            col1.map((f) => folderRow(f, chain[1] ?? null, () => setChainAt(1, f.id)))
          ),
          !chain[0],
        )}
        {columnShell(
          "Category",
          !chain[1] ? (
            <p className="p-3 text-xs text-muted">Select a period.</p>
          ) : col2.length === 0 ? (
            <p className="p-3 text-xs text-muted">No subfolders — files appear on the right.</p>
          ) : (
            col2.map((f) => folderRow(f, chain[2] ?? null, () => setChainAt(2, f.id)))
          ),
          !chain[1],
        )}
        <div className="relative flex min-h-0 min-w-0 flex-[1.4] flex-col bg-surface-muted/10">
          <div className="absolute inset-0 overflow-hidden opacity-[0.04] pointer-events-none" aria-hidden>
            <div className="flex h-full w-full items-center justify-center text-[180px] font-light text-ink">{"\u2699"}</div>
          </div>
          <div className="relative z-[1] flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
              Files ({filesHeaderCount})
            </p>
            <div className="flex gap-1 rounded-lg border border-border bg-surface-raised p-0.5">
              <button
                type="button"
                title="List"
                onClick={() => setFileView("list")}
                className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${
                  fileView === "list" ? "bg-brand/15 text-brand" : "text-muted hover:text-ink"
                }`}
              >
                List
              </button>
              <button
                type="button"
                title="Grid"
                onClick={() => setFileView("grid")}
                className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${
                  fileView === "grid" ? "bg-brand/15 text-brand" : "text-muted hover:text-ink"
                }`}
              >
                Grid
              </button>
            </div>
          </div>
          <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto p-2">
            {!fileParentId ? (
              <p className="p-3 text-xs text-muted">Select year, period, and category (when present) to see files.</p>
            ) : fileItems.length === 0 ? (
              <p className="p-3 text-xs text-muted">This folder is empty.</p>
            ) : fileView === "grid" ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {fileItems.map((f) => {
                  if (f.fileType === "folder") {
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => drillFolderFromFilePane(f)}
                        className="flex flex-col rounded-lg border border-border bg-surface-raised/80 p-3 text-left transition hover:border-brand/40"
                      >
                        <span className="text-xl text-brand">{"\uD83D\uDCC1"}</span>
                        <span className="mt-1 line-clamp-2 text-sm font-medium text-ink">{f.name}</span>
                      </button>
                    );
                  }
                  const acc = fileAccent(f.mimeType, f.name);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={openingFileId === f.id}
                      onClick={() => onOpenFile(f)}
                      className="flex flex-col rounded-lg border border-border bg-surface-raised/80 p-3 text-left transition hover:border-brand/40 disabled:opacity-50"
                    >
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded text-[10px] font-bold text-white ${acc.bg}`}>
                        {acc.label}
                      </span>
                      <span className="mt-2 line-clamp-2 text-sm font-medium text-ink">{f.name}</span>
                      <span className="mt-1 text-[11px] text-muted">
                        Uploaded {timeAgo(f.createdAt)} · {fmtBytes(f.sizeBytes)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <ul className="space-y-1">
                {fileItems.map((f) => {
                  if (f.fileType === "folder") {
                    return (
                      <li key={f.id}>
                        <button
                          type="button"
                          onClick={() => drillFolderFromFilePane(f)}
                          className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-border hover:bg-surface-muted/50"
                        >
                          <span className="text-lg text-brand">{"\uD83D\uDCC1"}</span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{f.name}</span>
                          <span className="text-muted">{"\u203A"}</span>
                        </button>
                      </li>
                    );
                  }
                  const acc = fileAccent(f.mimeType, f.name);
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        disabled={openingFileId === f.id}
                        onClick={() => onOpenFile(f)}
                        className="flex w-full items-start gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition hover:border-border hover:bg-surface-muted/50 disabled:opacity-50"
                      >
                        <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-[10px] font-bold text-white ${acc.bg}`}>
                          {acc.label}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{f.name}</span>
                          <span className="mt-0.5 block text-[11px] text-muted">
                            Uploaded {timeAgo(f.createdAt)} · {fmtBytes(f.sizeBytes)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
