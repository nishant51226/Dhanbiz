import type { DocumentEntity } from "../entities/document.entity.js";
import type { File } from "../entities/file.entity.js";

const FILE_REF =
  /^file:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

const KNOWN_ONBOARDING_SIGNATURE_NAMES = new Set([
  "client-registration-signature.png",
  "hmrc-64-8-signature.png",
  "change-accountant-signature.png",
  "direct-debit-signature.png",
]);

const SIGNATURE_FILENAME_RE = /-signature\.(png|jpe?g|webp)$/i;

function parseSignatureFileRef(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = FILE_REF.exec(value.trim());
  return m ? m[1] : null;
}

function walkSignatureSlots(signatures: unknown, ids: Set<string>): void {
  if (!signatures || typeof signatures !== "object" || Array.isArray(signatures)) return;
  const root = signatures as Record<string, unknown>;
  for (const [key, slot] of Object.entries(root)) {
    if (key === "capture_mode" || key === "by_form_index") continue;
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) continue;
    const fileId = parseSignatureFileRef((slot as Record<string, unknown>).signature);
    if (fileId) ids.add(fileId);
  }
  const byIndex = root.by_form_index;
  if (byIndex && typeof byIndex === "object" && !Array.isArray(byIndex)) {
    for (const slot of Object.values(byIndex as Record<string, unknown>)) {
      if (!slot || typeof slot !== "object" || Array.isArray(slot)) continue;
      const fileId = parseSignatureFileRef((slot as Record<string, unknown>).signature);
      if (fileId) ids.add(fileId);
    }
  }
}

/** File IDs referenced by `signatures.*.signature = file:<uuid>` in customer onboarding JSON. */
export function collectOnboardingSignatureFileIds(onboardingData: unknown): Set<string> {
  const ids = new Set<string>();
  if (!onboardingData || typeof onboardingData !== "object" || Array.isArray(onboardingData)) {
    return ids;
  }
  walkSignatureSlots((onboardingData as Record<string, unknown>).signatures, ids);
  return ids;
}

export function linkedFileIdFromDocument(doc: DocumentEntity): string | null {
  const raw = doc.metadata?.fileId;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function looksLikeSignatureFilename(name: string | null | undefined): boolean {
  if (typeof name !== "string" || !name.trim()) return false;
  const lower = name.trim().toLowerCase();
  return KNOWN_ONBOARDING_SIGNATURE_NAMES.has(lower) || SIGNATURE_FILENAME_RE.test(name);
}

export function isOnboardingSignatureFile(
  file: Pick<File, "id" | "name" | "metadata" | "s3Key">,
  signatureFileIds: Set<string>,
): boolean {
  if (signatureFileIds.has(file.id)) return true;
  if (file.metadata?.remoteSignature === true) return true;
  if (looksLikeSignatureFilename(file.name)) return true;
  const s3 = file.s3Key?.trim().toLowerCase() ?? "";
  if (s3.includes("/onboarding-files/files/")) return true;
  return false;
}

export function isOnboardingSignatureDocument(
  doc: DocumentEntity,
  signatureFileIds: Set<string>,
): boolean {
  const linked = linkedFileIdFromDocument(doc);
  if (linked && signatureFileIds.has(linked)) return true;
  return looksLikeSignatureFilename(doc.name);
}
