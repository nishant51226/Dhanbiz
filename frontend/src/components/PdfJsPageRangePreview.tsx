import * as pdfjsLib from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { fetchFileContentBlob } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

type Props = {
  fileId?: string;
  loadBlob?: () => Promise<Blob>;
  pageStart: number;
  pageEnd: number;
};

export function PdfJsPageRangePreview({ fileId, loadBlob, pageStart, pageEnd }: Props) {
  const { apiBase, authHeaders } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    setErr("");
    setLoading(true);
    if (container) container.replaceChildren();

    (async () => {
      try {
        const blob = loadBlob
          ? await loadBlob()
          : fileId
            ? await fetchFileContentBlob(apiBase, authHeaders(), fileId)
            : null;
        if (!blob) {
          if (!cancelled) setErr("Nothing to preview.");
          return;
        }
        const data = new Uint8Array(await blob.arrayBuffer());
        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data }).promise;
        try {
          if (cancelled) return;
          const numPages = pdf.numPages;
          const lo = Math.min(pageStart, pageEnd);
          const hi = Math.max(pageStart, pageEnd);
          const start = Math.max(1, Math.min(lo, numPages));
          const end = Math.max(start, Math.min(hi, numPages));
          const el = containerRef.current;
          if (!el || cancelled) return;

          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const maxCssWidth = 820;

          for (let p = start; p <= end; p++) {
            if (cancelled) break;
            const page = await pdf.getPage(p);
            const base = page.getViewport({ scale: 1 });
            const cssScale = Math.min(1.75, maxCssWidth / base.width);
            const viewport = page.getViewport({ scale: cssScale * dpr });

            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.width = `${viewport.width / dpr}px`;
            canvas.style.height = `${viewport.height / dpr}px`;
            canvas.className = "block max-w-full rounded border border-border bg-surface-raised shadow-sm";

            await page.render({ canvasContext: ctx, viewport }).promise;

            const wrap = document.createElement("div");
            wrap.className = "mb-4 last:mb-0";
            const label = document.createElement("p");
            label.className = "mb-1 text-xs font-medium text-muted";
            label.textContent = `Page ${p}`;
            wrap.appendChild(label);
            wrap.appendChild(canvas);
            el.appendChild(wrap);
          }
        } finally {
          await pdf.destroy();
        }
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Could not render PDF");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBase, authHeaders, fileId, loadBlob, pageStart, pageEnd]);

  return (
    <div className="rounded-lg border border-border bg-surface-muted p-3">
      {loading ? <p className="text-sm text-muted">Loading preview…</p> : null}
      {err ? <p className="text-sm text-red-400">{err}</p> : null}
      <div ref={containerRef} className="max-h-[80vh] overflow-auto" />
    </div>
  );
}
