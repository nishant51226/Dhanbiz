import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Brackets, Repository } from "typeorm";
import { Customer } from "../entities/customer.entity";
import {
  CustomerFormSubmissionEntity,
  CustomerFormSubmissionStatus,
  type CustomerFormSubmissionFormKey,
  type CustomerFormSubmissionMetadata,
  clearFormDocusealMetadata,
  findFirstAwaitingDocusealFormKey,
  findFormKeyByDocusealSubmissionId,
  isDocusealSignatureAwaitingClient,
  mergeFormDocusealBlock,
  normalizeCustomerFormSubmissionMetadata,
  patchFormBucket,
  signatureSlotFromFormKey,
} from "../entities/customer-form-submission.entity";
import { File, FileType } from "../entities/file.entity";
import { S3Service } from "../s3/s3.service";
import { signatureFieldNamesForMatching } from "./docuseal-signature-field-names.js";

type WebhookEnvelope = {
  event_type?: string;
  data?: Record<string, unknown>;
};

type DocusealMergeTarget = "client_registration" | "change_accountant";

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function isSignatureImageValue(s: string): boolean {
  const t = s.trim();
  return isHttpUrl(t) || t.startsWith("data:image/");
}

function isLikelySignatureImageUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    isHttpUrl(url) &&
    (u.includes("signature") || u.includes(".png") || u.includes(".jpg") || u.includes(".jpeg") || u.includes("/blobs/"))
  );
}

function collectStringValuesFromUnknown(v: unknown, out: string[]): void {
  if (typeof v === "string" && v.trim().length > 0) {
    out.push(v.trim());
    return;
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      if (typeof x === "object" && x && "value" in (x as Record<string, unknown>)) {
        const val = (x as { value?: unknown }).value;
        if (typeof val === "string") out.push(val.trim());
      }
    }
  } else if (v && typeof v === "object") {
    for (const val of Object.values(v as Record<string, unknown>)) {
      if (typeof val === "string") out.push(val.trim());
    }
  }
}

/** DocuSeal payloads vary by version: signature image URL can sit under any of these. */
function pickSignatureImageUrl(payload: WebhookEnvelope): string | null {
  const data = payload.data;
  if (!data) return null;

  const fieldNames = signatureFieldNamesForMatching(process.env.DOCUSEAL_SIGNATURE_FIELD_NAMES);

  /** Both `field` and `name` show up in the wild; `type === "signature"` is the strongest hint. */
  const fromValuesArray = (values: unknown): string | null => {
    if (!Array.isArray(values)) return null;
    for (const row of values) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const fieldKey = String(r.field ?? r.name ?? "").toLowerCase();
      const fieldType = String(r.type ?? "").toLowerCase();
      const value = String(r.value ?? "");
      if (!value || !isSignatureImageValue(value)) continue;
      if (fieldType === "signature") return value;
      if (fieldNames.some((n) => fieldKey === n || fieldKey.includes(n))) return value;
    }
    return null;
  };

  const named = fromValuesArray(data.values);
  if (named) return named;
  if (Array.isArray(data.submitters)) {
    for (const s of data.submitters) {
      if (s && typeof s === "object") {
        const hit = fromValuesArray((s as Record<string, unknown>).values);
        if (hit) return hit;
      }
    }
  }

  /** Some DocuSeal builds expose the rendered signature image directly on the submitter. */
  if (Array.isArray(data.submitters)) {
    for (const s of data.submitters) {
      if (!s || typeof s !== "object") continue;
      const sr = s as Record<string, unknown>;
      const direct =
        (typeof sr.signature === "string" && sr.signature) ||
        (typeof sr.signature_url === "string" && sr.signature_url) ||
        "";
      if (direct && isSignatureImageValue(String(direct))) return String(direct);
      const docs = sr.documents ?? sr.signed_documents ?? sr.attachments;
      if (Array.isArray(docs)) {
        for (const d of docs) {
          if (!d || typeof d !== "object") continue;
          const u = (d as Record<string, unknown>).url;
          if (typeof u === "string" && isLikelySignatureImageUrl(u)) return u;
        }
      }
    }
  }

  /** Last-resort fallbacks: any URL anywhere that *looks* like a signature image, then any URL. */
  const candidates: string[] = [];
  collectStringValuesFromUnknown(data.values, candidates);
  if (Array.isArray(data.submitters)) {
    for (const s of data.submitters) {
      if (s && typeof s === "object") {
        collectStringValuesFromUnknown((s as Record<string, unknown>).values, candidates);
      }
    }
  }
  for (const c of candidates) {
    if (isLikelySignatureImageUrl(c)) return c;
  }
  for (const c of candidates) {
    if (isHttpUrl(c)) return c;
  }
  return null;
}

function readExternalSubmissionId(payload: WebhookEnvelope): string | null {
  const data = payload.data;
  if (!data) return null;
  const ext = data.external_id;
  if (typeof ext === "string" && ext.length > 0) return ext;
  if (Array.isArray(data.submitters)) {
    for (const s of data.submitters) {
      if (s && typeof s === "object") {
        const e = (s as Record<string, unknown>).external_id;
        if (typeof e === "string" && e.length > 0) return e;
      }
    }
  }
  return null;
}

function readDocusealSubmissionNumericId(payload: WebhookEnvelope): string | null {
  const data = payload.data;
  if (!data) return null;
  const sub = data.submission as Record<string, unknown> | undefined;
  const fromSub = sub?.id;
  if (typeof fromSub === "number" && Number.isFinite(fromSub)) return String(fromSub);
  if (typeof fromSub === "string" && fromSub.trim()) return fromSub.trim();
  const subId = (data as { submission_id?: unknown }).submission_id;
  if (typeof subId === "number" && Number.isFinite(subId)) return String(subId);
  if (typeof subId === "string" && subId.trim()) return subId.trim();
  const top = data.id;
  if (typeof top === "number" && Number.isFinite(top)) return String(top);
  if (typeof top === "string" && top.trim()) return top.trim();
  return null;
}

/**
 * True when the **submitter** in this payload has finished signing.
 * Do not use nested `submission.status` — DocuSeal can mark the parent submission completed
 * while a submitter is still `opened`, which caused false completion merges on `form.started`.
 */
function isDocusealPayloadCompleted(payload: WebhookEnvelope): boolean {
  const data = payload.data;
  if (!data || typeof data !== "object") return false;
  if (data.status === "completed") return true;
  const completedAt = (data as { completed_at?: unknown }).completed_at;
  if (typeof completedAt === "string" && completedAt.trim().length > 0) return true;
  return false;
}

function summarizeMetadataDocusealBuckets(meta: CustomerFormSubmissionMetadata | null | undefined): string {
  const n = normalizeCustomerFormSubmissionMetadata(meta);
  const parts: string[] = [];
  for (const fk of ["form_1", "form_2", "form_3", "form_4"] as const) {
    const bucket = n[fk];
    const d = bucket?.docuseal;
    if (d?.submissionId) {
      parts.push(
        `${fk}(sub=${d.submissionId},target=${d.target ?? "?"},phase=${d.phase ?? "?"},bucketStatus=${bucket?.status ?? "?"})`,
      );
    }
  }
  return parts.length > 0 ? parts.join(" | ") : "no docuseal buckets";
}

function summarizeWebhookPayload(payload: WebhookEnvelope): string {
  const eventType = typeof payload.event_type === "string" ? payload.event_type : "<empty>";
  const dsId = readDocusealSubmissionNumericId(payload) ?? "-";
  const ext = readExternalSubmissionId(payload) ?? "-";
  const data = payload.data;
  const status =
    data && typeof data === "object" && typeof (data as { status?: unknown }).status === "string"
      ? String((data as { status: string }).status)
      : "-";
  const completedAt =
    data &&
    typeof data === "object" &&
    typeof (data as { completed_at?: unknown }).completed_at === "string" &&
    (data as { completed_at: string }).completed_at.trim().length > 0
      ? "yes"
      : "no";
  const templateRaw =
    data && typeof data === "object"
      ? (data as { template_id?: unknown; templateId?: unknown }).template_id ??
        (data as { templateId?: unknown }).templateId
      : undefined;
  const template =
    typeof templateRaw === "number" || typeof templateRaw === "string" ? String(templateRaw) : "-";
  const submitterEmail =
    data &&
    typeof data === "object" &&
    typeof (data as { email?: unknown }).email === "string"
      ? String((data as { email: string }).email)
      : "-";
  return (
    `event=${eventType} docusealSubmissionId=${dsId} externalId=${ext} ` +
    `data.status=${status} completed_at=${completedAt} templateId=${template} submitterEmail=${submitterEmail}`
  );
}

function summarizeSignatureFieldsInPayload(payload: WebhookEnvelope): string {
  const data = payload.data;
  if (!data || typeof data !== "object") return "no payload data";
  const names: string[] = [];
  const collect = (values: unknown) => {
    if (!Array.isArray(values)) return;
    for (const row of values) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const field = String(r.field ?? r.name ?? "?");
      const type = String(r.type ?? "?");
      const hasValue =
        typeof r.value === "string" && r.value.trim().length > 0 ? "hasValue" : "empty";
      names.push(`${field}:${type}:${hasValue}`);
    }
  };
  collect(data.values);
  if (Array.isArray(data.submitters)) {
    for (const s of data.submitters) {
      if (s && typeof s === "object") collect((s as Record<string, unknown>).values);
    }
  }
  return names.length > 0 ? names.join(", ") : "no field values in payload";
}

const DOCUSEAL_NON_COMPLETION_EVENTS = new Set([
  "form.started",
  "form.viewed",
  "submission.created",
  "template.updated",
]);

function submissionIdsMatch(row: CustomerFormSubmissionEntity, payload: WebhookEnvelope): boolean {
  const fromPayload = readDocusealSubmissionNumericId(payload);
  if (!fromPayload) return false;
  return findFormKeyByDocusealSubmissionId(row.metadata, fromPayload) !== null;
}

function resolveDocusealFormKey(row: CustomerFormSubmissionEntity, payload: WebhookEnvelope): CustomerFormSubmissionFormKey | null {
  const dsId = readDocusealSubmissionNumericId(payload);
  if (dsId) {
    /** Never guess another bucket when DocuSeal sent a concrete submission id — duplicate webhooks used to land on the next awaiting form. */
    return findFormKeyByDocusealSubmissionId(row.metadata, dsId);
  }
  return findFirstAwaitingDocusealFormKey(row.metadata);
}

/** Main row status is only draft|completed; merge when still draft and this DocuSeal submission belongs to the row. */
function canMergeCompletedDocuseal(row: CustomerFormSubmissionEntity, payload: WebhookEnvelope): boolean {
  if (row.status === CustomerFormSubmissionStatus.completed) return false;
  if (row.status !== CustomerFormSubmissionStatus.draft) return false;
  if (submissionIdsMatch(row, payload)) return true;
  const ext = readExternalSubmissionId(payload);
  if (ext === row.id && isDocusealPayloadCompleted(payload)) return true;
  return false;
}

@Injectable()
export class DocusealWebhookService {
  private readonly log = new Logger(DocusealWebhookService.name);

  constructor(
    @InjectRepository(CustomerFormSubmissionEntity)
    private readonly submissions: Repository<CustomerFormSubmissionEntity>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(File)
    private readonly files: Repository<File>,
    private readonly config: ConfigService,
    private readonly s3: S3Service,
  ) {}

  async handlePayload(body: unknown): Promise<{ ok: true; handled: string }> {
    const payload = body as WebhookEnvelope;
    const eventType = typeof payload.event_type === "string" ? payload.event_type : "";
    const summary = summarizeWebhookPayload(payload);
    this.log.log(`DocuSeal webhook received — ${summary}`);

    if (eventType === "form.declined") {
      await this.handleDeclined(payload);
      return { ok: true, handled: "form.declined" };
    }
    if (eventType === "form.viewed" || eventType === "form.started") {
      await this.handleViewed(payload);
      return { ok: true, handled: eventType };
    }
    if (eventType === "form.completed" || eventType === "submission.completed") {
      await this.handleCompleted(payload);
      return { ok: true, handled: eventType };
    }
    if (!DOCUSEAL_NON_COMPLETION_EVENTS.has(eventType) && isDocusealPayloadCompleted(payload)) {
      this.log.warn(
        `DocuSeal webhook: treating as completed despite event_type=${eventType || "empty"} (submitter status/completed_at indicates done). ${summary}`,
      );
      await this.handleCompleted(payload);
      return { ok: true, handled: `completed_inferred:${eventType || "unknown"}` };
    }
    await this.logIgnoredWebhook(eventType, payload, summary);
    return { ok: true, handled: `ignored:${eventType || "unknown"}` };
  }

  /** Expected no-ops (submission.created, template.updated, etc.) — still log row + bucket context for debugging. */
  private async logIgnoredWebhook(eventType: string, payload: WebhookEnvelope, summary: string): Promise<void> {
    const row = await this.resolveSubmission(payload);
    const reason =
      eventType === "submission.created"
        ? "signing email sent; waiting for form.completed / submission.completed"
        : eventType === "template.updated"
          ? "template metadata change only"
          : eventType === "form.started"
            ? "signer opened form (handled as viewed when applicable)"
            : "not a completion event";
    if (row) {
      const formKey = resolveDocusealFormKey(row, payload);
      this.log.log(
        `DocuSeal webhook ignored (${reason}) — ${summary} ` +
          `matchedRow=${row.id} customer=${row.customerId} formKey=${formKey ?? "?"} ` +
          `buckets=[${summarizeMetadataDocusealBuckets(row.metadata)}]`,
      );
    } else {
      this.log.log(
        `DocuSeal webhook ignored (${reason}) — ${summary} matchedRow=none (no form-submission row for this submission/external id yet)`,
      );
    }
  }

  private async resolveSubmission(payload: WebhookEnvelope): Promise<CustomerFormSubmissionEntity | null> {
    const dsId = readDocusealSubmissionNumericId(payload);
    if (dsId) {
      const bySub = await this.submissions
        .createQueryBuilder("s")
        .where(
          new Brackets((w) => {
            w.where("s.metadata->'form_1'->'docuseal'->>'submissionId' = :dsId", { dsId })
              .orWhere("s.metadata->'form_2'->'docuseal'->>'submissionId' = :dsId", { dsId })
              .orWhere("s.metadata->'form_3'->'docuseal'->>'submissionId' = :dsId", { dsId })
              .orWhere("s.metadata->'form_4'->'docuseal'->>'submissionId' = :dsId", { dsId })
              .orWhere("s.metadata->'docuseal'->>'submissionId' = :dsId", { dsId });
          }),
        )
        .getOne();
      if (bySub) return bySub;
    }
    const ext = readExternalSubmissionId(payload);
    if (ext) {
      return this.submissions.findOne({ where: { id: ext } });
    }
    return null;
  }

  private async handleDeclined(payload: WebhookEnvelope): Promise<void> {
    const row = await this.resolveSubmission(payload);
    if (!row || row.status !== CustomerFormSubmissionStatus.draft) {
      this.log.warn(
        `DocuSeal webhook form.declined: no draft row to update — ${summarizeWebhookPayload(payload)} row=${row?.id ?? "none"}`,
      );
      return;
    }
    const formKey = resolveDocusealFormKey(row, payload);
    if (!formKey) {
      this.log.warn(
        `DocuSeal webhook form.declined: could not resolve form bucket — row=${row.id} customer=${row.customerId} buckets=[${summarizeMetadataDocusealBuckets(row.metadata)}]`,
      );
      return;
    }
    if (!isDocusealSignatureAwaitingClient(row.metadata, signatureSlotFromFormKey(formKey))) {
      this.log.log(
        `DocuSeal webhook form.declined: slot not awaiting — row=${row.id} formKey=${formKey} target=${signatureSlotFromFormKey(formKey)}`,
      );
      return;
    }
    row.metadata = patchFormBucket(clearFormDocusealMetadata(row.metadata, formKey), formKey, {
      status: "remote_signature_declined",
    });
    const data = { ...row.data };
    data.docuseal = {
      ...(typeof data.docuseal === "object" && data.docuseal ? (data.docuseal as object) : {}),
      last_event: "declined",
      declined_at: new Date().toISOString(),
    };
    row.data = data;
    await this.submissions.save(row);
    this.log.log(
      `DocuSeal webhook form.declined: saved — row=${row.id} customer=${row.customerId} formKey=${formKey} target=${signatureSlotFromFormKey(formKey)}`,
    );
  }

  private async handleViewed(payload: WebhookEnvelope): Promise<void> {
    const row = await this.resolveSubmission(payload);
    if (!row) {
      this.log.log(`DocuSeal webhook form.viewed: no matching row — ${summarizeWebhookPayload(payload)}`);
      return;
    }
    if (row.status !== CustomerFormSubmissionStatus.draft) {
      this.log.log(
        `DocuSeal webhook form.viewed: skip non-draft row=${row.id} status=${row.status} — ${summarizeWebhookPayload(payload)}`,
      );
      return;
    }
    const formKey = resolveDocusealFormKey(row, payload);
    if (!formKey) {
      this.log.warn(
        `DocuSeal webhook form.viewed: could not resolve form bucket — row=${row.id} buckets=[${summarizeMetadataDocusealBuckets(row.metadata)}]`,
      );
      return;
    }
    if (!isDocusealSignatureAwaitingClient(row.metadata, signatureSlotFromFormKey(formKey))) {
      this.log.log(
        `DocuSeal webhook form.viewed: slot not awaiting — row=${row.id} formKey=${formKey} target=${signatureSlotFromFormKey(formKey)}`,
      );
      return;
    }
    const n = normalizeCustomerFormSubmissionMetadata(row.metadata);
    if (n[formKey]?.docuseal?.phase === "link_viewed") {
      this.log.debug(
        `DocuSeal webhook form.viewed: already link_viewed — row=${row.id} formKey=${formKey}`,
      );
      return;
    }
    row.metadata = mergeFormDocusealBlock(row.metadata, formKey, {
      phase: "link_viewed",
      viewedAt: new Date().toISOString(),
    });
    const data = { ...row.data };
    data.docuseal = {
      ...(typeof data.docuseal === "object" && data.docuseal ? (data.docuseal as object) : {}),
      last_event: "viewed",
      viewed_at: new Date().toISOString(),
    };
    row.data = data;
    await this.submissions.save(row);
    this.log.log(
      `DocuSeal webhook form.viewed: saved link_viewed — row=${row.id} customer=${row.customerId} formKey=${formKey} target=${signatureSlotFromFormKey(formKey)}`,
    );
  }

  private async handleCompleted(payload: WebhookEnvelope): Promise<void> {
    const summary = summarizeWebhookPayload(payload);
    if (!isDocusealPayloadCompleted(payload)) {
      this.log.log(
        `DocuSeal webhook: skip handleCompleted — submitter not completed. ${summary} fields=[${summarizeSignatureFieldsInPayload(payload)}]`,
      );
      return;
    }
    const dsId = readDocusealSubmissionNumericId(payload) ?? "<missing>";
    const ext = readExternalSubmissionId(payload) ?? "<missing>";
    const row = await this.resolveSubmission(payload);
    if (!row) {
      this.log.warn(
        `DocuSeal webhook handleCompleted: no matching form-submission row (docusealSubmissionId=${dsId}, externalId=${ext}). ${summary}`,
      );
      return;
    }
    /**
     * Logged on every completion so we can correlate "this DocuSeal sub landed on this DB row for
     * this customer" — critical when the wizard creates a fresh row after the email was sent and
     * the webhook ends up updating an older row that the UI no longer reads from.
     */
    this.log.log(
      `DocuSeal webhook handleCompleted: matched row=${row.id} customer=${row.customerId} rowStatus=${row.status} ` +
        `docusealSubmissionId=${dsId} buckets=[${summarizeMetadataDocusealBuckets(row.metadata)}]`,
    );
    if (!canMergeCompletedDocuseal(row, payload)) {
      this.log.warn(
        `DocuSeal webhook: skip completion merge for row=${row.id} customer=${row.customerId} (status=${row.status}). ` +
          `Expected draft with matching metadata form docuseal.submissionId or external_id. ${summary}`,
      );
      return;
    }
    const formKey = resolveDocusealFormKey(row, payload);
    if (!formKey) {
      this.log.warn(
        `DocuSeal webhook: could not resolve form bucket for completion — row=${row.id} buckets=[${summarizeMetadataDocusealBuckets(row.metadata)}]`,
      );
      return;
    }
    const mergeTarget = this.readDocusealMergeTarget(row.metadata, formKey);
    this.log.log(
      `DocuSeal webhook handleCompleted: merging signature — row=${row.id} formKey=${formKey} target=${mergeTarget} fields=[${summarizeSignatureFieldsInPayload(payload)}]`,
    );
    const imageUrl = pickSignatureImageUrl(payload);
    if (!imageUrl) {
      this.log.warn(
        `DocuSeal webhook: no signature image URL in payload — row=${row.id} formKey=${formKey} target=${mergeTarget}. ` +
          `Keeping DocuSeal awaiting state; resend or wait for form.completed webhook. fields=[${summarizeSignatureFieldsInPayload(payload)}]`,
      );
      row.status = CustomerFormSubmissionStatus.draft;
      row.metadata = patchFormBucket(row.metadata, formKey, {
        status: "remote_signature_failed_no_image",
      });
      const d = { ...row.data };
      d.docuseal = {
        ...(typeof d.docuseal === "object" && d.docuseal ? (d.docuseal as object) : {}),
        last_event: "completed_no_signature_url",
        at: new Date().toISOString(),
      };
      row.data = d;
      await this.submissions.save(row);
      return;
    }

    const target = mergeTarget;
    const remoteBasename =
      target === "change_accountant"
        ? "change-accountant-signature-remote.png"
        : "client-registration-signature-remote.png";
    const fileId = await this.storeRemoteSignaturePng(row.customerId, imageUrl, remoteBasename);
    const d0 = payload.data;
    const completedAt =
      d0 && typeof d0 === "object" && typeof (d0 as { completed_at?: unknown }).completed_at === "string"
        ? String((d0 as { completed_at: string }).completed_at)
        : new Date().toISOString();
    const dateOnly = completedAt.includes("T") ? completedAt.slice(0, 10) : completedAt;

    const merged = this.mergeSignatureIntoOnboarding(row.data, fileId, dateOnly, target);
    row.data = merged;
    row.status = CustomerFormSubmissionStatus.draft;
    const dsIdForMeta = readDocusealSubmissionNumericId(payload);
    row.metadata = patchFormBucket(
      mergeFormDocusealBlock(row.metadata, formKey, {
        phase: "signed",
        signedAt: new Date().toISOString(),
        ...(dsIdForMeta ? { submissionId: dsIdForMeta } : {}),
      }),
      formKey,
      { status: "remote_signature_completed" },
    );
    await this.submissions.save(row);

    /**
     * Mirror the merged signature into `customer.onboardingData` so admin views and exports
     * (which read the customer row, not the form-submission row) stay in sync. Earlier this
     * branch only ran when `onboardingData` was already a non-null object, which silently
     * dropped the mirror whenever the wizard hadn't yet pushed a customer-level autosave —
     * leaving the customer row blank forever for that signature even though the wizard's
     * form-submission row was correct. The merge helper accepts `null`/`undefined` and
     * returns a fresh object, so seeding from empty is safe.
     */
    const customer = await this.customers.findOne({ where: { id: row.customerId } });
    if (customer) {
      const existing =
        customer.onboardingData !== null &&
        customer.onboardingData !== undefined &&
        typeof customer.onboardingData === "object" &&
        !Array.isArray(customer.onboardingData)
          ? (customer.onboardingData as Record<string, unknown>)
          : {};
      customer.onboardingData = this.mergeSignatureIntoOnboarding(existing, fileId, dateOnly, target);
      await this.customers.save(customer);
    }
    const sigRef = `file:${fileId}`;
    this.log.log(
      `DocuSeal webhook handleCompleted: success — row=${row.id} customer=${row.customerId} formKey=${formKey} ` +
        `target=${target} signature=${sigRef} docusealSubmissionId=${dsIdForMeta ?? dsId} ` +
        `metadata=[${summarizeMetadataDocusealBuckets(row.metadata)}] customerMirror=${customer ? "yes" : "no"}`,
    );
  }

  private readDocusealMergeTarget(
    metadata: CustomerFormSubmissionMetadata | null | undefined,
    formKey: CustomerFormSubmissionFormKey,
  ): DocusealMergeTarget {
    const n = normalizeCustomerFormSubmissionMetadata(metadata);
    const t = n[formKey]?.docuseal?.target;
    if (t === "change_accountant" || t === "client_registration") {
      return t;
    }
    /** Legacy retired-form-2/direct_debit slots (pre-India-rebrand) are no longer signable; treat as registration. */
    const slot = signatureSlotFromFormKey(formKey);
    return slot === "change_accountant" ? "change_accountant" : "client_registration";
  }

  private mergeSignatureIntoOnboarding(
    src: Record<string, unknown> | null | undefined,
    fileId: string,
    dateOnly: string,
    target: DocusealMergeTarget,
  ): Record<string, unknown> {
    const base =
      src !== undefined && src !== null && typeof src === "object" && !Array.isArray(src)
        ? { ...src }
        : {};
    const signatures = (base.signatures as Record<string, unknown> | undefined) ?? {};
    const byFormIndexRaw = signatures.by_form_index;
    const byFormIndex =
      byFormIndexRaw !== undefined &&
      byFormIndexRaw !== null &&
      typeof byFormIndexRaw === "object" &&
      !Array.isArray(byFormIndexRaw)
        ? { ...(byFormIndexRaw as Record<string, unknown>) }
        : {};

    if (target === "client_registration") {
      const cr = (signatures.client_registration as Record<string, unknown> | undefined) ?? {};
      const dateVal =
        typeof cr.date === "string" && cr.date.trim().length > 0 ? (cr.date as string) : dateOnly;
      const nextCr = {
        ...cr,
        signature: `file:${fileId}`,
        date: dateVal,
        collection_mode: "remote_email",
      };
      byFormIndex["1"] = {
        form_key: "client_registration",
        name: typeof cr.name === "string" ? cr.name : "",
        position: typeof cr.position === "string" ? cr.position : "",
        date: dateVal,
        signature: `file:${fileId}`,
      };
      base.signatures = {
        ...signatures,
        client_registration: nextCr,
        by_form_index: byFormIndex,
      };
    } else {
      const c = (signatures.change_accountant as Record<string, unknown> | undefined) ?? {};
      const dateVal =
        typeof c.date === "string" && c.date.trim().length > 0 ? (c.date as string) : dateOnly;
      const nextC = {
        ...c,
        signature: `file:${fileId}`,
        date: dateVal,
        collection_mode: "remote_email",
      };
      byFormIndex["3"] = {
        form_key: "change_accountant",
        name: typeof c.name === "string" ? c.name : "",
        date: dateVal,
        signature: `file:${fileId}`,
      };
      base.signatures = {
        ...signatures,
        change_accountant: nextC,
        by_form_index: byFormIndex,
      };
    }

    base.docuseal = {
      ...(typeof base.docuseal === "object" && base.docuseal ? (base.docuseal as object) : {}),
      last_event: "completed",
      completed_at: new Date().toISOString(),
    };
    return base;
  }

  /**
   * Persist a remote-signed PNG so the wizard UI shows it (`signatures.{slot}.signature = file:<id>`)
   * AND the binary survives in S3 alongside the rest of the customer's onboarding artefacts.
   *
   * Storage destinations (both attempted; the row is saved as long as at least one succeeds):
   * - Local disk under `FILE_STORAGE_ROOT/{customerId}/blobs/<uuid>-<name>.png` (same shape as the
   *   pre-existing path, kept so on-host hydrate reads stay fast and zero-RTT).
   * - S3 under `{customerId}/onboarding-files/files/<fileId>-<name>.png` (matches the convention
   *   in `customer-onboarding-s3.service.ts` so a later `syncCompletedOnboarding` finds it where
   *   it expects). The pre-generated `fileId` is reused for the `files.id` PK so the S3 key and
   *   row id align (mirrors `direct-s3-upload.service.ts`).
   *
   * `OnboardingPdfSignatureHydrateService` already prefers `storageRelativePath` and falls back to
   * `s3Key`, so populating either (or both) is sufficient for PDF generation and the staff UI.
   */
  private async storeRemoteSignaturePng(
    customerId: string,
    imageUrl: string,
    safeBase: string,
  ): Promise<string> {
    let buf: Buffer;
    let mime = "image/png";
    const trimmed = imageUrl.trim();
    if (trimmed.startsWith("data:image/")) {
      const comma = trimmed.indexOf(",");
      if (comma < 0) throw new Error("Invalid data URL for signature");
      const header = trimmed.slice(0, comma);
      const mimeMatch = /^data:([^;]+)/i.exec(header);
      if (mimeMatch?.[1]) mime = mimeMatch[1].trim();
      buf = Buffer.from(trimmed.slice(comma + 1), "base64");
    } else {
      const res = await fetch(trimmed);
      if (!res.ok) {
        throw new Error(`Failed to download signature (${res.status})`);
      }
      buf = Buffer.from(await res.arrayBuffer());
      mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
    }
    if (!mime.startsWith("image/")) {
      this.log.warn(`DocuSeal signature download unexpected mime ${mime}`);
    }

    const fileId = randomUUID();
    const root = this.config.get<string>("FILE_STORAGE_ROOT")?.trim() || "";

    let storageRelativePath: string | null = null;
    if (root) {
      try {
        const blobName = `${fileId}-${safeBase}`;
        const rel = path.join("blobs", blobName).replace(/\\/g, "/");
        const dir = path.join(root, customerId, "blobs");
        await fs.mkdir(dir, { recursive: true });
        const abs = path.join(root, customerId, rel);
        await fs.writeFile(abs, buf);
        storageRelativePath = rel;
      } catch (e) {
        this.log.warn(
          `Could not write remote signature to local disk for ${customerId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    let s3Key: string | null = null;
    if (this.s3.isBucketConfigured()) {
      try {
        const { fileKey } = await this.s3.uploadCustomerFile({
          customerId,
          folder: "onboarding-files",
          key: `files/${fileId}-${safeBase}`,
          body: buf,
          contentType: mime,
        });
        s3Key = fileKey;
      } catch (e) {
        this.log.warn(
          `Could not mirror remote signature to S3 for ${customerId}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    if (!storageRelativePath && !s3Key) {
      throw new Error(
        "Could not persist remote signature: neither FILE_STORAGE_ROOT write nor S3 upload succeeded (configure one or both)",
      );
    }

    const row = this.files.create({
      id: fileId,
      customerId,
      parentId: null,
      fileType: FileType.file,
      name: safeBase,
      mimeType: mime,
      sizeBytes: String(buf.length),
      storageRelativePath,
      s3Key,
      metadata: { remoteSignature: true, source: "docuseal" },
    });
    const saved = await this.files.save(row);
    this.log.log(
      `Stored remote signature fileId=${saved.id} customer=${customerId} basename=${safeBase} bytes=${buf.length} (local=${storageRelativePath ? "yes" : "no"}, s3=${s3Key ? "yes" : "no"})`,
    );
    return saved.id;
  }
}
