function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Inline HTML for a signature field in PDF templates: embed data URLs as {@code img},
 * show a hint for unresolved {@code file:} refs, otherwise escaped text.
 */
export function signatureForPdfHtml(signature: string, imgStyle: string): string {
  const t = String(signature ?? "").trim();
  if (!t) return "&nbsp;";
  if (t.startsWith("data:image/")) {
    /* imgStyle is template-supplied CSS only, not user input */
    return `<img src="${t.replace(/"/g, "")}" alt="" style="${imgStyle}"/>`;
  }
  if (t.startsWith("file:")) {
    return `<span style="font-size:9px;color:#64748b">(signature on file)</span>`;
  }
  return esc(t);
}
