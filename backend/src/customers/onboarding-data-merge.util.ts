/**
 * Shared guard against client autosaves clobbering server-merged onboarding signatures.
 *
 * The DocuSeal webhook writes `signatures.{slot}.signature = "file:<uuid>"` (and bumps
 * `by_form_index.{1..4}`) into both `customer_form_submission.data` and
 * `customer.onboardingData` on completion. Meanwhile the wizard autosaves the entire
 * `data` blob every few seconds (PATCH form-submission + PATCH customer). When that
 * autosave fires after the webhook merge but before the frontend's poller has resynced
 * its local React state, the wizard ships an empty `signatures.{slot}.signature` and the
 * server overwrites the freshly stored `file:<uuid>` with `""` — last-write-wins.
 *
 * This helper preserves any existing non-empty signature when the incoming value would be
 * empty: re-sending an empty string (or omitting the slot entirely) **never** wipes a
 * stored `file:<uuid>` / `data:image/...` reference. Re-uploading a real signature
 * (drawn or pasted) still wins because it sends a non-empty value.
 *
 * Returns the patched copy that should be persisted (does not mutate inputs). Pass
 * `incoming` as `null`/`undefined` for "no patch" (returns existing as-is).
 */

const SIGNATURE_SLOTS = ["client_registration", "hmrc_64_8", "change_accountant", "direct_debit"] as const;
type SignatureSlot = (typeof SIGNATURE_SLOTS)[number];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function readSlotSignature(signatures: unknown, slot: SignatureSlot): string {
  if (!isPlainObject(signatures)) return "";
  const bucket = signatures[slot];
  if (!isPlainObject(bucket)) return "";
  const sig = bucket.signature;
  return typeof sig === "string" ? sig : "";
}

/** True when the value should be treated as "no signature on file" for the purpose of preservation. */
function isEmptySignatureValue(s: string): boolean {
  return s.trim().length === 0;
}

export function preserveOnboardingSignatures(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!isPlainObject(incoming)) {
    return isPlainObject(existing) ? existing : {};
  }
  if (!isPlainObject(existing)) {
    return incoming;
  }

  const existingSignatures = existing.signatures;
  const incomingSignatures = incoming.signatures;

  /**
   * Fast path: the incoming patch carries no `signatures` block at all (e.g. partial PATCH);
   * keep whatever the row already has, which means do nothing here — `incoming` is unchanged.
   */
  if (!isPlainObject(incomingSignatures)) {
    return incoming;
  }

  /**
   * `signatures` is present in the patch — walk each slot and, for any slot whose existing
   * stored signature is non-empty AND whose incoming signature is empty, replace the incoming
   * value with the existing one. Also preserve the matching `by_form_index.{1..4}` row so the
   * combined PDF / preview hydration stays consistent (those rows are written by the same
   * webhook that set the per-slot signature).
   */
  const mergedSignatures: Record<string, unknown> = { ...incomingSignatures };
  let preservedAny = false;
  for (let i = 0; i < SIGNATURE_SLOTS.length; i++) {
    const slot = SIGNATURE_SLOTS[i];
    const existingSig = readSlotSignature(existingSignatures, slot);
    if (isEmptySignatureValue(existingSig)) continue;
    const incomingSig = readSlotSignature(incomingSignatures, slot);
    if (!isEmptySignatureValue(incomingSig)) continue;
    const incomingSlot = isPlainObject(incomingSignatures[slot]) ? (incomingSignatures[slot] as Record<string, unknown>) : {};
    const existingSlot = isPlainObject((existingSignatures as Record<string, unknown>)[slot])
      ? ((existingSignatures as Record<string, unknown>)[slot] as Record<string, unknown>)
      : {};
    mergedSignatures[slot] = { ...incomingSlot, signature: existingSig };
    /**
     * `by_form_index` mirrors the per-slot signatures (see `mergeSignatureIntoOnboarding` in
     * the webhook service). When we restore a slot's signature we restore the matching index
     * row so downstream code that reads from the index gets the same value.
     */
    const indexKey = String(i + 1);
    const existingByIndex = isPlainObject((existingSignatures as Record<string, unknown>).by_form_index)
      ? ((existingSignatures as Record<string, unknown>).by_form_index as Record<string, unknown>)
      : null;
    const existingIndexRow = existingByIndex && isPlainObject(existingByIndex[indexKey])
      ? (existingByIndex[indexKey] as Record<string, unknown>)
      : null;
    if (existingIndexRow) {
      const incomingByIndexRaw = incomingSignatures.by_form_index;
      const incomingByIndex = isPlainObject(incomingByIndexRaw)
        ? { ...(incomingByIndexRaw as Record<string, unknown>) }
        : {};
      const incomingIndexRow = isPlainObject(incomingByIndex[indexKey])
        ? (incomingByIndex[indexKey] as Record<string, unknown>)
        : {};
      const existingIndexSig = typeof existingIndexRow.signature === "string" ? existingIndexRow.signature : "";
      const incomingIndexSig = typeof incomingIndexRow.signature === "string" ? incomingIndexRow.signature : "";
      if (existingIndexSig && !incomingIndexSig.trim()) {
        incomingByIndex[indexKey] = { ...incomingIndexRow, ...existingIndexRow };
        mergedSignatures.by_form_index = incomingByIndex;
      }
    }
    preservedAny = true;
  }

  if (!preservedAny) return incoming;
  return { ...incoming, signatures: mergedSignatures };
}
