import { useEffect, useRef, useState } from "react";

type Props = {
  blob: Blob;
};

/**
 * Renders a .docx file in the browser via docx-preview (client-only dynamic import).
 */
export function DocxFilePreview({ blob }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    const body = bodyRef.current;
    const style = styleRef.current;
    if (!body || !style) return;

    body.replaceChildren();
    style.replaceChildren();
    setErr("");
    setLoading(true);

    (async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        if (cancelled) return;
        await renderAsync(blob, body, style, {
          className: "docx-preview",
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
        });
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not render Word document");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob]);

  return (
    <div className="rounded-lg border border-border bg-white p-2">
      {loading ? <p className="text-sm text-muted">Loading preview…</p> : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      <div ref={styleRef} className="docx-preview-styles" />
      <div ref={bodyRef} className="max-h-[80vh] overflow-auto bg-white text-ink" />
    </div>
  );
}
