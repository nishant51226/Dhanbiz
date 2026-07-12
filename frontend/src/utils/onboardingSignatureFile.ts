import type { CustomerOnboardingData } from "../types/customerOnboarding";
import { uploadCustomerBlobFile } from "../api/client";

const FILE_REF = /^file:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function parseClientRegistrationSignatureFileId(signature: string): string | null {
  const m = FILE_REF.exec(String(signature ?? "").trim());
  return m ? m[1] : null;
}

/** Same UUID pattern as client registration; use for any onboarding `file:<id>` signature. */
export function parseOnboardingSignatureFileId(signature: string): string | null {
  return parseClientRegistrationSignatureFileId(signature);
}

function cloneOnboarding(data: CustomerOnboardingData): CustomerOnboardingData {
  return JSON.parse(JSON.stringify(data)) as CustomerOnboardingData;
}

async function uploadDataUrlSignatureIfNeeded(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  dataUrl: string,
  filename: string,
): Promise<string> {
  const raw = dataUrl.trim();
  if (!raw.startsWith("data:image/")) {
    return raw;
  }
  const blob = await fetch(raw).then((r) => r.blob());
  const { id } = await uploadCustomerBlobFile(apiBase, headers, {
    customerId,
    blob,
    filename,
  });
  return `file:${id}`;
}

/** Upload any `data:image/*` onboarding signatures and replace with `file:<id>`. */
export async function normalizeOnboardingDataForPersist(
  apiBase: string,
  headers: HeadersInit,
  customerId: string,
  data: CustomerOnboardingData,
): Promise<CustomerOnboardingData> {
  const next = cloneOnboarding(data);
  next.signatures.client_registration.signature = await uploadDataUrlSignatureIfNeeded(
    apiBase,
    headers,
    customerId,
    next.signatures.client_registration.signature,
    "client-registration-signature.png",
  );
  next.signatures.hmrc_64_8.signature = await uploadDataUrlSignatureIfNeeded(
    apiBase,
    headers,
    customerId,
    next.signatures.hmrc_64_8.signature,
    "hmrc-64-8-signature.png",
  );
  next.signatures.change_accountant.signature = await uploadDataUrlSignatureIfNeeded(
    apiBase,
    headers,
    customerId,
    next.signatures.change_accountant.signature,
    "change-accountant-signature.png",
  );
  next.signatures.direct_debit.signature = await uploadDataUrlSignatureIfNeeded(
    apiBase,
    headers,
    customerId,
    next.signatures.direct_debit.signature,
    "direct-debit-signature.png",
  );
  return next;
}

/** Replace `file:<id>` client signature with a data URL so PDF HTML can embed it. */
export async function hydrateRegistrationSignatureForPdf(
  apiBase: string,
  headers: HeadersInit,
  data: CustomerOnboardingData,
): Promise<CustomerOnboardingData> {
  return hydrateOnboardingSignaturesForPdf(apiBase, headers, data);
}

async function hydrateOneSlot(
  apiBase: string,
  headers: HeadersInit,
  signature: string,
): Promise<string> {
  const id = parseOnboardingSignatureFileId(signature);
  if (!id) return signature;
  const res = await fetch(`${apiBase}/api/files/${id}/content`, { headers });
  if (!res.ok) {
    /**
     * Don't throw: a missing signature file should still let the rest of the form preview render.
     * Returning the original `file:<id>` keeps the existing "no signature image" placeholder logic
     * in the HTML templates.
     */
    return signature;
  }
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  const buf = await res.arrayBuffer();
  return await blobToDataUrl(new Blob([buf], { type: mime }));
}

/**
 * Replace any of the four onboarding `file:<id>` signatures with embedded `data:image/...` URLs
 * so all four HTML templates can render the image — DocuSeal-completed signatures arrive as
 * `file:<id>` references that the browser can't resolve directly.
 */
export async function hydrateOnboardingSignaturesForPdf(
  apiBase: string,
  headers: HeadersInit,
  data: CustomerOnboardingData,
): Promise<CustomerOnboardingData> {
  const next = cloneOnboarding(data);
  next.signatures.client_registration.signature = await hydrateOneSlot(
    apiBase,
    headers,
    next.signatures.client_registration.signature,
  );
  next.signatures.hmrc_64_8.signature = await hydrateOneSlot(
    apiBase,
    headers,
    next.signatures.hmrc_64_8.signature,
  );
  next.signatures.change_accountant.signature = await hydrateOneSlot(
    apiBase,
    headers,
    next.signatures.change_accountant.signature,
  );
  next.signatures.direct_debit.signature = await hydrateOneSlot(
    apiBase,
    headers,
    next.signatures.direct_debit.signature,
  );
  return next;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(blob);
  });
}
