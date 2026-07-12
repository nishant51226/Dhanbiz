import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository } from "typeorm";
import type { AuthUser } from "../auth/auth.types.js";
import { Customer } from "../entities/customer.entity.js";
import {
  CustomerDocumentsExportJobEntity,
  CustomerDocumentsExportJobStatus,
} from "../entities/customer-documents-export-job.entity.js";
import type { CustomerDocumentsExportRequest } from "./dto/customer-documents-report.dto.js";
import { NotificationDispatchService } from "../notification/notification-dispatch.service.js";
import { QueueService } from "../queue/queue.service.js";
import { S3Service } from "../s3/s3.service.js";
import type { CustomerDocumentsReportDto } from "./dto/customer-documents-report.dto.js";
import { CustomerDocumentsReportService } from "./customer-documents-report.service.js";

function layoutLabel(layoutMode: string): string {
  if (layoutMode === "per_folder") return "Per folder";
  if (layoutMode === "per_date") return "Per date";
  if (layoutMode === "per_document") return "Per document";
  if (layoutMode === "invoice_register") return "Invoice register";
  if (layoutMode === "statement_register") return "Statement register";
  return layoutMode;
}

const LAYOUT_MODES = [
  "per_document",
  "per_folder",
  "per_date",
  "invoice_register",
  "statement_register",
] as const;

function normalizeLayoutMode(raw: unknown): (typeof LAYOUT_MODES)[number] | null {
  const value = typeof raw === "string" ? raw.trim() : "";
  return (LAYOUT_MODES as readonly string[]).includes(value) ? (value as (typeof LAYOUT_MODES)[number]) : null;
}

function reportDtoFromExportRow(row: CustomerDocumentsExportJobEntity): CustomerDocumentsReportDto {
  const req = row.request ?? {};
  const from = typeof req.from === "string" ? req.from.trim() : "";
  const to = typeof req.to === "string" ? req.to.trim() : "";
  if (!from || !to) {
    throw new BadRequestException("Export job request is missing from/to dates");
  }
  const layoutMode = normalizeLayoutMode(req.layoutMode);
  if (!layoutMode) {
    throw new BadRequestException(
      `Export job request has invalid layout mode (${JSON.stringify(req.layoutMode ?? null)})`,
    );
  }
  const scopedCustomerId = typeof row.customerId === "string" ? row.customerId.trim() : "";
  if (!scopedCustomerId) {
    throw new BadRequestException("Export job is missing customerId");
  }
  return {
    customerId: scopedCustomerId,
    from,
    to,
    layoutMode,
    dateBasis: req.dateBasis,
    documentIds: Array.isArray(req.documentIds)
      ? req.documentIds.map((id) => String(id).trim()).filter(Boolean)
      : undefined,
  };
}

@Injectable()
export class CustomerDocumentsExportJobService implements OnApplicationBootstrap {
  private readonly log = new Logger(CustomerDocumentsExportJobService.name);

  constructor(
    @InjectRepository(CustomerDocumentsExportJobEntity)
    private readonly exports: Repository<CustomerDocumentsExportJobEntity>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    private readonly report: CustomerDocumentsReportService,
    private readonly queue: QueueService,
    private readonly s3: S3Service,
    private readonly notifications: NotificationDispatchService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recoverStaleExports();
  }

  /** Re-run exports left queued after pg-boss finished, or retry stale layout-mode failures. */
  private async recoverStaleExports(): Promise<void> {
    const stuckWithoutBoss = await this.exports.find({
      where: {
        status: CustomerDocumentsExportJobStatus.queued,
        pgBossJobId: IsNull(),
      },
      select: { id: true },
    });
    for (const row of stuckWithoutBoss) {
      this.log.warn(`Recovering customer documents export ${row.id} (queued, no pg-boss id)`);
      await this.dispatchExport(row.id);
    }

    const zombies = await this.exports.find({
      where: {
        status: CustomerDocumentsExportJobStatus.queued,
        pgBossJobId: Not(IsNull()),
      },
      select: { id: true },
    });
    for (const row of zombies) {
      this.log.warn(`Re-running customer documents export ${row.id} (queued after pg-boss completed)`);
      void this.processExport(row.id).catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.error(`Recovery export ${row.id} failed: ${msg}`);
      });
    }

    const staleFailed = await this.exports
      .createQueryBuilder("e")
      .select(["e.id"])
      .where("e.status = :status", { status: CustomerDocumentsExportJobStatus.failed })
      .andWhere("e.error = :err", { err: "Export job request is missing layout mode" })
      .andWhere(`e.request->>'layoutMode' = 'invoice_register'`)
      .getMany();

    for (const row of staleFailed) {
      this.log.warn(`Retrying customer documents export ${row.id} (stale layout-mode failure)`);
      await this.exports.update(row.id, {
        status: CustomerDocumentsExportJobStatus.queued,
        error: null,
        completedAt: null,
        pgBossJobId: null,
      });
      await this.dispatchExport(row.id);
    }
  }

  private async dispatchExport(exportId: string): Promise<void> {
    let pgBossJobId: string | null = null;
    try {
      pgBossJobId = await this.queue.enqueueCustomerDocumentsExport(exportId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`pg-boss enqueue failed for export ${exportId}: ${msg}`);
    }
    if (pgBossJobId) {
      await this.exports.update(exportId, { pgBossJobId });
      return;
    }
    void this.processExport(exportId).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.error(`Inline customer documents export ${exportId} failed: ${msg}`);
    });
  }

  async queueExport(dto: CustomerDocumentsReportDto, actor: AuthUser): Promise<CustomerDocumentsExportJobEntity> {
    if (!actor?.userId) {
      throw new ForbiddenException("Authentication required");
    }

    const customerId = typeof dto.customerId === "string" ? dto.customerId.trim() : "";
    if (!customerId) {
      throw new BadRequestException("customerId is required");
    }
    const customer = await this.customers.findOne({ where: { id: customerId }, select: { id: true, name: true } });
    if (!customer) {
      throw new NotFoundException("Customer not found");
    }
    const customerName = customer.name?.trim() || "Customer";

    const request: CustomerDocumentsExportRequest = {
      from: dto.from,
      to: dto.to,
      layoutMode: dto.layoutMode,
      dateBasis: dto.dateBasis,
      customerName,
      documentIds:
        dto.documentIds && dto.documentIds.length > 0
          ? [...new Set(dto.documentIds.map((id) => id.trim()).filter(Boolean))]
          : undefined,
    };

    if (
      dto.layoutMode === "invoice_register" ||
      dto.layoutMode === "statement_register" ||
      dto.layoutMode === "per_document"
    ) {
      if (!request.documentIds?.length) {
        throw new BadRequestException("Select at least one document for this layout");
      }
    }

    const row = await this.exports.save(
      this.exports.create({
        customerId,
        requestedByUserId: actor.userId,
        status: CustomerDocumentsExportJobStatus.queued,
        request,
        s3Key: null,
        xlsxFileName: null,
        documentCount: 0,
        error: null,
        pgBossJobId: null,
        completedAt: null,
      }),
    );

    await this.dispatchExport(row.id);

    this.log.log(
      `Queued customer documents export ${row.id} customer=${customerId} user=${actor.userId} layout=${dto.layoutMode}`,
    );
    return this.getExportForUser(row.id, actor);
  }

  async getExportForUser(exportId: string, actor: AuthUser | undefined): Promise<CustomerDocumentsExportJobEntity> {
    const row = await this.exports.findOne({
      where: { id: exportId },
      relations: { customer: true },
    });
    if (!row) {
      throw new NotFoundException("Export not found");
    }
    if (!actor?.userId) {
      throw new ForbiddenException("Export not found");
    }
    if (!actor.isAdmin && row.requestedByUserId !== actor.userId) {
      throw new ForbiddenException("Export not found");
    }
    return row;
  }

  async getDownloadFile(
    exportId: string,
    actor: AuthUser | undefined,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const row = await this.getExportForUser(exportId, actor);
    if (row.status !== CustomerDocumentsExportJobStatus.completed || !row.s3Key?.trim()) {
      throw new BadRequestException("Export is not ready for download");
    }
    if (!this.s3.isBucketConfigured()) {
      throw new ServiceUnavailableException("S3 is not configured");
    }
    const buffer = await this.s3.getObjectBufferByKey(row.s3Key);
    const fileName = row.xlsxFileName?.trim() || "customer_documents.xlsx";
    return { buffer, fileName };
  }

  async processExport(exportId: string): Promise<void> {
    const row = await this.exports.findOne({
      where: { id: exportId },
      relations: { customer: true, requestedByUser: true },
    });
    if (!row) {
      this.log.warn(`Customer documents export ${exportId} not found`);
      return;
    }
    if (
      row.status !== CustomerDocumentsExportJobStatus.queued &&
      row.status !== CustomerDocumentsExportJobStatus.processing
    ) {
      return;
    }

    await this.exports.update(exportId, {
      status: CustomerDocumentsExportJobStatus.processing,
      error: null,
    });

    const customerName =
      row.request?.customerName?.trim() || row.customer?.name?.trim() || "Customer";
    const req = row.request ?? {};

    try {
      const dto = reportDtoFromExportRow(row);

      const { buffer, filename, documentCount } = await this.report.exportXlsx(dto);
      const xlsxFileName = filename.replace(/[^\w.\- ()[\]]+/g, "_").slice(0, 200) || "customer_documents.xlsx";
      const s3Key = `staff-customer-documents-exports/${row.requestedByUserId}/${row.id}/${xlsxFileName}`;

      if (!this.s3.isBucketConfigured()) {
        throw new ServiceUnavailableException("S3 is not configured");
      }

      await this.s3.putObjectByKey({
        fileKey: s3Key,
        body: buffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      await this.exports.update(exportId, {
        status: CustomerDocumentsExportJobStatus.completed,
        s3Key,
        xlsxFileName,
        documentCount,
        completedAt: new Date(),
        error: null,
      });

      await this.notifications.notifyUserInApp({
        userId: row.requestedByUserId,
        eventKey: "customer.documents.export.ready",
        title: `${customerName} Excel report ready`,
        body: "",
        data: {
          exportId: row.id,
          exportKind: "customer_documents",
          customerId: row.customerId,
          customerName,
          documentCount,
          xlsxFileName,
          from: req.from ?? "",
          to: req.to ?? "",
          layoutMode: req.layoutMode ?? "",
          layoutLabel: layoutLabel(req.layoutMode ?? ""),
        },
      });

      this.log.log(`Customer documents export ${exportId} completed (${documentCount} documents)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.exports.update(exportId, {
        status: CustomerDocumentsExportJobStatus.failed,
        error: msg,
        completedAt: new Date(),
      });

      await this.notifications.notifyUserInApp({
        userId: row.requestedByUserId,
        eventKey: "customer.documents.export.failed",
        title: `${customerName} Excel report failed`,
        body: msg,
        data: {
          exportId: row.id,
          exportKind: "customer_documents",
          customerId: row.customerId,
          customerName,
          from: req.from ?? "",
          to: req.to ?? "",
          layoutMode: req.layoutMode ?? "",
          layoutLabel: layoutLabel(req.layoutMode ?? ""),
        },
      });

      this.log.error(`Customer documents export ${exportId} failed: ${msg}`);
    }
  }
}
