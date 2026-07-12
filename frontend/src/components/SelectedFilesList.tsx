type Props = {
  files: File[];
  onRemove?: (index: number) => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SelectedFilesList({ files, onRemove }: Props) {
  if (files.length === 0) return null;
  return (
    <ul className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border bg-surface-muted/40 px-3 py-2 text-xs text-ink-soft">
      {files.map((f, i) => (
        <li key={`${f.name}-${f.size}-${f.lastModified}-${i}`} className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate" title={f.name}>
            {f.name}
            <span className="ml-1 text-muted">({formatBytes(f.size)})</span>
          </span>
          {onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="shrink-0 rounded px-1.5 py-0.5 text-muted hover:bg-surface-muted hover:text-ink"
              aria-label={`Remove ${f.name}`}
            >
              ×
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
