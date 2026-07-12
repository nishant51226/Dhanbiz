import { useEffect, useRef, useState } from "react";
import { fetchFileContentBlob } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { resolvePreviewKind } from "../utils/filePreviewKind";
import { DocxFilePreview } from "./DocxFilePreview";
import { PdfJsPageRangePreview } from "./PdfJsPageRangePreview";
import { TabularFilePreview } from "./TabularFilePreview";

type Props = {
  /** Drive `files.id` — used when `loadBlob` is not set. */
  fileId?: string;
  /** Override fetch (e.g. portal `documents` binary). */
  loadBlob?: () => Promise<Blob>;
  mimeType: string | null;
  fileName?: string;
  /** When set for a PDF, render only these 1-based pages via PDF.js. */
  pdfPageRange?: { start: number; end: number };
};

function DownloadOnlyPreview({
  blob,
  fileName,
  mimeType,
}: {
  blob: Blob;
  fileName?: string;
  mimeType: string | null;
}) {
  const url = URL.createObjectURL(blob);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const label = fileName?.trim() || "this file";
  return (
    <div className="rounded-lg border border-border bg-surface-muted p-4 text-sm">
      <p className="font-medium text-ink">Inline preview is not available for {label}.</p>
      <p className="mt-1 text-muted">
        {mimeType ? `Type: ${mimeType}. ` : ""}
        You can download the original file to open it locally.
      </p>
      <a
        href={url}
        download={fileName?.trim() || "download"}
        className="mt-3 inline-flex rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-semibold text-brand shadow-sm hover:bg-surface-muted"
      >
        Download file
      </a>
    </div>
  );
}

export function OriginalFilePreview({ fileId, loadBlob, mimeType, fileName, pdfPageRange }: Props) {
  const previewKind = resolvePreviewKind(mimeType, fileName);

  if (previewKind === "pdf" && pdfPageRange) {
    return (
      <PdfJsPageRangePreview
        fileId={fileId}
        loadBlob={loadBlob}
        pageStart={pdfPageRange.start}
        pageEnd={pdfPageRange.end}
      />
    );
  }

  const { apiBase, authHeaders } = useAuth();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);
  const blobRef = useRef<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBlob(null);
    setLoadErr("");
    setLoading(true);
    blobRef.current = null;

    (async () => {
      try {
        const nextBlob = loadBlob
          ? await loadBlob()
          : fileId
            ? await fetchFileContentBlob(apiBase, authHeaders(), fileId)
            : null;
        if (!nextBlob) {
          if (!cancelled) setLoadErr("Nothing to preview.");
          return;
        }
        if (cancelled) return;
        blobRef.current = nextBlob;
        setBlob(nextBlob);
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : "Could not load file");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      blobRef.current = null;
    };
  }, [apiBase, authHeaders, fileId, loadBlob]);

  if (loading) {
    return <p className="text-sm text-muted">Loading preview…</p>;
  }
  if (loadErr) {
    return <p className="text-sm text-red-400">{loadErr}</p>;
  }
  if (!blob) {
    return <p className="text-sm text-muted">No preview available.</p>;
  }

  if (previewKind === "heic") {
    return <HeicImagePreview blob={blob} fileName={fileName} />;
  }

  if (previewKind === "image") {
    const url = URL.createObjectURL(blob);
    return (
      <ImagePreview url={url} />
    );
  }

  if (previewKind === "csv" || previewKind === "spreadsheet" || previewKind === "text") {
    return <TabularFilePreview blob={blob} kind={previewKind} fileName={fileName} />;
  }

  if (previewKind === "pdf") {
    const url = URL.createObjectURL(blob);
    return <PdfIframePreview url={url} />;
  }

  if (previewKind === "docx") {
    return <DocxFilePreview blob={blob} />;
  }

  return <DownloadOnlyPreview blob={blob} fileName={fileName} mimeType={mimeType} />;
}

function ImagePreview({ url }: { url: string }) {
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="flex max-h-[80vh] justify-center overflow-auto rounded-lg border border-border bg-surface-muted p-2">
      <img src={url} alt="Original file" className="max-h-[78vh] w-auto max-w-full object-contain" />
    </div>
  );
}

function HeicImagePreview({ blob, fileName }: { blob: Blob; fileName?: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setLoadErr("");
    setPreviewUrl(null);

    void (async () => {
      try {
        const heic2any = (await import("heic2any")).default;
        const converted = await heic2any({ blob, toType: "image/jpeg", quality: 0.92 });
        const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
        if (!jpegBlob || cancelled) return;
        objectUrl = URL.createObjectURL(jpegBlob);
        setPreviewUrl(objectUrl);
      } catch (e) {
        if (!cancelled) {
          setLoadErr(e instanceof Error ? e.message : "Could not preview HEIC file");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blob]);

  if (loading) {
    return <p className="text-sm text-muted">Converting HEIC for preview…</p>;
  }
  if (loadErr) {
    return <DownloadOnlyPreview blob={blob} fileName={fileName} mimeType="image/heic" />;
  }
  if (!previewUrl) {
    return <p className="text-sm text-muted">No preview available.</p>;
  }
  return <ImagePreview url={previewUrl} />;
}

function PdfIframePreview({ url }: { url: string }) {
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <iframe
      title="Original file"
      src={url}
      className="min-h-[70vh] w-full rounded-lg border border-border bg-surface-raised"
    />
  );
}
