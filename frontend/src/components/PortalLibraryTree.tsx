import type { DriveFile } from "../types/api";

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

function fmtBytes(sizeBytes: string | null): string {
  if (sizeBytes == null) return "-";
  const n = Number(sizeBytes);
  if (Number.isNaN(n) || n < 0) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function libraryBreadcrumb(
  files: DriveFile[],
  browseId: string,
  rootId: string,
): { id: string; name: string }[] {
  const byId = new Map(files.map((f) => [f.id, f] as const));
  const parts: { id: string; name: string }[] = [];
  let cur: string | null = browseId;
  while (cur) {
    const f = byId.get(cur);
    if (!f) break;
    parts.unshift({ id: f.id, name: f.name });
    if (cur === rootId) break;
    cur = f.parentId;
  }
  return parts;
}

type Props = {
  files: DriveFile[];
  rootFolderId: string | null;
  browseId: string | null;
  setBrowseId: (id: string | null) => void;
  onOpenFile: (f: DriveFile) => void;
  openingFileId: string | null;
  emptyMessage: string;
};

export function PortalLibraryTree({
  files,
  rootFolderId,
  browseId,
  setBrowseId,
  onOpenFile,
  openingFileId,
  emptyMessage,
}: Props) {
  if (!rootFolderId) {
    return <p className="rounded-xl border border-border bg-surface-muted/20 p-4 text-sm text-muted">{emptyMessage}</p>;
  }

  const activeId = browseId ?? rootFolderId;
  const crumbs = libraryBreadcrumb(files, activeId, rootFolderId);
  const listItems = childrenOf(files, activeId);

  const goUp = () => {
    if (activeId === rootFolderId) return;
    const f = files.find((x) => x.id === activeId);
    const p = f?.parentId;
    if (!p) return;
    setBrowseId(p === rootFolderId ? rootFolderId : p);
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={activeId === rootFolderId}
          onClick={goUp}
          className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-ink-soft hover:bg-surface-muted disabled:opacity-40"
        >
          Up
        </button>
        <div className="flex flex-wrap items-center gap-1 text-sm text-muted">
          {crumbs.map((b, i) => (
            <span key={b.id} className="flex items-center gap-1">
              {i > 0 ? <span className="text-border">/</span> : null}
              <button
                type="button"
                className={`font-medium ${b.id === activeId ? "text-brand" : "text-ink-soft hover:text-brand"}`}
                onClick={() => setBrowseId(b.id)}
              >
                {b.name}
              </button>
            </span>
          ))}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {listItems.length === 0 ? (
          <p className="col-span-full text-sm text-muted">This folder is empty.</p>
        ) : (
          listItems.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={openingFileId === f.id}
              onClick={() => {
                if (f.fileType === "folder") setBrowseId(f.id);
                else onOpenFile(f);
              }}
              className={`flex flex-col items-start rounded-lg border border-dashed border-border bg-surface-raised/60 p-3 text-left transition hover:border-brand/50 hover:bg-surface-muted/40 ${
                openingFileId === f.id ? "opacity-60" : ""
              }`}
            >
              <span className="text-xl text-brand" aria-hidden>
                {f.fileType === "folder" ? "\uD83D\uDCC1" : "\uD83D\uDCC4"}
              </span>
              <span className="mt-1 line-clamp-2 text-sm font-semibold text-ink">{f.name}</span>
              {f.fileType === "file" ? (
                <span className="mt-0.5 text-[11px] text-muted">
                  {fmtBytes(f.sizeBytes)} · {f.mimeType ?? "file"}
                </span>
              ) : (
                <span className="mt-0.5 text-[11px] text-muted">Folder</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
