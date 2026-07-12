import { SignatureMaker } from "@docuseal/signature-maker-react";
import { useCallback, useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { sendClientRegistrationSignatureEmailRequest } from "../../api/client";
import type {
  CustomerFormSubmission,
  CustomerFormSubmissionFormKey,
  CustomerFormSubmissionMetadata,
  OnboardingDocusealSignatureTarget,
} from "../../types/api";
import type { CustomerOnboardingData } from "../../types/customerOnboarding";
import { docusealPrefillForSignatureTarget } from "../../utils/docusealPrefillFromOnboarding";
import { parseOnboardingSignatureFileId } from "../../utils/onboardingSignatureFile";
import { inp, lab } from "./fieldStyles";

type SignatureMakerChangeDetail = {
  base64?: string | null;
  blob?: Blob | null;
};

function signatureDetailToStoredValue(detail: SignatureMakerChangeDetail): string {
  const b = detail?.base64;
  if (!b) return "";
  return b.startsWith("data:") ? b : `data:image/png;base64,${b}`;
}

const SIGNATURE_INK = "#222222";

/** Same default as @docuseal/signature-maker-js `loadFont()`. */
const SIGNATURE_FONT_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/dancing-script/files/dancing-script-latin-400-normal.woff";

let signatureFontLoadPromise: Promise<void> | null = null;

function ensureSignatureFontLoaded(): Promise<void> {
  if (signatureFontLoadPromise) return signatureFontLoadPromise;
  signatureFontLoadPromise = (async () => {
    try {
      if (document.fonts.check("italic 58px SignatureFont")) return;
      const face = new FontFace("SignatureFont", `url(${SIGNATURE_FONT_URL})`);
      await face.load();
      document.fonts.add(face);
    } catch {
      /* fallback font may still render ink */
    }
  })();
  return signatureFontLoadPromise;
}

function isValidSignatureDataUrl(url: string | null | undefined): url is string {
  const s = (url ?? "").trim();
  if (!s.startsWith("data:image/")) return false;
  const comma = s.indexOf(",");
  return comma >= 0 && s.length > comma + 32;
}

function isMakerDrawMode(makerEl: HTMLElement): boolean {
  const radio = makerEl.querySelector('[data-target="drawTypeButton"] input[type="radio"]');
  return radio instanceof HTMLInputElement && radio.checked;
}

function makerCanvas(makerEl: HTMLElement): HTMLCanvasElement | null {
  const canvas = makerEl.querySelector('[data-target="canvas"]');
  return canvas instanceof HTMLCanvasElement ? canvas : null;
}

function makerTypedText(makerEl: HTMLElement): string {
  const textInput = makerEl.querySelector('[data-target="textInput"]');
  return textInput instanceof HTMLInputElement ? textInput.value.trim() : "";
}

function isMakerTextMode(makerEl: HTMLElement): boolean {
  const radio = makerEl.querySelector('[data-target="textTypeButton"] input[type="radio"]');
  return radio instanceof HTMLInputElement && radio.checked;
}

function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

async function detailToDataUrl(detail?: SignatureMakerChangeDetail): Promise<string | null> {
  if (!detail) return null;
  const fromBase64 = signatureDetailToStoredValue(detail);
  if (isValidSignatureDataUrl(fromBase64)) return fromBase64;
  if (detail.blob instanceof Blob) {
    const url = await blobToDataUrl(detail.blob);
    return isValidSignatureDataUrl(url) ? url : null;
  }
  return null;
}

/**
 * Render typed signatures on a clean offscreen canvas.
 * DocuSeal's typed mode leaves fillStyle transparent on the shared pad canvas, so cropping
 * that canvas often yields an empty image — draw mode is unaffected.
 */
async function renderTypedSignatureOffscreen(text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  await ensureSignatureFontLoaded();
  await document.fonts.ready;

  const scale = 2;
  const logicalW = 640;
  const logicalH = 180;
  const canvas = document.createElement("canvas");
  canvas.width = logicalW * scale;
  canvas.height = logicalH * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, logicalW, logicalH);
  ctx.font = "italic 58px SignatureFont";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = SIGNATURE_INK;
  ctx.fillText(trimmed, logicalW / 2, logicalH / 2);

  const cropped = cropCanvasToDataUrl(canvas);
  if (isValidSignatureDataUrl(cropped)) return cropped;
  const full = canvas.toDataURL("image/png");
  return isValidSignatureDataUrl(full) ? full : null;
}

/** Crop non-transparent pixels — mirrors DocuSeal cropCanvas for typed-signature fallback. */
function cropCanvasToDataUrl(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const width = canvas.width;
  const height = canvas.height;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let top = height;
  let bottom = 0;
  let left = width;
  let right = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const alpha = pixels[(row * width + col) * 4 + 3];
      if (alpha !== 0) {
        top = Math.min(top, row);
        bottom = Math.max(bottom, row);
        left = Math.min(left, col);
        right = Math.max(right, col);
      }
    }
  }
  if (bottom < top || right < left) return null;
  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  const cropped = document.createElement("canvas");
  cropped.width = cropW;
  cropped.height = cropH;
  const cropCtx = cropped.getContext("2d");
  if (!cropCtx) return null;
  cropCtx.drawImage(canvas, left, top, cropW, cropH, 0, 0, cropW, cropH);
  const dataUrl = cropped.toDataURL("image/png");
  return dataUrl.length > 22 ? dataUrl : null;
}

/** Crop ink on canvas without clearing — preserves DocuSeal's typed/drawn pixels. */
function captureCanvasInk(canvas: HTMLCanvasElement): string | null {
  const cropped = cropCanvasToDataUrl(canvas);
  if (isValidSignatureDataUrl(cropped)) return cropped;
  const full = canvas.toDataURL("image/png");
  return isValidSignatureDataUrl(full) ? full : null;
}

async function captureSignatureFromMaker(
  makerEl: HTMLElement,
  detail?: SignatureMakerChangeDetail,
): Promise<string | null> {
  const fromDetail = await detailToDataUrl(detail);
  if (fromDetail) return fromDetail;

  if (isMakerTextMode(makerEl)) {
    const textInput = makerEl.querySelector('[data-target="textInput"]');
    const raw = textInput instanceof HTMLInputElement ? textInput.value : makerTypedText(makerEl);
    return renderTypedSignatureOffscreen(raw);
  }

  const canvas = makerCanvas(makerEl);
  if (!canvas) return null;
  return captureCanvasInk(canvas);
}

/**
 * DocuSeal typed mode leaves fillStyle transparent, and its async change event often fires
 * with null after we capture the canvas — never clear a good typed preview on a null change.
 */
function wireSignatureMaker(
  makerEl: HTMLElement,
  setPending: React.Dispatch<React.SetStateAction<string | null>>,
  onTypedTextChange?: (hasText: boolean) => void,
): () => void {
  let disposed = false;
  const cleanups: (() => void)[] = [];

  const publish = (detail?: SignatureMakerChangeDetail) => {
    if (isMakerTextMode(makerEl)) return;
    void (async () => {
      await afterNextPaint();
      if (disposed) return;
      const fromDetail = detail ? signatureDetailToStoredValue(detail) : "";
      if (isValidSignatureDataUrl(fromDetail)) {
        setPending(fromDetail);
        return;
      }
      const fromAsyncDetail = await detailToDataUrl(detail);
      if (fromAsyncDetail) {
        setPending(fromAsyncDetail);
        return;
      }
      const captured = await captureSignatureFromMaker(makerEl, detail);
      setPending((prev) => {
        if (captured) return captured;
        if (detail?.base64 || detail?.blob) return prev;
        return prev;
      });
    })();
  };

  const tryAttach = () => {
    if (disposed) return;
    const canvas = makerEl.querySelector('[data-target="canvas"]');
    const textInput = makerEl.querySelector('[data-target="textInput"]');
    if (!(canvas instanceof HTMLCanvasElement) || !(textInput instanceof HTMLInputElement)) {
      requestAnimationFrame(tryAttach);
      return;
    }

    void ensureSignatureFontLoaded();

    const syncTyped = () => {
      const hasText = textInput.value.trim().length > 0;
      onTypedTextChange?.(hasText);
      window.requestAnimationFrame(() => {
        void (async () => {
          if (disposed) return;
          if (!hasText) {
            setPending(null);
            return;
          }
          const url = await renderTypedSignatureOffscreen(textInput.value);
          if (url) setPending(url);
        })();
      });
    };

    const onCaptureInput = () => {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.fillStyle = SIGNATURE_INK;
      syncTyped();
    };
    textInput.addEventListener("input", onCaptureInput, true);
    cleanups.push(() => textInput.removeEventListener("input", onCaptureInput, true));

    const textTypeButton = makerEl.querySelector('[data-target="textTypeButton"]');
    const onTextMode = () => window.setTimeout(syncTyped, 0);
    textTypeButton?.addEventListener("click", onTextMode);
    cleanups.push(() => textTypeButton?.removeEventListener("click", onTextMode));

    const drawTypeButton = makerEl.querySelector('[data-target="drawTypeButton"]');
    const onDrawMode = () => window.setTimeout(() => publish(), 0);
    drawTypeButton?.addEventListener("click", onDrawMode);
    cleanups.push(() => drawTypeButton?.removeEventListener("click", onDrawMode));

    makerEl.querySelectorAll('[data-target="colorInput"]').forEach((node) => {
      node.addEventListener("change", syncTyped);
      cleanups.push(() => node.removeEventListener("change", syncTyped));
    });

    const onChange = (event: Event) => {
      if (isMakerTextMode(makerEl)) return;
      const detail = (event as CustomEvent<SignatureMakerChangeDetail>).detail;
      publish(detail);
    };
    makerEl.addEventListener("change", onChange);
    cleanups.push(() => makerEl.removeEventListener("change", onChange));

    const onDrawStrokeEnd = () => {
      if (!isMakerDrawMode(makerEl)) return;
      publish();
    };
    canvas.addEventListener("pointerup", onDrawStrokeEnd);
    canvas.addEventListener("mouseup", onDrawStrokeEnd);
    cleanups.push(() => canvas.removeEventListener("pointerup", onDrawStrokeEnd));
    cleanups.push(() => canvas.removeEventListener("mouseup", onDrawStrokeEnd));
  };

  tryAttach();
  return () => {
    disposed = true;
    for (const fn of cleanups) fn();
  };
}

function formKeyForDocusealSlot(slot: OnboardingDocusealSignatureTarget): CustomerFormSubmissionFormKey {
  switch (slot) {
    case "client_registration":
      return "form_1";
    case "hmrc_64_8":
      return "form_2";
    case "change_accountant":
      return "form_3";
    case "direct_debit":
      return "form_4";
    default:
      return "form_1";
  }
}

/** Align with backend: lift legacy root `docuseal` into `form_*`. */
function normalizedSubmissionMetadata(
  meta: CustomerFormSubmissionMetadata | undefined,
): CustomerFormSubmissionMetadata {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return {};
  const o = { ...(meta as Record<string, unknown>) };
  const legacy = o.docuseal;
  if (legacy !== null && legacy !== undefined && typeof legacy === "object" && !Array.isArray(legacy)) {
    delete o.docuseal;
    const L = legacy as Record<string, unknown>;
    const tr = L.target;
    const slot: OnboardingDocusealSignatureTarget =
      tr === "hmrc_64_8" || tr === "change_accountant" || tr === "direct_debit" || tr === "client_registration"
        ? tr
        : "client_registration";
    const fk = formKeyForDocusealSlot(slot);
    const existing =
      o[fk] !== undefined && o[fk] !== null && typeof o[fk] === "object" && !Array.isArray(o[fk])
        ? (o[fk] as Record<string, unknown>)
        : {};
    const prevDu =
      existing.docuseal !== undefined &&
      existing.docuseal !== null &&
      typeof existing.docuseal === "object" &&
      !Array.isArray(existing.docuseal)
        ? { ...(existing.docuseal as object) }
        : {};
    o[fk] = { ...existing, docuseal: { ...prevDu, ...L } };
  }
  return o as CustomerFormSubmissionMetadata;
}

function docusealForSlot(
  metadata: CustomerFormSubmissionMetadata | undefined,
  slot: OnboardingDocusealSignatureTarget,
) {
  const n = normalizedSubmissionMetadata(metadata);
  return n[formKeyForDocusealSlot(slot)]?.docuseal;
}

function isDocusealAwaitingForSlot(
  metadata: CustomerFormSubmissionMetadata | undefined,
  slot: OnboardingDocusealSignatureTarget,
): boolean {
  const d = docusealForSlot(metadata, slot);
  if (!d?.submissionId) return false;
  if (d.phase === "signed") return false;
  return true;
}

function docusealProgressHint(
  metadata: CustomerFormSubmissionMetadata | undefined,
  slot: OnboardingDocusealSignatureTarget,
): string | null {
  if (!isDocusealAwaitingForSlot(metadata, slot)) return null;
  const d = docusealForSlot(metadata, slot);
  if (d?.phase === "link_viewed") return "The signer opened the signing link.";
  if (d?.phase === "email_sent") return "Signing email sent — waiting for the signer to complete DocuSeal.";
  return "Remote signing in progress.";
}

function mergeSignatureDataUrl(
  data: CustomerOnboardingData,
  slot: OnboardingDocusealSignatureTarget,
  dataUrl: string,
): CustomerOnboardingData {
  if (slot === "client_registration") {
    return {
      ...data,
      signatures: {
        ...data.signatures,
        client_registration: {
          ...data.signatures.client_registration,
          signature: dataUrl,
        },
      },
    };
  }
  if (slot === "hmrc_64_8") {
    return {
      ...data,
      signatures: {
        ...data.signatures,
        hmrc_64_8: { ...data.signatures.hmrc_64_8, signature: dataUrl },
      },
    };
  }
  if (slot === "change_accountant") {
    return {
      ...data,
      signatures: {
        ...data.signatures,
        change_accountant: {
          ...data.signatures.change_accountant,
          signature: dataUrl,
        },
      },
    };
  }
  return {
    ...data,
    signatures: {
      ...data.signatures,
      direct_debit: { ...data.signatures.direct_debit, signature: dataUrl },
    },
  };
}

function recipientNameForSlot(data: CustomerOnboardingData, slot: OnboardingDocusealSignatureTarget): string {
  if (slot === "client_registration") return data.signatures.client_registration.name;
  if (slot === "hmrc_64_8") return data.signatures.hmrc_64_8.name;
  if (slot === "change_accountant") return data.signatures.change_accountant.name;
  return data.signatures.direct_debit.name;
}

function SignatureFilePreview({
  signature,
  apiBase,
  customerId,
  authHeaders,
}: {
  signature: string;
  apiBase: string;
  customerId: string | null;
  authHeaders: () => HeadersInit;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const fileId = parseOnboardingSignatureFileId(signature);

  useEffect(() => {
    if (!fileId || !customerId) {
      setObjectUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${apiBase}/api/files/${fileId}/content`, { headers: authHeaders() });
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        const u = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = u;
        setObjectUrl(u);
      } catch {
        if (!cancelled) setObjectUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [apiBase, authHeaders, customerId, fileId, signature]);

  if (!objectUrl) return null;
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-surface-muted px-3 py-2">
      <img src={objectUrl} alt="Saved signature" className="max-h-14 max-w-[180px] object-contain" />
      <span className="text-xs text-muted">Stored as file. Update below to replace.</span>
    </div>
  );
}

export type OnboardingSignatureBlockProps = {
  slot: OnboardingDocusealSignatureTarget;
  data: CustomerOnboardingData;
  /** Keeps wizard `data` in sync so PDF Preview includes a drawn (unsaved) signature. */
  setData?: Dispatch<SetStateAction<CustomerOnboardingData>>;
  apiBase: string;
  customerId: string | null;
  authHeaders: () => HeadersInit;
  submissionId: string | null;
  formSubmissionRow: CustomerFormSubmission | null;
  onSubmissionRefresh: () => Promise<void> | void;
  onSaveDraft: (dataOverride?: CustomerOnboardingData) => Promise<boolean>;
  saveDraftLoading: boolean;
  draftSaveError?: string;
  companyNameOk: boolean;
  /** Shown as section title for the pad + remote block. */
  title?: string;
  /** Short note under the title (e.g. JSON path hints). */
  description?: ReactNode;
  /** Rendered between the remote-email UI and the signature pad (e.g. name / date fields for step 1). */
  betweenRemoteAndPad?: ReactNode;
  /** Initial / synced email field for remote signing (defaults to contact email). */
  remoteEmailInitial?: string;
  /** When false, only the on-device pad is shown (steps 1?3 and in-person step 4). */
  showRemoteSigning?: boolean;
};

export function OnboardingSignatureBlock({
  slot,
  data,
  setData,
  apiBase,
  customerId,
  authHeaders,
  submissionId,
  formSubmissionRow,
  onSubmissionRefresh,
  onSaveDraft,
  saveDraftLoading,
  draftSaveError,
  companyNameOk,
  title = "Signature",
  description,
  betweenRemoteAndPad,
  remoteEmailInitial,
  showRemoteSigning = false,
}: OnboardingSignatureBlockProps) {
  const sig =
    slot === "client_registration"
      ? data.signatures.client_registration
      : slot === "hmrc_64_8"
        ? data.signatures.hmrc_64_8
        : slot === "change_accountant"
          ? data.signatures.change_accountant
          : data.signatures.direct_debit;

  const meta = formSubmissionRow?.metadata;
  const docusealHint = isDocusealAwaitingForSlot(meta, slot) ? docusealProgressHint(meta, slot) : null;

  const defaultEmail = (remoteEmailInitial ?? data.contact.email).trim();
  const [remoteEmail, setRemoteEmail] = useState(() => defaultEmail);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [remoteErr, setRemoteErr] = useState("");
  const [remoteOk, setRemoteOk] = useState("");
  const [pendingSignatureDataUrl, setPendingSignatureDataUrl] = useState<string | null>(null);
  const [typedSignatureReady, setTypedSignatureReady] = useState(false);
  const [signaturePadKey, setSignaturePadKey] = useState(0);
  const [addingSignature, setAddingSignature] = useState(false);
  const [signatureSaveOk, setSignatureSaveOk] = useState("");
  const [signatureCaptureErr, setSignatureCaptureErr] = useState("");
  const signatureMakerHostRef = useRef<HTMLDivElement>(null);

  const handleSignatureMakerChange = useCallback((detail: SignatureMakerChangeDetail) => {
    void (async () => {
      const maker = signatureMakerHostRef.current?.querySelector("signature-maker");
      if (!(maker instanceof HTMLElement) || isMakerTextMode(maker)) return;

      const fromStored = signatureDetailToStoredValue(detail);
      if (isValidSignatureDataUrl(fromStored)) {
        setPendingSignatureDataUrl(fromStored);
        return;
      }

      await afterNextPaint();
      const url = await detailToDataUrl(detail);
      if (url) {
        setPendingSignatureDataUrl(url);
        return;
      }

      const captured = await captureSignatureFromMaker(maker, detail);
      if (captured) {
        setPendingSignatureDataUrl(captured);
        return;
      }

      if (!detail?.base64 && !detail?.blob) {
        setPendingSignatureDataUrl(null);
      }
    })();
  }, []);

  useEffect(() => {
    const host = signatureMakerHostRef.current;
    if (!host) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    const attach = () => {
      if (disposed) return;
      const maker = host.querySelector("signature-maker");
      if (!(maker instanceof HTMLElement)) {
        requestAnimationFrame(attach);
        return;
      }
      setTypedSignatureReady(false);
      cleanup = wireSignatureMaker(maker, setPendingSignatureDataUrl, setTypedSignatureReady);
    };

    attach();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [signaturePadKey]);

  /** Push drawn/typed preview into wizard state so the page Preview button can embed it. */
  useEffect(() => {
    if (!setData || !pendingSignatureDataUrl) return;
    setData((current) => mergeSignatureDataUrl(current, slot, pendingSignatureDataUrl));
  }, [pendingSignatureDataUrl, setData, slot]);

  const hasSignatureToSave = Boolean(pendingSignatureDataUrl) || typedSignatureReady;

  const addSignatureDisabled = !hasSignatureToSave || addingSignature || !companyNameOk;

  const addSignatureDisabledReason = !hasSignatureToSave
    ? null
    : addingSignature
      ? "Saving signature…"
      : !companyNameOk
        ? "Enter the company / business name on step 1 before saving."
        : saveDraftLoading
          ? "Another draft save is running — try again in a moment."
          : null;

  const signatureSaveError =
    addingSignature || signatureSaveOk ? "" : (draftSaveError?.trim() ?? "");

  useEffect(() => {
    const em = (remoteEmailInitial ?? data.contact.email).trim();
    if (em) setRemoteEmail(em);
  }, [data.contact.email, remoteEmailInitial]);

  const sendRemoteSignatureRequest = async () => {
    setRemoteErr("");
    setRemoteOk("");
    if (!customerId || !submissionId) {
      setRemoteErr(
        "Save a draft or add a signature on this step so this customer and form submission exist on the server.",
      );
      return;
    }
    const email = remoteEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      setRemoteErr("Enter a valid email address.");
      return;
    }
    setRemoteBusy(true);
    try {
      await sendClientRegistrationSignatureEmailRequest(apiBase, authHeaders(), customerId, submissionId, {
        recipientEmail: email,
        recipientName: recipientNameForSlot(data, slot).trim() || undefined,
        fieldValues: docusealPrefillForSignatureTarget(data, slot),
        signatureTarget: slot,
      });
      await onSubmissionRefresh();
      setRemoteOk("Signing request sent. The recipient will receive an email from DocuSeal with a secure link.");
    } catch (e) {
      setRemoteErr(e instanceof Error ? e.message : "Could not send signing request");
    } finally {
      setRemoteBusy(false);
    }
  };

  return (
    <div className="block space-y-4">
      {showRemoteSigning ? (
        <div className="rounded-lg border border-border bg-surface-muted/50 px-3 py-3 sm:px-4">
          <h4 className="text-sm font-semibold text-ink">Remote Signing (DocuSeal)</h4>
          <p className="mt-1 text-xs text-muted">
            Send a signing link by email. When signing is complete, the image is saved on this submission (save a draft
            first, or use Add signature below). Use a DocuSeal template configured for this step (see backend env{" "}
            <code className="rounded bg-surface-muted px-1">DOCUSEAL_TEMPLATE_ID*</code>).
          </p>
          <div className="mt-3 flex max-w-lg flex-col gap-3">
            <label>
              <span className={lab}>Email</span>
              <input
                className={inp}
                type="email"
                value={remoteEmail}
                onChange={(e) => setRemoteEmail(e.target.value)}
                placeholder="signer@example.com"
                autoComplete="email"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={remoteBusy || isDocusealAwaitingForSlot(meta, slot)}
                title={
                  isDocusealAwaitingForSlot(meta, slot)
                    ? "A signing link was already sent for this step."
                    : undefined
                }
                onClick={() => void sendRemoteSignatureRequest()}
                className="btn btn-primary btn-md disabled:cursor-not-allowed"
              >
                {remoteBusy ? "Sending?" : "Send signature request via email"}
              </button>
            </div>
            {remoteErr ? <p className="text-sm text-red-400">{remoteErr}</p> : null}
            {remoteOk ? <p className="text-sm text-emerald-400">{remoteOk}</p> : null}
          </div>
        </div>
      ) : null}

      {betweenRemoteAndPad}

      <div className="space-y-2">
        <span className={lab}>{title}</span>
        {description ? <div className="text-xs text-muted">{description}</div> : null}
        {docusealHint ? (
          <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">{docusealHint}</div>
        ) : null}
        <p className="text-xs text-muted">
          Use the pad below. When there is ink (or typed text), a preview appears and is included in{" "}
          <strong className="font-semibold text-ink-soft">Preview</strong> above. Click{" "}
          <strong className="font-semibold text-ink-soft">Add signature</strong> to save a draft and store the image
          (requires a company name). The image is uploaded as a file so the payload stays small.
        </p>
        {parseOnboardingSignatureFileId(sig.signature) ? (
          <SignatureFilePreview
            signature={sig.signature}
            apiBase={apiBase}
            customerId={customerId}
            authHeaders={authHeaders}
          />
        ) : null}
        {sig.signature.startsWith("data:image/") ? (
          <div className="flex items-center gap-3 rounded-md border border-border bg-surface-muted px-3 py-2">
            <img
              src={sig.signature}
              alt="Current signature preview"
              className="max-h-14 max-w-[180px] object-contain"
            />
            <span className="text-xs text-muted">Not saved yet ? use Add signature to upload.</span>
          </div>
        ) : sig.signature.trim() && !parseOnboardingSignatureFileId(sig.signature) ? (
          <p className="text-xs text-amber-200">
            A text signature is on file. Use the pad below to replace it with a drawn or typed image signature.
          </p>
        ) : null}
        <div
          ref={signatureMakerHostRef}
          className="signature-maker-theme-fix min-h-[200px] w-full min-w-0 rounded-lg border border-border bg-surface-raised p-2"
        >
          <SignatureMaker
            key={signaturePadKey}
            withSubmit={false}
            downloadOnSave={false}
            withColorSelect={false}
            onChange={handleSignatureMakerChange}
          />
        </div>
        {pendingSignatureDataUrl ? (
          <div className="rounded-md border border-emerald-800/40 bg-emerald-950/35 px-3 py-2">
            <p className="text-xs font-medium text-emerald-200">Preview (not saved until you click below)</p>
            <img
              src={pendingSignatureDataUrl}
              alt="Signature preview"
              className="mt-2 max-h-24 max-w-[220px] object-contain"
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={addSignatureDisabled}
            title={addSignatureDisabledReason ?? undefined}
            onClick={() => {
              void (async () => {
                if (!hasSignatureToSave) return;
                setSignatureSaveOk("");
                setSignatureCaptureErr("");
                setAddingSignature(true);
                try {
                  const maker = signatureMakerHostRef.current?.querySelector("signature-maker");
                  let dataUrl = pendingSignatureDataUrl;
                  if (maker instanceof HTMLElement) {
                    const captured = await captureSignatureFromMaker(maker);
                    if (captured) dataUrl = captured;
                  }
                  if (!isValidSignatureDataUrl(dataUrl)) {
                    setSignatureCaptureErr(
                      "Could not capture the signature image. Wait a moment after typing, or switch to Draw mode.",
                    );
                    return;
                  }
                  const merged = mergeSignatureDataUrl(data, slot, dataUrl);
                  const ok = await onSaveDraft(merged);
                  if (ok) {
                    setPendingSignatureDataUrl(null);
                    setTypedSignatureReady(false);
                    setSignaturePadKey((k) => k + 1);
                    setSignatureSaveOk("Signature saved.");
                    window.setTimeout(() => setSignatureSaveOk(""), 4000);
                  }
                } finally {
                  setAddingSignature(false);
                }
              })();
            }}
            className="btn btn-primary btn-lg disabled:cursor-not-allowed disabled:opacity-45"
          >
            {addingSignature ? "Saving?" : "Add signature"}
          </button>
          {pendingSignatureDataUrl ? (
            <button
              type="button"
              onClick={() => setPendingSignatureDataUrl(null)}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm font-medium text-ink-soft hover:bg-surface-muted"
            >
              Clear preview
            </button>
          ) : null}
        </div>
        {addSignatureDisabledReason ? (
          <p className="text-xs text-amber-200">{addSignatureDisabledReason}</p>
        ) : null}
        {signatureSaveOk ? <p className="text-xs text-emerald-400">{signatureSaveOk}</p> : null}
        {signatureCaptureErr ? <p className="text-sm text-red-400">{signatureCaptureErr}</p> : null}
        {signatureSaveError ? <p className="text-sm text-red-400">{signatureSaveError}</p> : null}
      </div>
    </div>
  );
}
