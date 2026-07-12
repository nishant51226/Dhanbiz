import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  CustomerFormSubmissionEntity,
  CustomerFormSubmissionStatus,
  normalizeCustomerFormSubmissionMetadata,
  touchWizardStepInCustomerFormSubmissionMetadata,
} from "../entities/customer-form-submission.entity";
import { Customer, CustomerAccountStatus } from "../entities/customer.entity";
import { CustomerOnboardingS3Service } from "./customer-onboarding-s3.service";
import { preserveOnboardingSignatures } from "./onboarding-data-merge.util";

@Injectable()
export class CustomerFormSubmissionsService {
  private readonly log = new Logger(CustomerFormSubmissionsService.name);

  constructor(
    @InjectRepository(CustomerFormSubmissionEntity)
    private readonly submissions: Repository<CustomerFormSubmissionEntity>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    private readonly onboardingS3: CustomerOnboardingS3Service,
  ) {}

  async createDraft(
    customerId: string,
    data: Record<string, unknown>,
    wizardStep?: number,
  ): Promise<CustomerFormSubmissionEntity> {
    const customer = await this.customers.findOne({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    const step =
      typeof wizardStep === "number" && Number.isInteger(wizardStep) && wizardStep >= 1 && wizardStep <= 4
        ? wizardStep
        : 1;
    const metadata = touchWizardStepInCustomerFormSubmissionMetadata(undefined, step);
    const row = this.submissions.create({
      customerId,
      data,
      status: CustomerFormSubmissionStatus.draft,
      metadata,
    });
    const saved = await this.submissions.save(row);
    saved.metadata = normalizeCustomerFormSubmissionMetadata(saved.metadata);
    return saved;
  }

  async update(
    customerId: string,
    submissionId: string,
    patch: {
      data?: Record<string, unknown>;
      status?: CustomerFormSubmissionStatus;
      wizardStep?: number;
    },
  ): Promise<CustomerFormSubmissionEntity> {
    const row = await this.submissions.findOne({
      where: { id: submissionId, customerId },
    });
    if (!row) {
      throw new NotFoundException("Form submission not found");
    }
    const wasSubmissionCompleted = row.status === CustomerFormSubmissionStatus.completed;
    if (patch.data !== undefined) {
      /**
       * Wizard autosave fires every few seconds and ships the entire `data` blob, including
       * an empty `signatures.{slot}.signature` whenever the frontend's poller hasn't yet
       * resynced the webhook-merged `file:<uuid>` reference. Without this guard, the autosave
       * silently overwrites the signature the DocuSeal webhook just stored, the wizard then
       * refetches the now-empty row, and the UI flips back to "Not signed yet".
       */
      row.data = preserveOnboardingSignatures(row.data, patch.data);
    }
    if (patch.status !== undefined) {
      row.status = patch.status;
    }
    row.metadata = normalizeCustomerFormSubmissionMetadata(row.metadata);
    if (
      patch.wizardStep !== undefined &&
      Number.isInteger(patch.wizardStep) &&
      patch.wizardStep >= 1 &&
      patch.wizardStep <= 4
    ) {
      row.metadata = touchWizardStepInCustomerFormSubmissionMetadata(row.metadata, patch.wizardStep);
    }
    const saved = await this.submissions.save(row);
    saved.metadata = normalizeCustomerFormSubmissionMetadata(saved.metadata);

    if (!wasSubmissionCompleted && saved.status === CustomerFormSubmissionStatus.completed) {
      const cust = await this.customers.findOne({
        where: { id: customerId },
        select: { id: true, accountStatus: true },
      });
      // Promote to active for new / proposed onboarding only; do not override **inactive** (or **active**) from staff.
      if (
        cust &&
        (cust.accountStatus === CustomerAccountStatus.draft ||
          cust.accountStatus === CustomerAccountStatus.proposed)
      ) {
        await this.customers.update({ id: customerId }, { accountStatus: CustomerAccountStatus.active });
      }
    }

    if (saved.status === CustomerFormSubmissionStatus.completed) {
      void this.onboardingS3.syncCompletedOnboarding(customerId).catch((err) => {
        this.log.error(
          `Onboarding S3 sync failed for customer ${customerId}: ${err instanceof Error ? err.message : err}`,
        );
      });
    }

    return saved;
  }

  async findLatestByCustomerId(customerId: string): Promise<CustomerFormSubmissionEntity | null> {
    const row = await this.submissions.findOne({
      where: { customerId },
      order: { updatedAt: "DESC" },
    });
    if (row) {
      row.metadata = normalizeCustomerFormSubmissionMetadata(row.metadata);
    }
    return row;
  }

  /** Latest submission row per customer (by `updated_at`), including `data` (for list / batch UIs). */
  async getLatestWithDataByCustomerIds(
    customerIds: string[],
  ): Promise<
    Map<
      string,
      {
        id: string;
        status: "draft" | "completed";
        data: Record<string, unknown>;
        updatedAt: string;
      }
    >
  > {
    const unique = [...new Set(customerIds)].filter((id) => typeof id === "string" && id.length > 0);
    const out = new Map<
      string,
      { id: string; status: "draft" | "completed"; data: Record<string, unknown>; updatedAt: string }
    >();
    if (unique.length === 0) return out;
    const rows = (await this.submissions.query(
      `SELECT DISTINCT ON (customer_id) customer_id AS "customerId", id, status, data, updated_at AS "updatedAt"
       FROM customer_form_submission
       WHERE customer_id = ANY($1::uuid[])
       ORDER BY customer_id, updated_at DESC`,
      [unique],
    )) as Array<{
      customerId: string;
      id: string;
      status: CustomerFormSubmissionStatus;
      data: Record<string, unknown>;
      updatedAt: Date | string;
    }>;
    for (const r of rows) {
      const st =
        r.status === CustomerFormSubmissionStatus.completed ? ("completed" as const) : ("draft" as const);
      const updatedAt =
        r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? "");
      out.set(r.customerId, {
        id: r.id,
        status: st,
        data: r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : {},
        updatedAt,
      });
    }
    return out;
  }

  /** Latest row per customer (by updated_at). */
  async getLatestStatusByCustomerIds(
    customerIds: string[],
  ): Promise<Record<string, "draft" | "completed">> {
    const unique = [...new Set(customerIds)].filter((id) => typeof id === "string" && id.length > 0);
    if (unique.length === 0) return {};
    const rows = (await this.submissions.query(
      `SELECT DISTINCT ON (customer_id) customer_id AS "customerId", status
       FROM customer_form_submission
       WHERE customer_id = ANY($1::uuid[])
       ORDER BY customer_id, updated_at DESC`,
      [unique],
    )) as Array<{ customerId: string; status: CustomerFormSubmissionStatus }>;
    const out: Record<string, "draft" | "completed"> = {};
    for (const r of rows) {
      if (r.status === CustomerFormSubmissionStatus.completed) {
        out[r.customerId] = "completed";
      } else {
        out[r.customerId] = "draft";
      }
    }
    return out;
  }
}
