import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Customer } from "./customer.entity";

/** DB may still contain legacy enum labels; the app only reads/writes these two. */
export enum CustomerFormSubmissionStatus {
  /** Onboarding in progress (includes DocuSeal remote signing; see `metadata.form_*`). */
  draft = "draft",
  /** Onboarding finished / customer active; client-registration signature captured when using remote flow. */
  completed = "completed",
}

/**
 * Wizard / DocuSeal step (maps to `form_1` ? `form_4`). `form_2` (the retired UK agent-authorisation
 * form) has no corresponding slot; only `form_1`/`form_3` are actively signable. `direct_debit`
 * (`form_4`) is also retired from the signing flow but the slot name is kept so legacy stored
 * signatures still round-trip correctly.
 */
export type OnboardingSignatureSlot =
  | "client_registration"
  | "change_accountant"
  | "direct_debit";

/** Top-level keys in `metadata` for each onboarding form (steps 1?4). */
export type CustomerFormSubmissionFormKey = "form_1" | "form_2" | "form_3" | "form_4";

export const CUSTOMER_FORM_SUBMISSION_FORM_KEYS: readonly CustomerFormSubmissionFormKey[] = [
  "form_1",
  "form_2",
  "form_3",
  "form_4",
] as const;

export function formKeyForSignatureSlot(slot: OnboardingSignatureSlot): CustomerFormSubmissionFormKey {
  switch (slot) {
    case "client_registration":
      return "form_1";
    case "change_accountant":
      return "form_3";
    case "direct_debit":
      return "form_4";
    default:
      return "form_1";
  }
}

export function signatureSlotFromFormKey(key: CustomerFormSubmissionFormKey): OnboardingSignatureSlot {
  switch (key) {
    case "form_1":
      return "client_registration";
    case "form_3":
      return "change_accountant";
    case "form_4":
      return "direct_debit";
    default:
      return "client_registration";
  }
}

/** DocuSeal pipeline state for one form bucket. */
export type CustomerFormSubmissionFormDocuseal = {
  submissionId?: string | null;
  target?: OnboardingSignatureSlot;
  phase?: "email_sent" | "link_viewed" | "signed";
  emailedAt?: string;
  viewedAt?: string;
  signedAt?: string;
};

/** Nested per-step record (under each `form_1`?`form_4` bucket), e.g. last save time for that wizard step. */
export type CustomerFormSubmissionStepMeta = {
  lastUpdatedAt?: string;
};

/** Per-form metadata: DocuSeal + optional status for this step (extend later). */
export type CustomerFormSubmissionFormBucket = {
  /** DocuSeal pipeline state; `{}` until a remote sign flow is started for this step. */
  docuseal?: CustomerFormSubmissionFormDocuseal | Record<string, never>;
  /** When this wizard step was last saved (draft/finish), ISO 8601. */
  metadata?: CustomerFormSubmissionStepMeta;
  /** Per-form workflow status (e.g. remote sign outcome). */
  status?: string;
  [key: string]: unknown;
};

/**
 * Row-level metadata: one object per wizard form (`form_1` ? `form_4`).
 * Legacy rows may still have a root `docuseal` key; use `normalizeCustomerFormSubmissionMetadata` before reads.
 */
export type CustomerFormSubmissionMetadata = {
  form_1?: CustomerFormSubmissionFormBucket;
  form_2?: CustomerFormSubmissionFormBucket;
  form_3?: CustomerFormSubmissionFormBucket;
  form_4?: CustomerFormSubmissionFormBucket;
} & Record<string, unknown>;

/** Wizard UI step index 1?4 maps to `form_1` ? `form_4`. */
export function formKeyForWizardStep(step: number): CustomerFormSubmissionFormKey | null {
  if (step === 1) return "form_1";
  if (step === 2) return "form_2";
  if (step === 3) return "form_3";
  if (step === 4) return "form_4";
  return null;
}

function coerceFormBucket(val: unknown): CustomerFormSubmissionFormBucket {
  const base =
    val !== undefined && val !== null && typeof val === "object" && !Array.isArray(val)
      ? { ...(val as Record<string, unknown>) }
      : {};
  const doc = base.docuseal;
  const docObj = doc !== undefined && doc !== null && typeof doc === "object" && !Array.isArray(doc) ? doc : null;
  const docOut =
    docObj && Object.keys(docObj as object).length > 0 ? ({ ...(docObj as object) } as CustomerFormSubmissionFormDocuseal) : {};
  const meta = base.metadata;
  const metaOut =
    meta !== undefined && meta !== null && typeof meta === "object" && !Array.isArray(meta)
      ? { ...(meta as object) }
      : {};
  return {
    ...base,
    docuseal: docOut,
    metadata: metaOut,
  } as CustomerFormSubmissionFormBucket;
}

function defaultEmptyMetadata(): CustomerFormSubmissionMetadata {
  const out: Record<string, unknown> = {};
  for (const fk of CUSTOMER_FORM_SUBMISSION_FORM_KEYS) {
    out[fk] = coerceFormBucket(undefined);
  }
  return out as CustomerFormSubmissionMetadata;
}

function coerceAllFormBuckets(o: Record<string, unknown>): CustomerFormSubmissionMetadata {
  for (const fk of CUSTOMER_FORM_SUBMISSION_FORM_KEYS) {
    o[fk] = coerceFormBucket(o[fk]);
  }
  return o as CustomerFormSubmissionMetadata;
}

/** Move root `docuseal` into the correct `form_*` bucket (in-memory only; no DB migration). */
export function normalizeCustomerFormSubmissionMetadata(
  raw: CustomerFormSubmissionMetadata | null | undefined,
): CustomerFormSubmissionMetadata {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaultEmptyMetadata();
  }
  const o = { ...(raw as Record<string, unknown>) };
  const legacy = o.docuseal;
  if (legacy !== null && legacy !== undefined && typeof legacy === "object" && !Array.isArray(legacy)) {
    delete o.docuseal;
    const L = legacy as Record<string, unknown>;
    const tr = L.target;
    const slot: OnboardingSignatureSlot =
      tr === "change_accountant" || tr === "direct_debit" || tr === "client_registration"
        ? tr
        : "client_registration";
    const fk = formKeyForSignatureSlot(slot);
    const existing = (o[fk] && typeof o[fk] === "object" && !Array.isArray(o[fk])) ? (o[fk] as Record<string, unknown>) : {};
    const existingDu =
      existing.docuseal !== undefined &&
      existing.docuseal !== null &&
      typeof existing.docuseal === "object" &&
      !Array.isArray(existing.docuseal)
        ? { ...(existing.docuseal as object) }
        : {};
    o[fk] = {
      ...existing,
      docuseal: { ...existingDu, ...L },
    };
  }
  return coerceAllFormBuckets(o);
}

/** Sets `metadata.lastUpdatedAt` on the bucket for wizard step 1?4 (draft save / finish). */
export function touchWizardStepInCustomerFormSubmissionMetadata(
  raw: CustomerFormSubmissionMetadata | null | undefined,
  wizardStep: number,
): CustomerFormSubmissionMetadata {
  const fk = formKeyForWizardStep(wizardStep);
  if (!fk) return normalizeCustomerFormSubmissionMetadata(raw);
  const n = normalizeCustomerFormSubmissionMetadata(raw);
  const bucket = { ...(n[fk] as CustomerFormSubmissionFormBucket) };
  const inner = { ...(bucket.metadata ?? {}) };
  inner.lastUpdatedAt = new Date().toISOString();
  return normalizeCustomerFormSubmissionMetadata({
    ...n,
    [fk]: { ...bucket, metadata: inner },
  } as CustomerFormSubmissionMetadata);
}

export function findFormKeyByDocusealSubmissionId(
  meta: CustomerFormSubmissionMetadata | null | undefined,
  submissionId: string,
): CustomerFormSubmissionFormKey | null {
  const n = normalizeCustomerFormSubmissionMetadata(meta);
  const want = String(submissionId).trim();
  if (!want) return null;
  for (const fk of CUSTOMER_FORM_SUBMISSION_FORM_KEYS) {
    const sid = n[fk]?.docuseal?.submissionId;
    if (sid === undefined || sid === null) continue;
    if (String(sid).trim() === want) return fk;
  }
  return null;
}

/** When the webhook payload lacks a clear submission id match, use the first in-flight DocuSeal slot. */
export function findFirstAwaitingDocusealFormKey(
  meta: CustomerFormSubmissionMetadata | null | undefined,
): CustomerFormSubmissionFormKey | null {
  const n = normalizeCustomerFormSubmissionMetadata(meta);
  for (const fk of CUSTOMER_FORM_SUBMISSION_FORM_KEYS) {
    const d = n[fk]?.docuseal;
    if (!d?.submissionId || String(d.submissionId).trim() === "") continue;
    if (d.phase === "signed") continue;
    return fk;
  }
  return null;
}

function formDocusealAwaiting(d: CustomerFormSubmissionFormDocuseal | undefined): boolean {
  if (!d?.submissionId || String(d.submissionId).trim() === "") return false;
  if (d.phase === "signed") return false;
  return true;
}

/** True while a DocuSeal submission exists for a form and merge is not finished (`phase` !== `signed`). */
export function isDocusealSignatureAwaitingClient(
  meta: CustomerFormSubmissionMetadata | null | undefined,
  forSlot?: OnboardingSignatureSlot,
): boolean {
  const n = normalizeCustomerFormSubmissionMetadata(meta);
  if (forSlot !== undefined) {
    const fk = formKeyForSignatureSlot(forSlot);
    return formDocusealAwaiting(n[fk]?.docuseal);
  }
  for (const fk of CUSTOMER_FORM_SUBMISSION_FORM_KEYS) {
    if (formDocusealAwaiting(n[fk]?.docuseal)) return true;
  }
  return false;
}

export function mergeFormDocusealBlock(
  current: CustomerFormSubmissionMetadata | null | undefined,
  formKey: CustomerFormSubmissionFormKey,
  patch: Partial<CustomerFormSubmissionFormDocuseal>,
): CustomerFormSubmissionMetadata {
  const n = normalizeCustomerFormSubmissionMetadata(current);
  const bucket = { ...(n[formKey] ?? {}) } as CustomerFormSubmissionFormBucket;
  const prev =
    bucket.docuseal !== undefined && bucket.docuseal !== null && typeof bucket.docuseal === "object"
      ? { ...(bucket.docuseal as object) }
      : {};
  return normalizeCustomerFormSubmissionMetadata({
    ...n,
    [formKey]: {
      ...bucket,
      docuseal: { ...prev, ...patch } as CustomerFormSubmissionFormDocuseal,
    },
  } as CustomerFormSubmissionMetadata);
}

export function setDocusealAfterEmailSent(
  current: CustomerFormSubmissionMetadata | null | undefined,
  submissionId: string,
  slot: OnboardingSignatureSlot = "client_registration",
): CustomerFormSubmissionMetadata {
  const fk = formKeyForSignatureSlot(slot);
  return mergeFormDocusealBlock(current, fk, {
    submissionId,
    phase: "email_sent",
    emailedAt: new Date().toISOString(),
    target: slot,
  });
}

/** Clears DocuSeal pipeline fields for one bucket; keeps `docuseal` as `{}` and preserves nested `metadata`. */
export function clearFormDocusealMetadata(
  current: CustomerFormSubmissionMetadata | null | undefined,
  formKey: CustomerFormSubmissionFormKey,
): CustomerFormSubmissionMetadata {
  const n = normalizeCustomerFormSubmissionMetadata(current);
  const bucket = { ...(n[formKey] as CustomerFormSubmissionFormBucket) };
  const inner = { ...(bucket.metadata ?? {}) };
  return normalizeCustomerFormSubmissionMetadata({
    ...n,
    [formKey]: {
      ...bucket,
      docuseal: {},
      metadata: inner,
    },
  } as CustomerFormSubmissionMetadata);
}

export function patchFormBucket(
  current: CustomerFormSubmissionMetadata | null | undefined,
  formKey: CustomerFormSubmissionFormKey,
  patch: Partial<CustomerFormSubmissionFormBucket>,
): CustomerFormSubmissionMetadata {
  const n = normalizeCustomerFormSubmissionMetadata(current);
  return normalizeCustomerFormSubmissionMetadata({
    ...n,
    [formKey]: {
      ...(n[formKey] ?? {}),
      ...patch,
    },
  } as CustomerFormSubmissionMetadata);
}

@Entity("customer_form_submission")
export class CustomerFormSubmissionEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "customer_id", type: "uuid" })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @Column({ type: "jsonb" })
  data!: Record<string, unknown>;

  @Column({
    type: "enum",
    enum: CustomerFormSubmissionStatus,
    enumName: "customer_form_submission_status_enum",
    default: CustomerFormSubmissionStatus.draft,
  })
  status!: CustomerFormSubmissionStatus;

  @Column({ type: "jsonb", default: () => ({}) })
  metadata!: CustomerFormSubmissionMetadata;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
