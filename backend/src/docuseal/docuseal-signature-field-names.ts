import type { OnboardingSignatureSlot } from "../entities/customer-form-submission.entity";

/**
 * Recommended DocuSeal control names per onboarding document (see docs/docuseal-onboarding-limited-company.md).
 * Only `client_registration` and `change_accountant` are signable now; other legacy slots are
 * intentionally omitted (falls back to a generic name in {@link resolveWritableSignatureFieldNames}).
 */
export const DOCUSEAL_SIGNATURE_NAME_BY_SLOT: Partial<Record<OnboardingSignatureSlot, string>> = {
  client_registration: "Signature_client_registration",
  change_accountant: "Signature_change_accountant",
};

function parseEnvSignatureFieldNames(env: string | undefined): Set<string> {
  const raw = (env ?? "Signature").split(",");
  const out = new Set<string>();
  for (const s of raw) {
    const t = s.trim().toLowerCase();
    if (t) out.add(t);
  }
  return out;
}

/**
 * Field names the client may still fill at signing time.
 * Merges `DOCUSEAL_SIGNATURE_FIELD_NAMES` with generic `Signature` and the step-specific control
 * so templates named e.g. `Signature_change_accountant` work without extra env configuration.
 */
export function resolveWritableSignatureFieldNames(
  env: string | undefined,
  signatureTarget?: OnboardingSignatureSlot,
): Set<string> {
  const out = parseEnvSignatureFieldNames(env);
  out.add("signature");
  const named = signatureTarget ? DOCUSEAL_SIGNATURE_NAME_BY_SLOT[signatureTarget] : undefined;
  if (named) {
    out.add(named.toLowerCase());
  }
  return out;
}

/** Lowercase names for webhook signature URL detection. */
export function signatureFieldNamesForMatching(
  env: string | undefined,
  signatureTarget?: OnboardingSignatureSlot,
): string[] {
  return [...resolveWritableSignatureFieldNames(env, signatureTarget)];
}
