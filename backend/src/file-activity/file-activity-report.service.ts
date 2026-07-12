import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { Brackets, DataSource, Repository, SelectQueryBuilder } from "typeorm";
import { runWithAdminRls } from "../tenant/run-with-tenant-rls.js";
import { LIBRARY_ACTIVITY_DOCUMENT_TYPES } from "./file-activity-log.service.js";
import { buildTabularExportCsv } from "../customers/customer-export.util.js";
import { Customer } from "../entities/customer.entity.js";
import { DocumentEntity } from "../entities/document.entity.js";
import {
  FileActivityAction,
  FileActivityLogEntity,
} from "../entities/file-activity-log.entity.js";
import { Job, JobStatus } from "../entities/job.entity.js";
import { UserEntity } from "../entities/user.entity.js";

export type FileActivityListQuery = {
  page?: number;
  limit?: number;
  customerId?: string;
  documentId?: string;
  fileId?: string;
  action?: FileActivityAction;
  from?: string;
  to?: string;
  search?: string;
};

const FILE_ACTIVITY_EXPORT_MAX_ROWS = 10_000;

type FileActivityRawRow = {
  id: string;
  createdAt: Date | string;
  customerId: string;
  customerName: string | null;
  documentId: string | null;
  fileId: string | null;
  jobId: string | null;
  action: FileActivityAction;
  summary: string;
  metadata: Record<string, unknown>;
  actorUserId: string | null;
  actorKind: string;
  actorEmail: string | null;
  documentName: string | null;
};

function toIsoTimestamp(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return "";
}

export type FileDocumentAccessActor = {
  displayName: string | null;
  actorKind: string;
  at: string;
};

export type FileDocumentAccessSummary = {
  /** First upload event for the document (original uploader). */
  uploadedBy: FileDocumentAccessActor | null;
  lastViewedBy: FileDocumentAccessActor | null;
  lastDownloadedBy: FileDocumentAccessActor | null;
};

export type FileActivityListItem = {
  id: string;
  createdAt: string;
  customerId: string;
  customerName: string | null;
  documentId: string | null;
  fileId: string | null;
  jobId: string | null;
  action: FileActivityAction;
  summary: string;
  metadata: Record<string, unknown>;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorKind: string;
  documentName: string | null;
};

@Injectable()
export class FileActivityReportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(FileActivityLogEntity)
    private readonly logs: Repository<FileActivityLogEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    @InjectRepository(Job)
    private readonly jobs: Repository<Job>,
  ) {}

  /** Latest viewed / downloaded actor per Files-library document (superadmin list enrichment). */
  async getLatestAccessByDocumentIds(
    documentIds: string[],
  ): Promise<Record<string, FileDocumentAccessSummary>> {
    const unique = [...new Set(documentIds.map((id) => id.trim()).filter(Boolean))];
    if (unique.length === 0) {
      return {};
    }

    type AccessRow = {
      documentId?: string;
      documentid?: string;
      createdAt?: Date | string;
      createdat?: Date | string;
      actorEmail?: string | null;
      actoremail?: string | null;
      actorKind?: string;
      actorkind?: string;
    };

    const accessRowDocumentId = (row: AccessRow): string =>
      (row.documentId ?? row.documentid ?? "").trim();

    const loadLatest = async (action: FileActivityAction): Promise<AccessRow[]> =>
      runWithAdminRls(this.dataSource, async (manager) =>
        manager.query(
          `
          SELECT DISTINCT ON (log.document_id)
            log.document_id AS "documentId",
            log.created_at AS "createdAt",
            u.email AS "actorEmail",
            log.actor_kind AS "actorKind"
          FROM file_activity_logs log
          LEFT JOIN users u ON u.id = log.actor_user_id
          WHERE log.document_id = ANY($1::uuid[])
            AND log.action = $2
          ORDER BY log.document_id, log.created_at DESC
          `,
          [unique, action],
        ),
      );

    const loadFirstUploaded = async (): Promise<AccessRow[]> =>
      runWithAdminRls(this.dataSource, async (manager) =>
        manager.query(
          `
          SELECT DISTINCT ON (log.document_id)
            log.document_id AS "documentId",
            log.created_at AS "createdAt",
            u.email AS "actorEmail",
            log.actor_kind AS "actorKind"
          FROM file_activity_logs log
          LEFT JOIN users u ON u.id = log.actor_user_id
          WHERE log.document_id = ANY($1::uuid[])
            AND log.action = $2
          ORDER BY log.document_id, log.created_at ASC
          `,
          [unique, FileActivityAction.uploaded],
        ),
      );

    const [uploadedRows, viewedRows, downloadedRows] = await Promise.all([
      loadFirstUploaded(),
      loadLatest(FileActivityAction.viewed),
      loadLatest(FileActivityAction.downloaded),
    ]);

    const toActor = (row: AccessRow): FileDocumentAccessActor => ({
      displayName: (row.actorEmail ?? row.actoremail)?.trim() || null,
      actorKind: row.actorKind ?? row.actorkind ?? "system",
      at: toIsoTimestamp(row.createdAt ?? row.createdat),
    });

    const result: Record<string, FileDocumentAccessSummary> = {};
    for (const id of unique) {
      result[id] = { uploadedBy: null, lastViewedBy: null, lastDownloadedBy: null };
    }
    for (const row of uploadedRows) {
      const id = accessRowDocumentId(row);
      const entry = result[id];
      if (entry) entry.uploadedBy = toActor(row);
    }
    for (const row of viewedRows) {
      const id = accessRowDocumentId(row);
      const entry = result[id];
      if (entry) entry.lastViewedBy = toActor(row);
    }
    for (const row of downloadedRows) {
      const id = accessRowDocumentId(row);
      const entry = result[id];
      if (entry) entry.lastDownloadedBy = toActor(row);
    }
    return result;
  }

  private createListQueryBuilder(): SelectQueryBuilder<FileActivityLogEntity> {
    return this.logs
      .createQueryBuilder("log")
      .leftJoin(Customer, "c", "c.id = log.customer_id")
      .leftJoin(DocumentEntity, "doc", "doc.id = log.document_id")
      .leftJoin(UserEntity, "u", "u.id = log.actor_user_id")
      .select([
        'log.id AS "id"',
        'log.created_at AS "createdAt"',
        'log.customer_id AS "customerId"',
        'c.name AS "customerName"',
        'log.document_id AS "documentId"',
        'log.file_id AS "fileId"',
        'log.job_id AS "jobId"',
        'log.action AS "action"',
        'log.summary AS "summary"',
        'log.metadata AS "metadata"',
        'log.actor_user_id AS "actorUserId"',
        'log.actor_kind AS "actorKind"',
        'u.email AS "actorEmail"',
        'doc.name AS "documentName"',
      ]);
  }

  private applyListFilters(
    qb: SelectQueryBuilder<FileActivityLogEntity>,
    query: FileActivityListQuery,
  ): void {
    if (query.customerId?.trim()) {
      qb.andWhere("log.customer_id = :customerId", { customerId: query.customerId.trim() });
    }
    if (query.documentId?.trim()) {
      qb.andWhere("log.document_id = :documentId", { documentId: query.documentId.trim() });
    }
    if (query.fileId?.trim()) {
      qb.andWhere("log.file_id = :fileId", { fileId: query.fileId.trim() });
    }
    if (query.action) {
      qb.andWhere("log.action = :action", { action: query.action });
    }
    if (query.from?.trim()) {
      qb.andWhere("log.created_at >= :from", { from: `${query.from.trim()}T00:00:00.000Z` });
    }
    if (query.to?.trim()) {
      qb.andWhere("log.created_at <= :to", { to: `${query.to.trim()}T23:59:59.999Z` });
    }
    if (query.search?.trim()) {
      const term = `%${query.search.trim().replace(/[%_]/g, "\\$&")}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where("doc.name ILIKE :term", { term })
            .orWhere("doc.original_name ILIKE :term", { term })
            .orWhere("log.summary ILIKE :term", { term });
        }),
      );
    }
  }

  private mapRawRow(r: FileActivityRawRow): FileActivityListItem {
    return {
      id: r.id,
      createdAt: toIsoTimestamp(r.createdAt),
      customerId: r.customerId,
      customerName: r.customerName,
      documentId: r.documentId,
      fileId: r.fileId,
      jobId: r.jobId,
      action: r.action,
      summary: r.summary,
      metadata: r.metadata ?? {},
      actorUserId: r.actorUserId,
      actorDisplayName: r.actorEmail,
      actorKind: r.actorKind,
      documentName: r.documentName,
    };
  }

  async list(query: FileActivityListQuery): Promise<{
    data: FileActivityListItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const qb = this.createListQueryBuilder();
    this.applyListFilters(qb, query);

    const countQb = qb.clone();
    const total = await countQb.getCount();
    const rows = await qb
      .orderBy("log.created_at", "DESC")
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<FileActivityRawRow>();

    return {
      data: rows.map((r) => this.mapRawRow(r)),
      total,
      page,
      limit,
    };
  }

  private buildCsvFromItems(items: FileActivityListItem[]): Buffer {
    const headers = [
      "Time (UTC)",
      "Customer",
      "File",
      "Action",
      "Summary",
      "Actor",
      "Actor kind",
      "Job ID",
      "Document ID",
      "File ID",
    ];
    const csvRows = items.map((row) => [
      row.createdAt,
      row.customerName ?? row.customerId,
      row.documentName ?? "",
      row.action,
      row.summary,
      row.actorDisplayName ?? "",
      row.actorKind,
      row.jobId ?? "",
      row.documentId ?? "",
      row.fileId ?? "",
    ]);
    return buildTabularExportCsv(headers, csvRows);
  }

  private fileNameSlug(name: string): string {
    const slug = name
      .trim()
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 48);
    return slug || "file";
  }

  async exportCsv(query: FileActivityListQuery): Promise<{ buffer: Buffer; fileName: string }> {
    const qb = this.createListQueryBuilder();
    this.applyListFilters(qb, query);
    const rows = await qb
      .orderBy("log.created_at", "DESC")
      .limit(FILE_ACTIVITY_EXPORT_MAX_ROWS)
      .getRawMany<FileActivityRawRow>();
    const items = rows.map((r) => this.mapRawRow(r));
    const dateSlug = new Date().toISOString().slice(0, 10);
    return {
      buffer: this.buildCsvFromItems(items),
      fileName: `file_activity_${dateSlug}.csv`,
    };
  }

  async exportDocumentCsv(
    documentId: string,
    query?: Pick<FileActivityListQuery, "action" | "from" | "to">,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const doc = await this.documents.findOne({ where: { id: documentId } });
    if (!doc || !LIBRARY_ACTIVITY_DOCUMENT_TYPES.has(doc.documentType)) {
      throw new NotFoundException("Files library document not found");
    }
    const qb = this.createListQueryBuilder();
    this.applyListFilters(qb, { documentId, ...query });
    const rows = await qb
      .orderBy("log.created_at", "ASC")
      .limit(FILE_ACTIVITY_EXPORT_MAX_ROWS)
      .getRawMany<FileActivityRawRow>();
    const items = rows.map((r) => this.mapRawRow(r));
    const dateSlug = new Date().toISOString().slice(0, 10);
    return {
      buffer: this.buildCsvFromItems(items),
      fileName: `file_activity_${this.fileNameSlug(doc.name)}_${dateSlug}.csv`,
    };
  }

  async documentTimeline(documentId: string): Promise<FileActivityListItem[]> {
    const doc = await this.documents.findOne({ where: { id: documentId } });
    if (!doc || !LIBRARY_ACTIVITY_DOCUMENT_TYPES.has(doc.documentType)) {
      throw new NotFoundException("Files library document not found");
    }
    const result = await this.list({ documentId, page: 1, limit: 500 });
    return result.data.reverse();
  }

  async documentSummary(documentId: string): Promise<{
    document: {
      id: string;
      name: string;
      customerId: string;
      fileId: string | null;
      createdAt: string;
    };
    customer: { id: string; name: string } | null;
    latestJob: {
      id: string;
      status: JobStatus;
      percentCompleted: number;
      updatedAt: string;
    } | null;
    eventCount: number;
  }> {
    const doc = await this.documents.findOne({ where: { id: documentId } });
    if (!doc || !LIBRARY_ACTIVITY_DOCUMENT_TYPES.has(doc.documentType)) {
      throw new NotFoundException("Files library document not found");
    }
    const meta = doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
    const fileId = typeof meta.fileId === "string" && meta.fileId.trim() ? meta.fileId.trim() : null;
    const customer = await this.customers.findOne({
      where: { id: doc.customerId },
      select: { id: true, name: true },
    });
    const latestJob = await this.jobs.findOne({
      where: { documentId: doc.id },
      order: { updatedAt: "DESC" },
    });
    const eventCount = await this.logs.count({ where: { documentId: doc.id } });
    return {
      document: {
        id: doc.id,
        name: doc.name,
        customerId: doc.customerId,
        fileId,
        createdAt: doc.createdAt.toISOString(),
      },
      customer: customer ? { id: customer.id, name: customer.name } : null,
      latestJob: latestJob
        ? {
            id: latestJob.id,
            status: latestJob.status,
            percentCompleted: latestJob.percentCompleted,
            updatedAt: latestJob.updatedAt.toISOString(),
          }
        : null,
      eventCount,
    };
  }
}
