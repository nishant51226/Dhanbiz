import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { AuthUser } from "../auth/auth.types";
import type { CrudRequest } from "@nestjsx/crud";
import { isNil } from "@nestjsx/util";
import { TypeOrmCrudService } from "@nestjsx/crud-typeorm";
import type { DeepPartial } from "typeorm";
import { DataSource, Repository } from "typeorm";
import { CustomerFormSubmissionStatus } from "../entities/customer-form-submission.entity";
import { Customer, CustomerAccountStatus } from "../entities/customer.entity";
import { StaffCustomerAssignmentEntity } from "../entities/staff-customer-assignment.entity";
import { CustomerUserEntity } from "../entities/customer-user.entity";
import { RoleEntity } from "../entities/role.entity";
import { PlansEntity } from "../entities/plans.entity";
import { UserEntity } from "../entities/user.entity";
import {
  buildCustomerExportCsv,
  buildCustomerExportXlsx,
  buildTabularExportCsv,
  buildTabularExportXlsx,
  exportFilenameBase,
  flattenCustomerExportPayload,
  resolveCustomerExportColumnOrder,
} from "./customer-export.util";
import { CustomerFormSubmissionsService } from "./customer-form-submissions.service";
import { CustomerOnboardingS3Service } from "./customer-onboarding-s3.service";
import { StaffCustomerAssignmentSyncService } from "./staff-customer-assignment-sync.service.js";
import { preserveOnboardingSignatures } from "./onboarding-data-merge.util";
import {
  buildCustomerSummaryExportRow,
  normalizeSummaryExportColumnIds,
} from "./customer-summary-export.builder";
import { defaultSummaryExportColumnIds } from "./customer-summary-export.constants";
import type { LatestSubmissionExport } from "./customers-list-export.mapper";
import { NotificationDispatchService } from "../notification/notification-dispatch.service";
import { runWithAdminRls } from "../tenant/run-with-tenant-rls";

function toIso(d: Date | undefined): string {
  if (!d) return "";
  return d instanceof Date ? d.toISOString() : String(d);
}

function matrixPlanJson(p: PlansEntity) {
  return {
    id: p.id,
    name: p.name,
    billingCycle: p.billingCycle,
    maxTurnover: p.maxTurnover != null ? Number(p.maxTurnover) : null,
    isActive: p.isActive,
  };
}

function roleJson(r: RoleEntity) {
  return {
    id: r.id,
    name: r.name,
    permissions: Array.isArray(r.permissions) ? r.permissions : [],
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  };
}

function userPublicJson(u: UserEntity) {
  return {
    id: u.id,
    email: u.email,
    customerId: u.customerId,
    phoneNumber: u.phoneNumber,
    isAdmin: u.isAdmin,
    createdAt: toIso(u.createdAt),
    updatedAt: toIso(u.updatedAt),
  };
}

function customerUserPortalJson(cu: CustomerUserEntity) {
  return {
    id: cu.id,
    customerId: cu.customerId,
    userId: cu.userId,
    roleId: cu.roleId,
    isActive: cu.isActive,
    createdAt: toIso(cu.createdAt),
    updatedAt: toIso(cu.updatedAt),
    user: cu.user ? userPublicJson(cu.user) : null,
    role: cu.role ? roleJson(cu.role) : null,
  };
}

@Injectable()
export class CustomersService extends TypeOrmCrudService<Customer> {
  private readonly log = new Logger(CustomersService.name);

  constructor(
    @InjectRepository(Customer) repo: Repository<Customer>,
    private readonly onboardingS3: CustomerOnboardingS3Service,
    private readonly formSubmissions: CustomerFormSubmissionsService,
    private readonly dataSource: DataSource,
    private readonly notificationDispatch: NotificationDispatchService,
    private readonly staffAssignmentSync: StaffCustomerAssignmentSyncService,
  ) {
    super(repo);
  }

  /**
   * Creates the customer row, then seeds four onboarding PDF `files` rows + S3 (see
   * {@link CustomerOnboardingS3Service.bootstrapOnboardingPdfFilesOnly}); invoices/statements use `documents`.
   *
   * `runWithAdminRls` opens a dedicated DB connection with `SET LOCAL app.is_admin = '1'`. The global
   * `Repository` from Nest still resolves `repository.manager` via `typeorm-transactional` + CLS to the
   * **request** transaction (RlsTenantInterceptor), so `super.createOne` → `this.repo.save()` would INSERT on
   * the wrong connection. Use the transactional `EntityManager.save()` from the callback so the INSERT runs
   * on the same connection as the GUCs.
   */
  /**
   * @param actor Request user when created via HTTP; used to insert `staff_customer_assignments` for the
   * creator when they are practice staff. All manager/accountant practice users also receive this customer
   * automatically (see inserts below).
   */
  override async createOne(
    req: CrudRequest,
    dto: DeepPartial<Customer>,
    actor?: AuthUser,
  ): Promise<Customer> {
    const payload: DeepPartial<Customer> = { ...dto, accountStatus: CustomerAccountStatus.draft };

    const created = await runWithAdminRls(
      this.dataSource,
      async (manager): Promise<Customer> => {
        const returnShallow = Boolean(
          (req.options?.routes?.createOneBase as { returnShallow?: boolean } | undefined)
            ?.returnShallow,
        );
        const entity = this.prepareEntityBeforeSave(payload, req.parsed);
        if (!entity) {
          this.throwBadRequestException(`Empty data. Nothing to save.`);
        }
        this.log.log(
          `Inserting customers row name="${String(entity.name ?? "").trim()}" planId=${entity.planId ?? "null"} actorUserId=${actor?.userId ?? "none"} isAdmin=${actor?.isAdmin ?? false}`,
        );
        const saved = await manager.save(entity as Customer);
        this.log.log(
          `Inserted customers row id=${saved.id} name="${saved.name}" accountStatus=${saved.accountStatus} planId=${saved.planId ?? "null"} annualTurnoverGbp=${saved.annualTurnoverGbp ?? "null"} createdAt=${saved.createdAt instanceof Date ? saved.createdAt.toISOString() : String(saved.createdAt ?? "")}`,
        );
        if (typeof saved.id === "string" && saved.id) {
          if (actor && !actor.isAdmin && !actor.customerId) {
            await manager.query(
              `INSERT INTO staff_customer_assignments ("staff_user_id", "customer_id")
               VALUES ($1, $2)
               ON CONFLICT ("staff_user_id", "customer_id") DO NOTHING`,
              [actor.userId, saved.id],
            );
            this.log.log(
              `Linked customers row id=${saved.id} to staff_user_id=${actor.userId} (creator assignment)`,
            );
          }
          await this.staffAssignmentSync.assignNewCustomerToPracticeStaff(saved.id, manager);
          this.log.log(
            `Seeded staff_customer_assignments for practice staff customerId=${saved.id}`,
          );
        }
        if (returnShallow) {
          return saved;
        }
        const primaryParam = this.getPrimaryParam(req.options);
        if (!primaryParam || isNil(saved[primaryParam as keyof Customer])) {
          return saved;
        }
        req.parsed.search = { [primaryParam]: saved[primaryParam as keyof Customer] as string };
        const reloaded = await manager.findOne(Customer, {
          where: { id: saved.id },
          relations: { plan: true },
        });
        if (!reloaded) {
          this.throwNotFoundException(this.alias);
        }
        return reloaded as Customer;
      },
      "CustomersService.createOne",
    );

    void this.bootstrapCustomerS3RootFiles(created.id).catch((err) => {
      this.log.error(
        `Customer S3 / files bootstrap failed for ${created.id}: ${err instanceof Error ? err.message : err}`,
      );
    });
    void this.notificationDispatch
      .dispatch("customer.created", {
        customerId: created.id,
        customerName: created.name,
      })
      .catch((err) => {
        this.log.warn(
          `customer.created notification failed: ${err instanceof Error ? err.message : err}`,
        );
      });
    return created;
  }

  /**
   * Ensures `accountStatus` is persisted on its own so staff can change **active → any**
   * (draft / inactive / proposed) without relying on generic CRUD merge behaviour.
   */
  override async updateOne(req: CrudRequest, dto: DeepPartial<Customer>): Promise<Customer> {
    const requested = dto.accountStatus;
    const dtoForSuper = { ...dto } as DeepPartial<Customer>;
    delete (dtoForSuper as { accountStatus?: unknown }).accountStatus;

    /**
     * The wizard autosave PATCHes the entire `onboardingData` blob and would clobber any
     * `signatures.{slot}.signature = "file:<uuid>"` written by the DocuSeal webhook in the
     * gap between the webhook firing and the frontend's poller resyncing. Pull the existing
     * onboardingData and preserve any non-empty signature whose incoming counterpart is empty.
     * See `preserveOnboardingSignatures` for the same guard applied to form-submission PATCHes.
     */
    if (
      dtoForSuper.onboardingData !== undefined &&
      dtoForSuper.onboardingData !== null &&
      typeof dtoForSuper.onboardingData === "object" &&
      !Array.isArray(dtoForSuper.onboardingData)
    ) {
      const existing = await this.getOneOrFail(req);
      const existingOnboarding =
        existing.onboardingData &&
        typeof existing.onboardingData === "object" &&
        !Array.isArray(existing.onboardingData)
          ? (existing.onboardingData as Record<string, unknown>)
          : null;
      dtoForSuper.onboardingData = preserveOnboardingSignatures(
        existingOnboarding,
        dtoForSuper.onboardingData as Record<string, unknown>,
      ) as DeepPartial<Customer>["onboardingData"];
    }

    const hasOtherPatchFields = Object.entries(dtoForSuper as Record<string, unknown>).some(
      ([, v]) => v !== undefined,
    );

    let updated: Customer;
    if (hasOtherPatchFields) {
      updated = await super.updateOne(req, dtoForSuper);
    } else {
      updated = await this.getOneOrFail(req);
    }

    if (requested !== undefined && requested !== null) {
      const allowed = Object.values(CustomerAccountStatus) as string[];
      if (!allowed.includes(String(requested))) {
        throw new BadRequestException("Invalid accountStatus");
      }
      await this.repo.update({ id: updated.id }, { accountStatus: requested });
      const reloaded = await this.repo.findOne({ where: { id: updated.id } });
      if (reloaded) updated = reloaded;
    }

    return updated;
  }

  /**
   * Soft-delete (archive) a customer. Only allowed when `account_status` is `draft`.
   */
  override async deleteOne(req: CrudRequest): Promise<void> {
    const customer = await this.getOneOrFail(req);
    if (customer.accountStatus !== CustomerAccountStatus.draft) {
      throw new BadRequestException(
        "Only draft customers can be archived. Active, inactive, or proposed customers cannot be deleted this way.",
      );
    }
    await this.dataSource.getRepository(StaffCustomerAssignmentEntity).delete({
      customerId: customer.id,
    });
    await this.repo.softDelete(customer.id);
  }

  private async bootstrapCustomerS3RootFiles(customerId: string): Promise<void> {
    await this.onboardingS3.bootstrapOnboardingPdfFilesOnly(customerId);
  }

  /**
   * Customer detail for `GET /customers/:id` — includes matrix `plan` and `portalUsers`
   * (`customer_users` + user without password hash + role).
   */
  private async loadCustomerDetailById(id: string): Promise<Customer | null> {
    return this.repo.findOne({
      where: { id },
      relations: {
        plan: true,
        customerUsers: {
          user: true,
          role: true,
        },
      },
    });
  }

  private async loadCustomerDetailByIdBypassingRls(id: string): Promise<Customer | null> {
    return this.dataSource.transaction(async (manager) => {
      // We manually enforce assignment below; this bypass only avoids RLS false negatives for manager views.
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      return manager.getRepository(Customer).findOne({
        where: { id },
        relations: {
          plan: true,
          customerUsers: {
            user: true,
            role: true,
          },
        },
      });
    });
  }

  private async hasStaffAssignment(staffUserId: string, customerId: string): Promise<boolean> {
    const rows = await this.repo.query(
      `
      SELECT 1
      FROM staff_customer_assignments
      WHERE staff_user_id = $1
        AND customer_id = $2
      LIMIT 1
      `,
      [staffUserId, customerId],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  async findOneDetailForApi(id: string, actor?: AuthUser): Promise<Record<string, unknown> | null> {
    let customer = await this.loadCustomerDetailById(id);
    if (!customer && actor && !actor.isAdmin && !actor.customerId) {
      const assigned = await this.hasStaffAssignment(actor.userId, id);
      if (assigned) {
        customer = await this.loadCustomerDetailByIdBypassingRls(id);
      }
    }
    if (!customer) return null;

    const portalUsers = (customer.customerUsers ?? []).map(customerUserPortalJson);
    const onboardingFormPdfDownloads = await this.onboardingS3.getOnboardingFormPdfDownloadsForAdminDetail(
      customer.id,
    );

    return {
      id: customer.id,
      name: customer.name,
      accountStatus: customer.accountStatus,
      onboardingData: customer.onboardingData,
      annualTurnoverGbp: customer.annualTurnoverGbp,
      planId: customer.planId,
      createdAt: toIso(customer.createdAt),
      updatedAt: toIso(customer.updatedAt),
      plan: customer.plan ? matrixPlanJson(customer.plan) : null,
      portalUsers,
      onboardingFormPdfDownloads,
    };
  }

  /**
   * Wide spreadsheet: row 1 = sorted flattened keys, row 2 = values (same detail shape as GET /customers/:id).
   */
  async exportCustomerFile(
    id: string,
    format: "csv" | "xlsx",
    columns?: string[] | null,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const detail = await this.findOneDetailForApi(id);
    if (!detail) {
      throw new NotFoundException("Customer not found");
    }
    const name = typeof detail.name === "string" ? detail.name : "customer";
    const base = exportFilenameBase(name, id);
    const flat = flattenCustomerExportPayload(detail);
    const explicit = columns?.length ? columns : null;
    const columnOrder = explicit ? resolveCustomerExportColumnOrder(flat, explicit) : undefined;
    if (explicit && (!columnOrder || columnOrder.length === 0)) {
      throw new BadRequestException("No valid columns selected for export.");
    }
    if (format === "xlsx") {
      const buffer = await buildCustomerExportXlsx(flat, columnOrder);
      return {
        buffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: `${base}.xlsx`,
      };
    }
    const buffer = buildCustomerExportCsv(flat, columnOrder);
    return {
      buffer,
      contentType: "text/csv; charset=utf-8",
      filename: `${base}.csv`,
    };
  }

  /**
   * Human headers + one data row for the selected summary column ids (wizard + customer fields).
   */
  async getCustomerSummaryExportRow(
    id: string,
    columns: string[],
  ): Promise<{ headers: string[]; values: string[] }> {
    const { customer, latest, columnIds } = await this.loadCustomerSummaryContext(id, columns);
    return buildCustomerSummaryExportRow(customer, latest, columnIds);
  }

  private async loadCustomerSummaryContext(
    id: string,
    columns: string[],
  ): Promise<{ customer: Customer; latest: LatestSubmissionExport; columnIds: string[]; customerName: string }> {
    const customer = await this.repo.findOne({
      where: { id },
      relations: {
        plan: true,
        customerUsers: { user: true },
      },
    });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    const latestEntity = await this.formSubmissions.findLatestByCustomerId(id);
    const latest: LatestSubmissionExport = latestEntity
      ? {
          status: latestEntity.status === CustomerFormSubmissionStatus.completed ? "completed" : "draft",
          data: (latestEntity.data ?? {}) as Record<string, unknown>,
        }
      : null;
    let columnIds = normalizeSummaryExportColumnIds(columns);
    if (columnIds.length === 0) {
      columnIds = defaultSummaryExportColumnIds();
    }
    if (columnIds.length === 0) {
      throw new BadRequestException("Select at least one valid export column.");
    }
    return { customer, latest, columnIds, customerName: customer.name ?? "customer" };
  }

  async exportCustomerSummaryFile(
    id: string,
    format: "csv" | "xlsx",
    columns: string[],
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const { customer, latest, columnIds, customerName } = await this.loadCustomerSummaryContext(id, columns);
    const { headers, values } = buildCustomerSummaryExportRow(customer, latest, columnIds);
    const base = exportFilenameBase(customerName, id);
    const filenameBase = `${base}_summary`;
    if (format === "xlsx") {
      const buffer = await buildTabularExportXlsx(headers, [values]);
      return {
        buffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: `${filenameBase}.xlsx`,
      };
    }
    const buffer = buildTabularExportCsv(headers, [values]);
    return {
      buffer,
      contentType: "text/csv; charset=utf-8",
      filename: `${filenameBase}.csv`,
    };
  }
}
