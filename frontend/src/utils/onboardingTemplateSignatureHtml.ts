function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Embed drawn/uploaded signatures in onboarding HTML previews and PDF exports. */
export function signatureForPdfHtml(signature: string, imgStyle: string): string {
  const t = String(signature ?? "").trim();
  if (!t) return "&nbsp;";
  if (t.startsWith("data:image/")) {
    return `<img src="${t.replace(/"/g, "")}" alt="" style="${imgStyle}"/>`;
  }
  if (t.startsWith("file:")) {
    return `<span style="font-size:9px;color:#64748b">(signature on file)</span>`;
  }
  return esc(t);
}
