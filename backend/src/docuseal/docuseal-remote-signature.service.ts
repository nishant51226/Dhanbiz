import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CustomerFormSubmissionEntity,
  CustomerFormSubmissionStatus,
  type OnboardingSignatureSlot,
  isDocusealSignatureAwaitingClient,
  setDocusealAfterEmailSent,
} from "../entities/customer-form-submission.entity";
import { DocusealApiService, type DocusealSubmitterFieldInput } from "./docuseal-api.service";
import { docusealPrefillFromSubmissionData } from "./docuseal-prefill-from-onboarding";

/** DocuSeal template field names that the client must still fill (draw/type). Exact match, case-insensitive. */
function parseSignerWritableFieldNames(env: string | undefined): Set<string> {
  const raw = (env ?? "Signature").split(",");
  const out = new Set<string>();
  for (const s of raw) {
    const t = s.trim().toLowerCase();
    if (t) out.add(t);
  }
  return out;
}

type TemplateFieldRow = { name?: unknown; submitter_uuid?: unknown };
type TemplateSubmitterRow = { name?: unknown; uuid?: unknown };

function readSubmitterUuidForRole(template: unknown, role: string): string | null {
  if (!template || typeof template !== "object") return null;
  const list = (template as { submitters?: TemplateSubmitterRow[] }).submitters;
  if (!Array.isArray(list) || list.length === 0) return null;
  const rl = role.trim().toLowerCase();
  for (const s of list) {
    if (typeof s?.name === "string" && typeof s.uuid === "string" && s.name.trim().toLowerCase() === rl) {
      return s.uuid;
    }
  }
  const first = list[0];
  return typeof first?.uuid === "string" ? first.uuid : null;
}

/** Lowercase field name -> canonical `name` from template (DocuSeal is picky about casing). */
function templateFieldNamesForSubmitter(template: unknown, submitterUuid: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!submitterUuid || !template || typeof template !== "object") return map;
  const rows = (template as { fields?: TemplateFieldRow[] }).fields;
  if (!Array.isArray(rows)) return map;
  for (const f of rows) {
    if (typeof f?.submitter_uuid !== "string" || f.submitter_uuid !== submitterUuid) continue;
    if (typeof f.name !== "string" || !f.name.trim()) continue;
    map.set(f.name.trim().toLowerCase(), f.name);
  }
  return map;
}

/**
 * `fields` must only reference names that exist on the template (422 otherwise).
 * `values` carries the full prefill; extra keys are ignored by DocuSeal.
 *
 * Lock-everything-by-default: every template field is included in `fields[]` with `readonly` set
 * from `writableFieldNames` (default just `Signature`). Without this, fields that have no prefill
 * value are not added to `fields[]` at all, so DocuSeal leaves them editable for the signer —
 * including blank text fields and unticked checkboxes (the editor doesn't expose a Read-only
 * toggle for Checkbox controls). Net result: only the Signature box (and anything else listed in
 * `DOCUSEAL_SIGNATURE_FIELD_NAMES`) is writable; the rest is read-only at signing time.
 */
function buildDocusealSubmitterFieldsForKnownTemplateNames(params: {
  fieldValues: Record<string, string | number | boolean>;
  writableFieldNames: Set<string>;
  nameByKeyLower: Map<string, string>;
}): DocusealSubmitterFieldInput[] {
  const fields: DocusealSubmitterFieldInput[] = [];
  const seenLower = new Set<string>();

  for (const [key, default_value] of Object.entries(params.fieldValues)) {
    const canonical = params.nameByKeyLower.get(key.trim().toLowerCase());
    if (!canonical) continue;
    const readonly = !params.writableFieldNames.has(canonical.trim().toLowerCase());
    fields.push({ name: canonical, default_value, readonly });
    seenLower.add(canonical.toLowerCase());
  }

  for (const [lower, canonical] of params.nameByKeyLower) {
    if (seenLower.has(lower)) continue;
    const readonly = !params.writableFieldNames.has(lower);
    fields.push({ name: canonical, default_value: null, readonly });
    seenLower.add(lower);
  }

  return fields;
}

function parseSubmittersResponse(raw: unknown): { submissionId: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new BadRequestException("DocuSeal returned an unexpected response (expected submitter array)");
  }
  const first = raw[0] as Record<string, unknown>;
  const sid = first.submission_id;
  if (typeof sid === "number" && Number.isFinite(sid)) {
    return { submissionId: String(sid) };
  }
  if (typeof sid === "string" && sid.trim().length > 0) {
    return { submissionId: sid.trim() };
  }
  throw new BadRequestException("DocuSeal response did not include submission_id");
}

/** DocuSeal default role name in many templates; must match a role on *your* template or set `DOCUSEAL_DEFAULT_SUBMITTER_ROLE`. */
const DOCUSEAL_ROLE_FALLBACK = "First Party";

/** "Client" is not a DocuSeal template role name; it often comes from mistaken API payloads or a shell env override. */
function isUnusableDocusealRoleName(s: string | undefined): boolean {
  if (!s) return true;
  const t = s.trim();
  return t.length === 0 || t.toLowerCase() === "client";
}

/** Older `.env.example` suggested this; DocuSeal templates usually use `First Party` instead. */
function isLegacyMisconfiguredRole(s: string | undefined): boolean {
  return s?.trim().toLowerCase() === "customer signature";
}

function resolveDocusealSubmitterRole(bodyRole: string | undefined, envRole: string | undefined): string {
  const br = bodyRole?.trim();
  const er = envRole?.trim();
  const candidates = [
    br && !isLegacyMisconfiguredRole(br) ? br : undefined,
    er && !isLegacyMisconfiguredRole(er) ? er : undefined,
    DOCUSEAL_ROLE_FALLBACK,
  ];
  for (const c of candidates) {
    if (!isUnusableDocusealRoleName(c)) return c!;
  }
  return DOCUSEAL_ROLE_FALLBACK;
}

export type DocusealSignatureTarget = OnboardingSignatureSlot;

function parsePositiveTemplateId(raw: string): number | null {
  const templateId = Number(raw.trim());
  if (!raw.trim() || !Number.isFinite(templateId) || templateId <= 0) return null;
  return templateId;
}

/** Per-step template ids; each falls back to `DOCUSEAL_TEMPLATE_ID` when unset. */
function templateIdForTarget(target: DocusealSignatureTarget): number {
  if (target !== "client_registration" && target !== "change_accountant") {
    throw new BadRequestException(
      `DocuSeal signing only supports client_registration and change_accountant (got ${target})`,
    );
  }
  const main = process.env.DOCUSEAL_TEMPLATE_ID ?? "";
  const explicit =
    target === "client_registration" ? main : (process.env.DOCUSEAL_TEMPLATE_ID_CHANGE_ACCOUNTANT ?? "");
  const raw = explicit.trim() || main.trim();
  const id = parsePositiveTemplateId(raw);
  if (id === null) {
    throw new ServiceUnavailableException(
      target === "client_registration"
        ? "DOCUSEAL_TEMPLATE_ID is not configured"
        : `DocuSeal template for ${target} is not configured (set DOCUSEAL_TEMPLATE_ID or the step-specific DOCUSEAL_TEMPLATE_ID_* env var)`,
    );
  }
  return id;
}

@Injectable()
export class DocusealRemoteSignatureService {
  private readonly log = new Logger(DocusealRemoteSignatureService.name);

  constructor(
    @InjectRepository(CustomerFormSubmissionEntity)
    private readonly submissions: Repository<CustomerFormSubmissionEntity>,
    private readonly docuseal: DocusealApiService,
    private readonly config: ConfigService
  ) {}

  async sendClientRegistrationSignatureRequest(params: {
    customerId: string;
    submissionId: string;
    recipientEmail: string;
    recipientName?: string;
    role?: string;
    /** Which onboarding signature slot this DocuSeal flow fills (webhook merge + template selection). */
    signatureTarget?: DocusealSignatureTarget;
    /** @deprecated Ignored — prefill is built from submission `data` on the server. */
    fieldValues?: Record<string, string | boolean | number>;
  }): Promise<{ docusealSubmissionId: string }> {
    const row = await this.submissions.findOne({
      where: { id: params.submissionId, customerId: params.customerId },
    });
    if (!row) {
      throw new NotFoundException("Form submission not found");
    }
    const signatureTarget: DocusealSignatureTarget = params.signatureTarget ?? "client_registration";
    this.log.log(
      `DocuSeal remote signature request — customer=${params.customerId} formSubmissionRow=${params.submissionId} ` +
        `target=${signatureTarget} recipient=${params.recipientEmail.trim().toLowerCase()}`,
    );
    if (isDocusealSignatureAwaitingClient(row.metadata, signatureTarget)) {
      this.log.warn(
        `DocuSeal remote signature blocked (already awaiting) — row=${row.id} target=${signatureTarget} ` +
          `buckets=[${this.summarizeBuckets(row.metadata)}]`,
      );
      throw new ConflictException(
        "A remote signature request is already pending for this step on this submission.",
      );
    }
    if (row.status === CustomerFormSubmissionStatus.completed) {
      throw new ConflictException("This submission is already marked completed.");
    }

    const templateId = templateIdForTarget(signatureTarget);

    const email = params.recipientEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      throw new BadRequestException("Invalid recipient email");
    }

    /** Must match a submitter role name on the DocuSeal template exactly (see template editor). */
    const role = resolveDocusealSubmitterRole(
      params.role,
      this.config.get<string>("DOCUSEAL_DEFAULT_SUBMITTER_ROLE"),
    );

    const fieldValues = docusealPrefillFromSubmissionData(row.data, signatureTarget);

    const writableNames = parseSignerWritableFieldNames(this.config.get<string>("DOCUSEAL_SIGNATURE_FIELD_NAMES"));

    let lockFields: DocusealSubmitterFieldInput[] | undefined;
    if (Object.keys(fieldValues).length > 0) {
      try {
        const template = await this.docuseal.getTemplate(templateId);
        const submitterUuid = readSubmitterUuidForRole(template, role);
        const nameByKeyLower = templateFieldNamesForSubmitter(template, submitterUuid);
        if (nameByKeyLower.size > 0) {
          lockFields = buildDocusealSubmitterFieldsForKnownTemplateNames({
            fieldValues,
            writableFieldNames: writableNames,
            nameByKeyLower,
          });
        }
      } catch (err) {
        this.log.warn(
          `DocuSeal template ${templateId} fetch failed; sending values only (no per-field readonly). ${String(err)}`,
        );
      }
    }

    const raw = await this.docuseal.createSubmission({
      templateId,
      sendEmail: true,
      order: "random",
      submitters: [
        {
          email,
          role,
          name: params.recipientName?.trim() || undefined,
          external_id: row.id,
          ...(Object.keys(fieldValues).length > 0 ? { values: fieldValues } : {}),
          ...(lockFields && lockFields.length > 0 ? { fields: lockFields } : {}),
        },
      ],
    });

    const { submissionId } = parseSubmittersResponse(raw);
    row.status = CustomerFormSubmissionStatus.draft;
    row.metadata = setDocusealAfterEmailSent(row.metadata, submissionId, signatureTarget);
    await this.submissions.save(row);
    this.log.log(
      `DocuSeal remote signature email sent — customer=${params.customerId} formSubmissionRow=${row.id} ` +
        `target=${signatureTarget} docusealSubmissionId=${submissionId} templateId=${templateId} ` +
        `recipient=${email} role=${role} prefillFields=${Object.keys(fieldValues).length} ` +
        `readonlyLockedFields=${lockFields?.length ?? 0} buckets=[${this.summarizeBuckets(row.metadata)}]`,
    );
    return { docusealSubmissionId: submissionId };
  }

  private summarizeBuckets(meta: CustomerFormSubmissionEntity["metadata"]): string {
    if (!meta || typeof meta !== "object") return "none";
    const parts: string[] = [];
    for (const fk of ["form_1", "form_2", "form_3", "form_4"] as const) {
      const bucket = (meta as Record<string, unknown>)[fk];
      if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) continue;
      const d = (bucket as { docuseal?: { submissionId?: string; target?: string; phase?: string } }).docuseal;
      if (d?.submissionId) {
        parts.push(`${fk}(sub=${d.submissionId},target=${d.target ?? "?"},phase=${d.phase ?? "?"})`);
      }
    }
    return parts.length > 0 ? parts.join(" | ") : "no docuseal buckets yet";
  }
}
