import type {
  CustomerFormSubmissionFormBucket,
  CustomerFormSubmissionMetadata,
  OnboardingDocusealSignatureTarget,
} from "../types/api";
import type { CustomerOnboardingData } from "../types/customerOnboarding";

function formKeyForDocusealSlot(slot: OnboardingDocusealSignatureTarget): keyof CustomerFormSubmissionMetadata {
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

/** Same legacy lift as `OnboardingSignatureBlock` (root `docuseal` → `form_*`). */
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
  const bucket = n[formKeyForDocusealSlot(slot)] as CustomerFormSubmissionFormBucket | undefined;
  return bucket?.docuseal;
}

export function isDocusealAwaitingForSlot(
  metadata: CustomerFormSubmissionMetadata | undefined,
  slot: OnboardingDocusealSignatureTarget,
): boolean {
  const d = docusealForSlot(metadata, slot);
  if (!d?.submissionId) return false;
  if (d.phase === "signed") return false;
  return true;
}

/** Webhook finished for this slot (metadata flag — use when poller has fresh row but React state lags). */
export function isDocusealRemoteSignatureCompleted(
  metadata: CustomerFormSubmissionMetadata | undefined,
  slot: OnboardingDocusealSignatureTarget,
): boolean {
  const n = normalizedSubmissionMetadata(metadata);
  const bucket = n[formKeyForDocusealSlot(slot)] as CustomerFormSubmissionFormBucket | undefined;
  if (bucket?.status === "remote_signature_completed") return true;
  if (bucket?.docuseal?.phase === "signed") return true;
  return false;
}

export function readOnboardingSignatureForSlot(
  data: unknown,
  slot: OnboardingDocusealSignatureTarget,
): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const signatures = (data as Record<string, unknown>).signatures;
  if (!signatures || typeof signatures !== "object" || Array.isArray(signatures)) return "";
  const bucket = (signatures as Record<string, unknown>)[slot];
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) return "";
  const sig = (bucket as { signature?: unknown }).signature;
  return typeof sig === "string" ? sig : "";
}

export type RemoteDocusealSlotStatus = "saved" | "awaiting" | "pending";

/** Status for step-5 remote signing — reads local wizard state AND latest server submission row. */
export function resolveRemoteDocusealSlotStatus(
  local: CustomerOnboardingData,
  serverRowData: unknown,
  metadata: CustomerFormSubmissionMetadata | undefined,
  slot: OnboardingDocusealSignatureTarget,
): RemoteDocusealSlotStatus {
  if (hasStoredSignatureImage(readOnboardingSignatureForSlot(local, slot))) return "saved";
  if (hasStoredSignatureImage(readOnboardingSignatureForSlot(serverRowData, slot))) return "saved";
  if (isDocusealRemoteSignatureCompleted(metadata, slot)) return "saved";
  if (isDocusealAwaitingForSlot(metadata, slot)) return "awaiting";
  return "pending";
}

export function isAnyDocusealSignatureAwaiting(metadata: CustomerFormSubmissionMetadata | undefined): boolean {
  const slots: OnboardingDocusealSignatureTarget[] = [
    "client_registration",
    "hmrc_64_8",
    "change_accountant",
    "direct_debit",
  ];
  return slots.some((s) => isDocusealAwaitingForSlot(metadata, s));
}

/** True when a signature image is stored (uploaded file ref or embedded data URL). */
export function hasStoredSignatureImage(signature: string | undefined): boolean {
  const s = (signature ?? "").trim();
  if (!s) return false;
  if (s.startsWith("file:")) return true;
  if (s.startsWith("data:image/")) return true;
  return false;
}

const REMOTE_SIGNATURE_SLOTS = [
  "client_registration",
  "hmrc_64_8",
  "change_accountant",
  "direct_debit",
] as const;

/** Merge webhook-merged `file:<uuid>` refs from the server without clobbering unsaved local fields. */
export function mergeDocusealSignaturesFromServer(
  local: CustomerOnboardingData["signatures"],
  server: unknown,
): CustomerOnboardingData["signatures"] {
  if (!server || typeof server !== "object" || Array.isArray(server)) return local;
  const s = server as Record<string, unknown>;
  let next = local;
  for (const slot of REMOTE_SIGNATURE_SLOTS) {
    const srvBucket = s[slot];
    if (!srvBucket || typeof srvBucket !== "object" || Array.isArray(srvBucket)) continue;
    const srvSig = (srvBucket as { signature?: unknown }).signature;
    if (typeof srvSig !== "string" || !hasStoredSignatureImage(srvSig)) continue;
    next = {
      ...next,
      [slot]: { ...next[slot], ...(srvBucket as object) },
    };
  }
  const srvIndex = s.by_form_index;
  if (srvIndex && typeof srvIndex === "object" && !Array.isArray(srvIndex)) {
    next = {
      ...next,
      by_form_index: {
        ...next.by_form_index,
        ...(srvIndex as NonNullable<CustomerOnboardingData["signatures"]["by_form_index"]>),
      },
    };
  }
  return next;
}

export function allFourOnboardingSignatureSlotsFilled(
  data: CustomerOnboardingData,
  serverRowData?: unknown,
  metadata?: CustomerFormSubmissionMetadata,
): boolean {
  return REMOTE_SIGNATURE_SLOTS.every((slot) => {
    if (hasStoredSignatureImage(readOnboardingSignatureForSlot(data, slot))) return true;
    if (hasStoredSignatureImage(readOnboardingSignatureForSlot(serverRowData, slot))) return true;
    if (isDocusealRemoteSignatureCompleted(metadata, slot)) return true;
    return false;
  });
}

/**
 * Step 5 requires choosing signing mode; all four forms must have a stored signature image
 * (pad upload or DocuSeal webhook merge). For remote email, no DocuSeal slot may be mid-flight.
 * In-person signing only uses local data; stale DocuSeal metadata must not block "Next".
 */
export function canFinishOnboarding(
  data: CustomerOnboardingData,
  submissionMetadata: CustomerFormSubmissionMetadata | undefined,
  serverRowData?: unknown,
): boolean {
  const mode = data.signatures.capture_mode;
  if (mode !== "in_person" && mode !== "remote_email") {
    return false;
  }
  if (!allFourOnboardingSignatureSlotsFilled(data, serverRowData, submissionMetadata)) return false;
  if (mode === "remote_email" && isAnyDocusealSignatureAwaiting(submissionMetadata)) return false;
  return true;
}
