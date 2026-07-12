import { useRef } from "react";

type Props = {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  className?: string;
  /** Called with files from a directory pick (relative paths preserved where supported). */
  onPick: (files: File[]) => void | Promise<void>;
};

/**
 * Hidden directory input + button. Mirrors local folder structure via `webkitRelativePath`
 * when the browser supports directory upload.
 */
export function FolderUploadButton({ label, disabled, busy, className, onPick }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={async (e) => {
          const fl = e.target.files;
          e.target.value = "";
          if (!fl?.length) return;
          await onPick(Array.from(fl));
        }}
      />
      <button
        type="button"
        disabled={disabled || busy}
        className={className}
        onClick={() => ref.current?.click()}
      >
        {busy ? "Uploading…" : label}
      </button>
    </>
  );
}
