import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { AuthUser } from "../auth/auth.types";
import { DOCUMENT_ASSIGNEE_PERMISSION } from "../auth/document-assignee.permission.js";
import {
  practiceStaffUsesAssignedDocumentScope,
} from "../auth/practice-staff-permission.util.js";
import { DataSource } from "typeorm";
import { Brackets, In, Repository } from "typeorm";
import { JobStatus, JobType } from "../entities/job.entity";
import { FilesService } from "../files/files.service";
import { JobExtractionRequeueService } from "../jobs/job-extraction-requeue.service";
import { QueueService } from "../queue/queue.service";
import { DocumentAssigneeEntity } from "../entities/document-assignee.entity";
import { DocumentEntity } from "../entities/document.entity";
import { Customer, CustomerAccountStatus } from "../entities/customer.entity";
import { FolderEntity, FolderLibraryKind } from "../entities/folder.entity";
import { FolderDefaultEntity } from "../entities/folder-default.entity";
import { applyLibraryFolderNameSearch } from "./library-folder-display.util";
import { Job } from "../entities/job.entity";
import { UserEntity } from "../entities/user.entity";
import { UserRoleEntity } from "../entities/user-role.entity";
import { FileActivityLogService, LIBRARY_ACTIVITY_DOCUMENT_TYPES } from "../file-activity/file-activity-log.service.js";
import {
  FileActivityReportService,
  type FileDocumentAccessSummary,
} from "../file-activity/file-activity-report.service.js";
import { FileActivityAction } from "../entities/file-activity-log.entity.js";
import { FileAssigneeNotificationService } from "../notification/file-assignee-notification.service";

const LIBRARY_UPLOAD_DATE_TZ = "Europe/London";

/** Calendar upload date (`YYYY-MM-DD` in Europe/London) for dashboard grouping and drill-down. */
function libraryUploadDateKeySql(docAlias = "doc"): string {
  const instant = `timezone('${LIBRARY_UPLOAD_DATE_TZ}', COALESCE(${docAlias}.uploaded_at, ${docAlias}.created_at))`;
  return `TO_CHAR(DATE(${instant}), 'YYYY-MM-DD')`;
}

export type DocumentsListQuery = {
  page: number;
  limit: number;
  sort: string;
  customerId?: string;
  libraryKind?: FolderLibraryKind;
  searchText?: string;
  /** When true, staff sees only documents where they are a library assignee (optional narrow filter). */
  assignedOnly?: boolean;
  /** ISO timestamp — include documents with `uploaded_at` on or after this instant. */
  uploadedAfter?: string;
  /** `YYYY-MM-DD` upload calendar day (Europe/London), matching dashboard grouping. */
  uploadDateKey?: string;
};

export type CustomerDocumentUploadDashboardQuery = {
  customerId?: string;
  libraryKind?: FolderLibraryKind;
  assignedOnly?: boolean;
  uploadedAfter?: string;
  uploadedBefore?: string;
  page?: number;
  limit?: number;
};

export type CustomerDocumentUploadDashboardResponse = {
  total: number;
  byCustomer: Array<{ customerId: string; customerName: string; count: number }>;
  byCustomerDate: Array<{
    customerId: string;
    customerName: string;
    uploadDateKey: string;
    count: number;
  }>;
  byCustomerDateTotal: number;
  byCustomerDatePage: number;
  byCustomerDatePageCount: number;
  byCustomerDateLimit: number;
  byLibraryKind: Array<{ libraryKind: string; count: number }>;
};

export type LibraryDateBrowseLevel = "years" | "months" | "days" | "dates" | "customers" | "folders" | "documents";

export type LibraryDateBrowseQuery = {
  level: LibraryDateBrowseLevel;
  page: number;
  limit: number;
  year?: number;
  /** Calendar month 1–12 (January = 1). */
  month?: number;
  day?: number;
  /** Folder view: exact calendar date (YYYY-MM-DD) matching `level=dates` rows. */
  dateKey?: string;
  customerId?: string;
  folderId?: string;
  libraryKind?: FolderLibraryKind;
  searchText?: string;
  assignedOnly?: boolean;
  /** Folder view: group/filter by upload date instead of document date. */
  dateBasis?: "effective" | "uploaded";
};

@Injectable()
export class DocumentsAdminService {
  private readonly log = new Logger(DocumentsAdminService.name);

  constructor(
    @InjectRepository(DocumentEntity) private readonly docs: Repository<DocumentEntity>,
    @InjectRepository(FolderEntity) private readonly folders: Repository<FolderEntity>,
    @InjectRepository(FolderDefaultEntity) private readonly folderDefaults: Repository<FolderDefaultEntity>,
    @InjectRepository(DocumentAssigneeEntity) private readonly assignees: Repository<DocumentAssigneeEntity>,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity) private readonly userRoles: Repository<UserRoleEntity>,
    private readonly dataSource: DataSource,
    private readonly queue: QueueService,
    private readonly files: FilesService,
    private readonly extractionRequeue: JobExtractionRequeueService,
    private readonly fileActivity: FileActivityLogService,
    private readonly fileActivityReport: FileActivityReportService,
    private readonly fileAssigneeNotifications: FileAssigneeNotificationService,
  ) {}

  /** Batch lookup for list UI (also exposed at GET /documents/file-access/latest). */
  async getLatestFileAccessForList(
    documentIds: string[],
    actor?: AuthUser,
  ): Promise<Record<string, FileDocumentAccessSummary>> {
    if (actor?.customerId) {
      return {};
    }
    const unique = [...new Set(documentIds.map((id) => id.trim()).filter(Boolean))];
    if (unique.length === 0) {
      return {};
    }
    return this.fileActivityReport.getLatestAccessByDocumentIds(unique);
  }

  private async enrichListWithFileAccess<T extends { id: string; documentType: string }>(
    rows: T[],
    actor?: AuthUser,
  ): Promise<Array<T & { fileAccess?: FileDocumentAccessSummary }>> {
    if (actor?.customerId) {
      return rows;
    }
    const fileDocIds = rows
      .filter((d) => LIBRARY_ACTIVITY_DOCUMENT_TYPES.has(d.documentType))
      .map((d) => d.id);
    if (fileDocIds.length === 0) {
      return rows;
    }
    const accessById = await this.fileActivityReport.getLatestAccessByDocumentIds(fileDocIds);
    return rows.map((row) =>
      LIBRARY_ACTIVITY_DOCUMENT_TYPES.has(row.documentType)
        ? { ...row, fileAccess: accessById[row.id] ?? { uploadedBy: null, lastViewedBy: null, lastDownloadedBy: null } }
        : row,
    );
  }

  /** Soft-delete library document, its jobs, and any linked drive `files` row. */
  async softDeleteDocument(documentId: string, actor?: AuthUser): Promise<{ deleted: true }> {
    const doc = await this.getOne(documentId, actor);

    const jobs = await this.jobs.find({ where: { documentId: doc.id } });
    for (const job of jobs) {
      if (job.status === JobStatus.queued || job.status === JobStatus.processing) {
        try {
          await this.queue.cancelJob(job.id);
        } catch {
          /* already terminal */
        }
      }
    }
    if (jobs.length > 0) {
      await this.jobs.softDelete({ id: In(jobs.map((j) => j.id)) });
    }

    const meta = doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
    const linkedFileId = typeof meta.fileId === "string" ? meta.fileId.trim() : "";
    if (linkedFileId) {
      await this.files.softDeleteById(linkedFileId);
    }

    this.fileActivity.recordForDocument(
      doc,
      FileActivityAction.deleted,
      `Deleted ${doc.name}`,
      actor,
      { fileId: linkedFileId || null },
    );

    await this.docs.softDelete(doc.id);
    return { deleted: true };
  }

  /** Soft-delete multiple library documents; continues on individual failures. */
  async softDeleteDocuments(
    documentIds: string[],
    actor?: AuthUser,
  ): Promise<{ deleted: number; failed: { id: string; error: string }[] }> {
    const unique = [...new Set(documentIds.map((id) => id.trim()).filter(Boolean))];
    if (unique.length === 0) {
      throw new BadRequestException("At least one document id is required");
    }
    if (unique.length > 100) {
      throw new BadRequestException("Maximum 100 documents per bulk delete");
    }
    const failed: { id: string; error: string }[] = [];
    let deleted = 0;
    for (const id of unique) {
      try {
        await this.softDeleteDocument(id, actor);
        deleted += 1;
      } catch (err) {
        failed.push({ id, error: err instanceof Error ? err.message : String(err) });
      }
    }
    if (deleted === 0 && failed.length > 0) {
      throw new BadRequestException(failed[0]!.error);
    }
    return { deleted, failed };
  }

  /** Soft-delete a library folder when it has no documents and no child folders. */
  async softDeleteLibraryFolder(folderId: string, actor?: AuthUser): Promise<{ deleted: true }> {
    const fid = folderId.trim();
    const folder = await this.folders.findOne({ where: { id: fid } });
    if (!folder) {
      throw new NotFoundException("Folder not found");
    }

    const portalCid = actor?.customerId?.trim();
    if (portalCid) {
      const folderCustomerId = folder.customerId?.trim() || null;
      if (folder.isGlobal) {
        throw new ForbiddenException("Portal users cannot delete global folders");
      }
      if (folderCustomerId && folderCustomerId !== portalCid) {
        throw new NotFoundException("Folder not found");
      }
    }

    const documentCount = await this.docs.count({ where: { folderId: fid } });
    if (documentCount > 0) {
      throw new ConflictException(
        `This folder still has ${documentCount} file${documentCount === 1 ? "" : "s"}. Delete all files in this folder first, then you can delete the folder.`,
      );
    }

    const childFolderCount = await this.folders.count({ where: { parentId: fid } });
    if (childFolderCount > 0) {
      throw new ConflictException(
        `This folder has ${childFolderCount} subfolder${childFolderCount === 1 ? "" : "s"}. Remove or delete subfolders first.`,
      );
    }

    await this.folderDefaults.delete({ folderId: fid });
    await this.folders.softDelete(fid);
    return { deleted: true };
  }

  /**
   * Assignee-only staff (`document:assignee` without customer read/write) see assigned library docs only.
   * Managers and staff with customer read/write keep normal customer RLS across assigned customers.
   */
  private async shouldUseAssignedDocumentScope(actor?: AuthUser): Promise<boolean> {
    if (!actor || actor.isAdmin || actor.customerId) return false;
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      return practiceStaffUsesAssignedDocumentScope(manager, actor.userId);
    });
  }

  async list(q: DocumentsListQuery, actor?: AuthUser): Promise<{
    data: ReturnType<DocumentsAdminService["toDocumentListRow"]>[];
    total: number;
    page: number;
    pageCount: number;
    limit: number;
  }> {
    const page = Math.max(1, q.page);
    const limit = Math.min(200, Math.max(1, q.limit));
    const skip = (page - 1) * limit;
    const portalCid = actor?.customerId?.trim();
    const requestedCid = q.customerId?.trim();
    let customerIdFilter = requestedCid;
    if (portalCid) {
      if (requestedCid && requestedCid !== portalCid) {
        throw new ForbiddenException("Cannot query another customer's documents");
      }
      customerIdFilter = portalCid;
    }
    const accountantScoped = await this.shouldUseAssignedDocumentScope(actor);
    if (actor) {
      this.log.log(
        `[documents.list] user=${actor.userId} isAdmin=${actor.isAdmin} customerId=${actor.customerId ?? "null"} assignedScope=${accountantScoped} assignedOnly=${q.assignedOnly === true} page=${page} limit=${limit}`,
      );
    }

    if (accountantScoped) {
      const { rows, total } = await this.dataSource.transaction(async (manager) => {
        await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
        await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
        await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
        const qb = manager
          .getRepository(DocumentEntity)
          .createQueryBuilder("doc")
          .leftJoinAndSelect("doc.folder", "folder")
          .leftJoinAndSelect("doc.customer", "docCustomer")
          .leftJoinAndSelect("folder.customer", "customer")
          .innerJoin("document_assignees", "da", "da.document_id = doc.id AND da.user_id = :uid", {
            uid: actor!.userId,
          });

        if (customerIdFilter) {
          qb.andWhere("(doc.customer_id = :cid OR folder.customer_id = :cid)", { cid: customerIdFilter });
        }
        if (q.libraryKind) {
          qb.andWhere("folder.type = :lib", { lib: q.libraryKind });
        }
        qb.andWhere("doc.deleted_at IS NULL");
        const term = q.searchText?.trim();
        if (term) {
          qb.andWhere(
            new Brackets((sub) => {
              sub
                .where("STRPOS(LOWER(COALESCE(doc.name, '')), LOWER(:searchTerm)) > 0", { searchTerm: term })
                .orWhere("STRPOS(LOWER(COALESCE(customer.name, '')), LOWER(:searchTerm)) > 0", { searchTerm: term })
                .orWhere("STRPOS(LOWER(COALESCE(folder.name, '')), LOWER(:searchTerm)) > 0", { searchTerm: term });
            }),
          );
        }
        const uploadedAfter = this.parseUploadedAfter(q.uploadedAfter);
        if (uploadedAfter) {
          qb.andWhere("doc.uploaded_at >= :uploadedAfter", { uploadedAfter });
        }
        const uploadDateKey = this.parseUploadDateKey(q.uploadDateKey);
        if (uploadDateKey) {
          this.applyUploadDateKeyFilter(qb, uploadDateKey);
        }
        const sort = this.parseSort(q.sort);
        qb.orderBy(sort.expr, sort.order).addOrderBy("doc.id", "ASC");
        qb.skip(skip).take(limit);
        const [rows, total] = await qb.getManyAndCount();
        return { rows, total };
      });
      const data = rows.map((doc) => this.toDocumentListRow(doc));
      return {
        data: await this.enrichListWithFileAccess(data, actor),
        total,
        page,
        limit,
        pageCount: Math.max(1, Math.ceil(total / limit)),
      };
    }

    const qb = this.docs
      .createQueryBuilder("doc")
      .leftJoinAndSelect("doc.folder", "folder")
      .leftJoinAndSelect("doc.customer", "docCustomer")
      .leftJoinAndSelect("folder.customer", "customer");

    const staffAssignedOnly =
      q.assignedOnly === true &&
      !!actor &&
      Boolean(actor.userId?.trim()) &&
      !actor.isAdmin;
    if (staffAssignedOnly) {
      // EXISTS keeps filtering correct for getManyAndCount() (joins can be mishandled on the count query).
      qb.andWhere(
        `EXISTS (SELECT 1 FROM document_assignees das WHERE das.document_id = doc.id AND das.user_id = :assignScopeUid)`,
        { assignScopeUid: actor.userId },
      );
    }

    if (customerIdFilter) {
      qb.andWhere("(doc.customer_id = :cid OR folder.customer_id = :cid)", { cid: customerIdFilter });
    }
    if (q.libraryKind) {
      qb.andWhere("folder.type = :lib", { lib: q.libraryKind });
    }
    qb.andWhere("doc.deleted_at IS NULL");
    const term = q.searchText?.trim();
    if (term) {
      // Substring match without ILIKE wildcards / ESCAPE (avoids PostgreSQL "invalid escape string").
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where("STRPOS(LOWER(COALESCE(doc.name, '')), LOWER(:searchTerm)) > 0", { searchTerm: term })
            .orWhere("STRPOS(LOWER(COALESCE(customer.name, '')), LOWER(:searchTerm)) > 0", { searchTerm: term })
            .orWhere("STRPOS(LOWER(COALESCE(folder.name, '')), LOWER(:searchTerm)) > 0", { searchTerm: term });
        })
      );
    }
    const uploadedAfter = this.parseUploadedAfter(q.uploadedAfter);
    if (uploadedAfter) {
      qb.andWhere("doc.uploaded_at >= :uploadedAfter", { uploadedAfter });
    }
    const uploadDateKey = this.parseUploadDateKey(q.uploadDateKey);
    if (uploadDateKey) {
      this.applyUploadDateKeyFilter(qb, uploadDateKey);
    }

    const sort = this.parseSort(q.sort);
    qb.orderBy(sort.expr, sort.order).addOrderBy("doc.id", "ASC");
    qb.skip(skip).take(limit);

    const [rows, total] = await qb.getManyAndCount();

    const data = rows.map((doc) => this.toDocumentListRow(doc));
    return {
      data: await this.enrichListWithFileAccess(data, actor),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Active customers visible for Files library filters (`file:read` only — no `customer:read`).
   * Superadmin: all active customers. Practice staff: `staff_customer_assignments`.
   * Legacy assignee-only staff: customers with assigned library documents.
   */
  async listLibraryCustomerFilterOptions(
    actor: AuthUser | undefined,
    query?: { page?: number; limit?: number; searchText?: string },
  ): Promise<{
    data: Array<{ id: string; name: string }>;
    total: number;
    page: number;
    limit: number;
    pageCount: number;
  }> {
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.min(500, Math.max(1, query?.limit ?? 500));
    const skip = (page - 1) * limit;
    const search = query?.searchText?.trim() ?? "";

    if (!actor?.userId?.trim()) {
      return { data: [], total: 0, page, limit, pageCount: 1 };
    }

    const portalCid = actor.customerId?.trim();
    if (portalCid) {
      const rows = await this.queryLibraryFilterCustomers({
        scope: "ids",
        customerIds: [portalCid],
        search,
        skip,
        limit,
      });
      return {
        data: rows.items,
        total: rows.total,
        page,
        limit,
        pageCount: Math.max(1, Math.ceil(rows.total / limit)),
      };
    }

    if (actor.isAdmin) {
      const rows = await this.queryLibraryFilterCustomers({ scope: "all", search, skip, limit });
      return {
        data: rows.items,
        total: rows.total,
        page,
        limit,
        pageCount: Math.max(1, Math.ceil(rows.total / limit)),
      };
    }

    const assigneeOnlyScope = await this.shouldUseAssignedDocumentScope(actor);
    if (assigneeOnlyScope) {
      const rows = await this.queryLibraryFilterCustomers({
        scope: "document_assignees",
        staffUserId: actor.userId,
        search,
        skip,
        limit,
      });
      return {
        data: rows.items,
        total: rows.total,
        page,
        limit,
        pageCount: Math.max(1, Math.ceil(rows.total / limit)),
      };
    }

    const assignedIds = await this.staffAssignedCustomerIds(actor.userId);
    if (assignedIds.length === 0) {
      return { data: [], total: 0, page, limit, pageCount: 1 };
    }
    const rows = await this.queryLibraryFilterCustomers({
      scope: "ids",
      customerIds: assignedIds,
      search,
      skip,
      limit,
    });
    return {
      data: rows.items,
      total: rows.total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(rows.total / limit)),
    };
  }

  private async staffAssignedCustomerIds(staffUserId: string): Promise<string[]> {
    const rows = (await this.withAdminRls((manager) =>
      manager.query(
        `
        SELECT customer_id AS "customerId"
        FROM staff_customer_assignments
        WHERE staff_user_id = $1
        `,
        [staffUserId],
      ),
    )) as Array<{ customerId: string }>;
    return [...new Set(rows.map((r) => String(r.customerId ?? "").trim()).filter(Boolean))];
  }

  private async withAdminRls<T>(fn: (manager: DataSource["manager"]) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      return fn(manager);
    });
  }

  private async queryLibraryFilterCustomers(params: {
    scope: "all" | "ids" | "document_assignees";
    customerIds?: string[];
    staffUserId?: string;
    search: string;
    skip: number;
    limit: number;
  }): Promise<{ items: Array<{ id: string; name: string }>; total: number }> {
    return this.withAdminRls(async (manager) => {
      const repo = manager.getRepository(Customer);
      const qb = repo
        .createQueryBuilder("c")
        .select(["c.id", "c.name"])
        .where("c.account_status = :active", { active: CustomerAccountStatus.active });

      if (params.scope === "ids") {
        const ids = [...new Set((params.customerIds ?? []).map((id) => id.trim()).filter(Boolean))];
        if (ids.length === 0) return { items: [], total: 0 };
        qb.andWhere("c.id IN (:...ids)", { ids });
      } else if (params.scope === "document_assignees") {
        const uid = params.staffUserId?.trim();
        if (!uid) return { items: [], total: 0 };
        qb.innerJoin("documents", "doc", "doc.customer_id = c.id AND doc.deleted_at IS NULL").innerJoin(
          "document_assignees",
          "da",
          "da.document_id = doc.id AND da.user_id = :assignUid",
          { assignUid: uid },
        );
      }

      if (params.search) {
        qb.andWhere("c.name ILIKE :search", { search: `%${params.search.replace(/[%_\\]/g, "\\$&")}%` });
      }

      if (params.scope === "document_assignees") {
        qb.distinct(true);
      }

      qb.orderBy("c.name", "ASC").addOrderBy("c.id", "ASC");
      const total = await qb.clone().getCount();
      const rows = await qb.skip(params.skip).take(params.limit).getMany();
      return {
        items: rows.map((c) => ({ id: c.id, name: c.name })),
        total,
      };
    });
  }

  /** Library browse: document counts per customer (respects type / assigned filters). */
  async countLibraryDocumentsByCustomerIds(
    customerIds: string[],
    opts: { libraryKind?: FolderLibraryKind; assignedOnly?: boolean },
    actor?: AuthUser,
  ): Promise<Record<string, number>> {
    const unique = [...new Set(customerIds.map((id) => id.trim()).filter(Boolean))];
    const out: Record<string, number> = Object.fromEntries(unique.map((id) => [id, 0]));
    if (unique.length === 0) return out;
    if (unique.length > 100) {
      throw new BadRequestException("Maximum 100 customer ids per request");
    }

    const accountantScoped = await this.shouldUseAssignedDocumentScope(actor);
    const qb = this.docs
      .createQueryBuilder("doc")
      .leftJoin("doc.folder", "folder")
      .select("doc.customer_id", "customerId")
      .addSelect("COUNT(*)", "count")
      .where("doc.customer_id IN (:...customerIds)", { customerIds: unique })
      .groupBy("doc.customer_id");

    if (opts.libraryKind) {
      qb.andWhere("folder.type = :lib", { lib: opts.libraryKind });
    }
    if (accountantScoped && actor?.userId) {
      qb.innerJoin("document_assignees", "da", "da.document_id = doc.id AND da.user_id = :assignUid", {
        assignUid: actor.userId,
      });
    } else {
      const staffAssignedOnly =
        opts.assignedOnly === true && !!actor?.userId?.trim() && !actor.isAdmin && !actor.customerId;
      if (staffAssignedOnly) {
        qb.andWhere(
          `EXISTS (SELECT 1 FROM document_assignees das WHERE das.document_id = doc.id AND das.user_id = :assignScopeUid)`,
          { assignScopeUid: actor!.userId },
        );
      }
    }

    const rows = await qb.getRawMany<{ customerId: string; count: string }>();
    for (const row of rows) {
      const id = String(row.customerId ?? "").trim();
      if (id) out[id] = Number(row.count ?? 0);
    }
    return out;
  }

  /**
   * Staff dashboard: document upload counts by customer and library type (upload time, not document date).
   */
  async getCustomerDocumentUploadDashboard(
    q: CustomerDocumentUploadDashboardQuery,
    actor?: AuthUser,
  ): Promise<CustomerDocumentUploadDashboardResponse> {
    const portalCid = actor?.customerId?.trim();
    const requestedCid = q.customerId?.trim();
    let customerIdFilter = requestedCid;
    if (portalCid) {
      if (requestedCid && requestedCid !== portalCid) {
        throw new ForbiddenException("Cannot query another customer's documents");
      }
      customerIdFilter = portalCid;
    }

    const accountantScoped = await this.shouldUseAssignedDocumentScope(actor);
    const uploadedAfter = this.parseUploadedAfter(q.uploadedAfter);
    const uploadedBefore = this.parseUploadedBefore(q.uploadedBefore);
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));
    const skip = (page - 1) * limit;

    const run = async (docs: Repository<DocumentEntity>, assignedJoin: boolean) => {
      const base = () => {
        const qb = docs
          .createQueryBuilder("doc")
          .leftJoin("doc.folder", "folder")
          .leftJoin("folder.customer", "customer")
          .leftJoin("doc.customer", "docCustomer")
          .where("doc.deleted_at IS NULL");

        if (assignedJoin && actor?.userId) {
          qb.innerJoin("document_assignees", "da", "da.document_id = doc.id AND da.user_id = :dashAssignUid", {
            dashAssignUid: actor.userId,
          });
        } else {
          const staffAssignedOnly =
            q.assignedOnly === true && !!actor?.userId?.trim() && !actor.isAdmin && !actor.customerId;
          if (staffAssignedOnly) {
            qb.andWhere(
              `EXISTS (SELECT 1 FROM document_assignees das WHERE das.document_id = doc.id AND das.user_id = :dashScopeUid)`,
              { dashScopeUid: actor!.userId },
            );
          }
        }

        if (customerIdFilter) {
          qb.andWhere("(doc.customer_id = :dashCid OR folder.customer_id = :dashCid)", { dashCid: customerIdFilter });
        }
        if (q.libraryKind) {
          qb.andWhere("folder.type = :dashLib", { dashLib: q.libraryKind });
        }
        if (uploadedAfter) {
          qb.andWhere("doc.uploaded_at >= :dashUploadedAfter", { dashUploadedAfter: uploadedAfter });
        }
        if (uploadedBefore) {
          qb.andWhere("doc.uploaded_at <= :dashUploadedBefore", { dashUploadedBefore: uploadedBefore });
        }
        return qb;
      };

      const totalRow = await base().select("COUNT(*)", "cnt").getRawOne<{ cnt: string }>();
      const total = Number(totalRow?.cnt ?? 0);

      const customerRows = await base()
        .select("COALESCE(doc.customer_id, folder.customer_id)", "customerId")
        .addSelect("MAX(COALESCE(docCustomer.name, customer.name))", "customerName")
        .addSelect("COUNT(*)", "count")
        .groupBy("COALESCE(doc.customer_id, folder.customer_id)")
        .orderBy("COUNT(*)", "DESC")
        .addOrderBy("MAX(COALESCE(docCustomer.name, customer.name))", "ASC")
        .getRawMany<{ customerId: string; customerName: string; count: string }>();

      const uploadDateKeyExpr = libraryUploadDateKeySql("doc");
      const customerIdExpr = "COALESCE(doc.customer_id, folder.customer_id)";
      const buildGroupedByCustomerDate = () =>
        base()
          .select(customerIdExpr, "customerId")
          .addSelect("MAX(COALESCE(docCustomer.name, customer.name))", "customerName")
          .addSelect(`${uploadDateKeyExpr}`, "uploadDateKey")
          .addSelect("COUNT(*)", "count")
          .groupBy(customerIdExpr)
          .addGroupBy(uploadDateKeyExpr);

      const groupedForCount = buildGroupedByCustomerDate();
      const [groupedSql, groupedParams] = groupedForCount.getQueryAndParameters();
      const countRows = await docs.manager.query<Array<{ cnt: string }>>(
        `SELECT COUNT(*)::text AS cnt FROM (${groupedSql}) grouped_rows`,
        groupedParams,
      );
      const byCustomerDateTotal = Number(countRows[0]?.cnt ?? 0);
      const byCustomerDatePageCount = Math.max(1, Math.ceil(byCustomerDateTotal / limit));

      const customerDateRows = await buildGroupedByCustomerDate()
        .orderBy(`${uploadDateKeyExpr}`, "DESC")
        .addOrderBy("MAX(COALESCE(docCustomer.name, customer.name))", "ASC")
        .offset(skip)
        .limit(limit)
        .getRawMany<{ customerId: string; customerName: string; uploadDateKey: string; count: string }>();

      return {
        total,
        byCustomer: customerRows
          .map((r) => ({
            customerId: String(r.customerId ?? "").trim(),
            customerName: String(r.customerName ?? "Unknown").trim() || "Unknown",
            count: Number(r.count ?? 0),
          }))
          .filter((r) => r.customerId),
        byCustomerDate: customerDateRows
          .map((r) => ({
            customerId: String(r.customerId ?? "").trim(),
            customerName: String(r.customerName ?? "Unknown").trim() || "Unknown",
            uploadDateKey: this.normalizeUploadDateKey(r.uploadDateKey),
            count: Number(r.count ?? 0),
          }))
          .filter((r) => r.customerId && r.uploadDateKey),
        byCustomerDateTotal,
        byCustomerDatePage: page,
        byCustomerDatePageCount,
        byCustomerDateLimit: limit,
        byLibraryKind: [],
      };
    };

    if (accountantScoped) {
      return this.dataSource.transaction(async (manager) => {
        await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
        await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
        await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
        return run(manager.getRepository(DocumentEntity), true);
      });
    }
    return run(this.docs, false);
  }

  /** Plain JSON for list UIs — avoids TypeORM circular refs / lazy-load surprises on serialize. */
  private toDocumentListRow(doc: DocumentEntity) {
    const folder = doc.folder;
    const docCustomer = doc.customer;
    return {
      id: doc.id,
      folderId: doc.folderId,
      customerId: doc.customerId,
      supplierId: doc.supplierId ?? null,
      documentType: doc.documentType,
      name: doc.name,
      originalName: doc.originalName ?? null,
      fileUrl: doc.fileUrl,
      s3Key: doc.s3Key ?? null,
      mimeType: doc.mimeType ?? null,
      extension: doc.extension ?? null,
      sizeBytes: doc.sizeBytes ?? null,
      documentDate: doc.documentDate ?? null,
      uploadedAt: doc.uploadedAt,
      createdAt: doc.createdAt,
      metadata: doc.metadata ?? {},
      customer: docCustomer ? { id: docCustomer.id, name: docCustomer.name } : undefined,
      folder: folder
        ? {
            id: folder.id,
            name: folder.name,
            type: folder.type,
            customerId: folder.customerId,
            customer: folder.customer ? { id: folder.customer.id, name: folder.customer.name } : undefined,
          }
        : undefined,
    };
  }

  async getOne(id: string, actor?: AuthUser): Promise<DocumentEntity> {
    const assignedScope = await this.shouldUseAssignedDocumentScope(actor);
    if (actor) {
      this.log.log(
        `[documents.getOne] user=${actor.userId} doc=${id} isAdmin=${actor.isAdmin} customerId=${actor.customerId ?? "null"} assignedScope=${assignedScope}`,
      );
    }
    if (assignedScope) {
      const row = await this.dataSource.transaction(async (manager) => {
        await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
        await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
        await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
        return manager
          .getRepository(DocumentEntity)
          .createQueryBuilder("doc")
          .leftJoinAndSelect("doc.folder", "folder")
          .leftJoinAndSelect("folder.customer", "customer")
          .innerJoin("document_assignees", "da", "da.document_id = doc.id AND da.user_id = :uid", {
            uid: actor!.userId,
          })
          .where("doc.id = :id", { id })
          .getOne();
      });
      if (!row) {
        this.log.warn(
          `[documents.getOne] assigned-scope miss user=${actor?.userId ?? "anon"} doc=${id}`,
        );
        throw new NotFoundException("Document not found");
      }
      return row;
    }

    const qb = this.docs
      .createQueryBuilder("doc")
      .leftJoinAndSelect("doc.folder", "folder")
      .leftJoinAndSelect("folder.customer", "customer")
      .where("doc.id = :id", { id });
    const row = await qb.getOne();
    if (!row) {
      this.log.warn(`[documents.getOne] default-scope miss user=${actor?.userId ?? "anon"} doc=${id}`);
      throw new NotFoundException("Document not found");
    }
    const portalCid = actor?.customerId?.trim();
    const effectiveCustomerId = row.customerId ?? row.folder?.customerId ?? null;
    if (portalCid && effectiveCustomerId && effectiveCustomerId !== portalCid) {
      throw new NotFoundException("Document not found");
    }
    return row;
  }

  /**
   * Re-run extraction for an existing library document without re-uploading.
   * Reuses the latest extraction job when one exists; otherwise creates a new job row.
   */
  async requeueExtractionForDocument(documentId: string, actor?: AuthUser): Promise<Job> {
    const doc = await this.getOne(documentId, actor);
    const customerId = doc.customerId ?? doc.folder?.customerId ?? null;
    if (!customerId) {
      throw new BadRequestException("Document has no customer scope");
    }

    const existing = await this.jobs.findOne({
      where: { documentId: doc.id, type: JobType.extraction },
      order: { createdAt: "DESC" },
    });
    if (existing) {
      return this.extractionRequeue.requeue(existing.id);
    }

    const jobRow = this.jobs.create({
      customerId,
      documentId: doc.id,
      fileId: null,
      type: JobType.extraction,
      status: JobStatus.queued,
      percentCompleted: 0,
    });
    const savedJob = await this.jobs.save(jobRow);

    let pgBossJobId: string;
    try {
      pgBossJobId = await this.queue.enqueueExtraction(savedJob.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.jobs.update(savedJob.id, {
        status: JobStatus.failed,
        error: `Queue failed: ${msg}`,
      });
      throw new ServiceUnavailableException(`Queue failed: ${msg}`);
    }
    await this.jobs.update(savedJob.id, { pgBossJobId });

    const reloaded = await this.jobs.findOne({
      where: { id: savedJob.id },
      relations: { customer: true, file: true, document: true },
      relationLoadStrategy: "query",
    });
    if (!reloaded) {
      throw new NotFoundException("job not found");
    }
    return reloaded;
  }

  /** Jobs linked to this portal document (newest first). */
  async jobsForDocument(documentId: string, actor?: AuthUser): Promise<Job[]> {
    const accountantScoped = await this.shouldUseAssignedDocumentScope(actor);
    if (actor) {
      this.log.log(
        `[documents.jobsForDocument] user=${actor.userId} doc=${documentId} isAdmin=${actor.isAdmin} customerId=${actor.customerId ?? "null"} assignedScope=${accountantScoped}`,
      );
    }
    await this.getOne(documentId, actor);
    if (accountantScoped) {
      const rows = await this.dataSource.transaction(async (manager) => {
        await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
        await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
        await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
        return manager
          .getRepository(Job)
          .createQueryBuilder("job")
          .leftJoinAndSelect("job.customer", "customer")
          .where("job.document_id = :documentId", { documentId })
          .orderBy("job.created_at", "DESC")
          .limit(50)
          .getMany();
      });
      this.log.log(
        `[documents.jobsForDocument] assigned-scope rows=${rows.length} user=${actor?.userId ?? "anon"} doc=${documentId}`,
      );
      return rows;
    }
    const rows = await this.jobs.find({
      where: { documentId },
      order: { createdAt: "DESC" },
      take: 50,
      relations: { customer: true },
    });
    this.log.log(
      `[documents.jobsForDocument] default-scope rows=${rows.length} user=${actor?.userId ?? "anon"} doc=${documentId}`,
    );
    return rows;
  }

  async listAssigneeCandidates(customerId?: string): Promise<Array<{ id: string; email: string; roleNames: string[] }>> {
    const customerFilter = customerId?.trim() ?? "";
    const qb = this.users
      .createQueryBuilder("u")
      .innerJoin("user_roles", "ur", "ur.user_id = u.id")
      .innerJoin("roles", "r", "r.id = ur.role_id")
      .where("u.customer_id IS NULL")
      .andWhere("r.role_type = 'staff'")
      .andWhere(`r.permissions @> '["${DOCUMENT_ASSIGNEE_PERMISSION}"]'::jsonb`);
    if (customerFilter) {
      qb.innerJoin(
        "staff_customer_assignments",
        "sca",
        "sca.staff_user_id = u.id AND sca.customer_id = :assigneeCustomerId",
        { assigneeCustomerId: customerFilter },
      );
    }
    qb.select(["u.id AS id", "u.email AS email", "r.name AS roleName"]);
    const rows = await qb.getRawMany<{ id: string; email: string; roleName: string }>();
    const byUser = new Map<string, { id: string; email: string; roleNames: Set<string> }>();
    for (const row of rows) {
      const key = String(row.id);
      const rec = byUser.get(key) ?? { id: key, email: String(row.email ?? ""), roleNames: new Set<string>() };
      if (row.roleName) rec.roleNames.add(String(row.roleName));
      byUser.set(key, rec);
    }
    return [...byUser.values()]
      .map((x) => ({ id: x.id, email: x.email, roleNames: [...x.roleNames].sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => a.email.localeCompare(b.email));
  }

  async listDocumentAssignees(documentId: string): Promise<Array<{ userId: string; email: string; roleNames: string[] }>> {
    const rows = await this.assignees
      .createQueryBuilder("da")
      .innerJoinAndSelect("da.user", "u")
      .where("da.document_id = :documentId", { documentId })
      .orderBy("da.assigned_at", "ASC")
      .getMany();
    if (rows.length === 0) return [];
    const ids = [...new Set(rows.map((r) => r.userId))];
    const roleRows = await this.userRoles
      .createQueryBuilder("ur")
      .innerJoin("ur.role", "r")
      .where("ur.user_id IN (:...ids)", { ids })
      .select(["ur.user_id AS userId", "r.name AS roleName"])
      .getRawMany<{ userId: string; roleName: string }>();
    const rolesByUser = new Map<string, Set<string>>();
    for (const rr of roleRows) {
      const set = rolesByUser.get(rr.userId) ?? new Set<string>();
      if (rr.roleName) set.add(rr.roleName);
      rolesByUser.set(rr.userId, set);
    }
    return rows.map((r) => ({
      userId: r.userId,
      email: r.user?.email ?? "",
      roleNames: [...(rolesByUser.get(r.userId) ?? new Set<string>())].sort((a, b) => a.localeCompare(b)),
    }));
  }

  async replaceDocumentAssignees(
    documentId: string,
    userIds: string[],
    actor?: AuthUser,
  ): Promise<Array<{ userId: string; email: string; roleNames: string[] }>> {
    const doc = await this.docs.findOne({ where: { id: documentId }, relations: { folder: true } });
    const beforeAssignees = doc && this.fileActivity.isFilesLibraryDocument(doc)
      ? (await this.listDocumentAssignees(documentId)).map((a) => a.userId)
      : null;
    const assigneeCustomerId = doc?.customerId ?? doc?.folder?.customerId ?? undefined;
    const dedup = [...new Set(userIds.map((x) => String(x).trim()).filter(Boolean))];
    if (dedup.length > 0) {
      const candidates = await this.listAssigneeCandidates(assigneeCustomerId);
      const allowed = new Set(candidates.map((c) => c.id));
      for (const uid of dedup) {
        if (!allowed.has(uid)) {
          throw new NotFoundException(
            "One or more assignees are invalid, lack document assignee permission, or are not assigned to this customer",
          );
        }
      }
    }
    await this.assignees.manager.transaction(async (em) => {
      const repo = em.getRepository(DocumentAssigneeEntity);
      await repo.delete({ documentId });
      for (const userId of dedup) {
        await repo.save(
          repo.create({
            documentId,
            userId,
            assignedByUserId: actor?.userId ?? null,
          }),
        );
      }
    });
    if (doc && beforeAssignees && this.fileActivity.isFilesLibraryDocument(doc)) {
      this.fileActivity.recordForDocument(
        doc,
        FileActivityAction.assignees_updated,
        `Assignees updated for ${doc.name}`,
        actor,
        {
          metadata: { before: beforeAssignees, after: dedup },
        },
      );

      const beforeSet = new Set(beforeAssignees);
      const newlyAdded = dedup.filter((userId) => !beforeSet.has(userId));
      if (newlyAdded.length > 0) {
        const meta = doc.metadata ?? {};
        const linkedFileId = typeof meta.fileId === "string" ? meta.fileId.trim() : "";
        void this.fileAssigneeNotifications.notifyNewAssignees({
          documentId: doc.id,
          fileId: linkedFileId || doc.id,
          fileName: doc.name,
          customerId: doc.customerId,
          assigneeUserIds: newlyAdded,
          assignedByUserId: actor?.userId ?? null,
        });
      }
    }
    return this.listDocumentAssignees(documentId);
  }

  /** Staff folder view: all library folders (metadata only). Optional customer / kind filters. */
  async listAllLibraryFolders(q: {
    customerId?: string;
    libraryKind?: FolderLibraryKind;
  }): Promise<
    Array<{
      id: string;
      name: string;
      parentId: string | null;
      type: FolderLibraryKind;
      customerId: string | null;
      customer: { id: string; name: string } | null;
    }>
  > {
    const res = await this.listBrowseLibraryFolders({
      ...q,
      page: 1,
      limit: 10_000,
      scope: "all",
    });
    return res.data;
  }

  /** Staff folder view: paginated leaf folders (supplier level). */
  async listBrowseLibraryFolders(q: {
    customerId?: string;
    libraryKind?: FolderLibraryKind;
    page: number;
    limit: number;
    scope: "global" | "customer" | "all";
    searchText?: string;
  }): Promise<{
    data: Array<{
      id: string;
      name: string;
      parentId: string | null;
      type: FolderLibraryKind;
      customerId: string | null;
      customer: { id: string; name: string } | null;
      isGlobal: boolean;
      isRestricted: boolean;
    }>;
    total: number;
    page: number;
    pageCount: number;
    limit: number;
  }> {
    const safePage = Math.max(1, q.page);
    const safeLimit = Math.min(100, Math.max(1, q.limit));
    const skip = (safePage - 1) * safeLimit;
    const kindList = q.libraryKind
      ? [q.libraryKind]
      : [FolderLibraryKind.invoices, FolderLibraryKind.statements, FolderLibraryKind.files];

    const qb = this.folders
      .createQueryBuilder("folder")
      .leftJoinAndSelect("folder.customer", "customer")
      .where(`NOT EXISTS (SELECT 1 FROM folders child WHERE child.parent_id = folder.id)`)
      .andWhere("folder.type IN (:...kindList)", { kindList });

    const cid = q.customerId?.trim();

    if (q.scope === "global") {
      qb.andWhere("folder.is_global = true AND folder.customer_id IS NULL");
    } else if (q.scope === "customer") {
      if (cid) {
        qb.andWhere("folder.customer_id = :cid AND folder.is_global = false", { cid });
      } else {
        qb.andWhere("folder.customer_id IS NOT NULL AND folder.is_global = false");
      }
    } else if (cid) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where("folder.is_global = true AND folder.customer_id IS NULL")
            .orWhere("folder.customer_id = :cid AND folder.is_global = false", { cid });
        }),
      );
    } else {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where("folder.is_global = true AND folder.customer_id IS NULL")
            .orWhere("folder.customer_id IS NOT NULL AND folder.is_global = false");
        }),
      );
    }

    applyLibraryFolderNameSearch(qb, q.searchText);

    const hasSearch = Boolean(q.searchText?.trim());

    if (hasSearch) {
      const total = await qb.getCount();
      const rows = await qb
        .orderBy("folder.name", "ASC")
        .addOrderBy("folder.id", "ASC")
        .skip(skip)
        .take(safeLimit)
        .getMany();
      return {
        data: rows.map((folder) => ({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          type: folder.type,
          customerId: folder.customerId,
          customer: folder.customer ? { id: folder.customer.id, name: folder.customer.name } : null,
          isGlobal: folder.isGlobal,
          isRestricted: folder.isRestricted,
        })),
        total,
        page: safePage,
        limit: safeLimit,
        pageCount: Math.max(1, Math.ceil(total / safeLimit)),
      };
    }

    if (q.scope === "global") {
      qb.orderBy("folder.name", "ASC");
    } else if (q.scope === "customer") {
      qb.orderBy("customer.name", "ASC").addOrderBy("folder.name", "ASC");
    } else {
      qb.orderBy("folder.isGlobal", "DESC").addOrderBy("customer.name", "ASC").addOrderBy("folder.name", "ASC");
    }

    const [rows, total] = await qb.skip(skip).take(safeLimit).getManyAndCount();

    return {
      data: rows.map((folder) => ({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        type: folder.type,
        customerId: folder.customerId,
        customer: folder.customer ? { id: folder.customer.id, name: folder.customer.name } : null,
        isGlobal: folder.isGlobal,
        isRestricted: folder.isRestricted,
      })),
      total,
      page: safePage,
      limit: safeLimit,
      pageCount: Math.max(1, Math.ceil(total / safeLimit)),
    };
  }

  /** Staff folder view: documents in a folder (loaded on folder click). */
  async listDocumentsInFolder(
    folderId: string,
    actor?: AuthUser,
  ): Promise<
    Array<{
      id: string;
      folderId: string;
      name: string;
      fileUrl: string;
      metadata: Record<string, unknown>;
      mimeType: string | null;
      documentDate: string | null;
      uploadedAt: Date;
      createdAt: Date;
    }>
  > {
    const fid = folderId.trim();
    const accountantScoped = await this.shouldUseAssignedDocumentScope(actor);

    if (accountantScoped) {
      const rows = await this.dataSource.transaction(async (manager) => {
        await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
        await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
        await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
        return manager
          .getRepository(DocumentEntity)
          .createQueryBuilder("doc")
          .innerJoin("document_assignees", "da", "da.document_id = doc.id AND da.user_id = :uid", {
            uid: actor!.userId,
          })
          .where("doc.folder_id = :fid", { fid })
          .orderBy("doc.name", "ASC")
          .getMany();
      });
      return rows.map((doc) => this.toFolderDocumentRow(doc));
    }

    const rows = await this.docs.find({
      where: { folderId: fid },
      order: { name: "ASC" },
    });
    return rows.map((doc) => this.toFolderDocumentRow(doc));
  }

  private toFolderDocumentRow(doc: DocumentEntity) {
    return {
      id: doc.id,
      folderId: doc.folderId ?? "",
      name: doc.name,
      fileUrl: doc.fileUrl,
      metadata: doc.metadata ?? {},
      mimeType: doc.mimeType ?? null,
      documentDate: doc.documentDate ?? null,
      uploadedAt: doc.uploadedAt,
      createdAt: doc.createdAt,
    };
  }

  private static readonly EFFECTIVE_DOC_DATE = `COALESCE(doc.document_date::timestamptz, doc.uploaded_at, doc.created_at)`;
  /** UK business calendar for library date browse (same as cron / staff expectations). */
  private static readonly LIBRARY_DOC_DATE_TZ = "Europe/London";

  private static dateInLibraryTz(timestampExpr: string): string {
    return `timezone('${DocumentsAdminService.LIBRARY_DOC_DATE_TZ}', ${timestampExpr})`;
  }

  /** Date view: paginated drill-down (year → month → day → customer → folder → documents). */
  async listBrowseLibraryDates(
    q: LibraryDateBrowseQuery,
    actor?: AuthUser,
  ): Promise<{ data: unknown[]; total: number; page: number; pageCount: number; limit: number }> {
    const accountantScoped = await this.shouldUseAssignedDocumentScope(actor);
    if (accountantScoped) {
      return this.dataSource.transaction(async (manager) => {
        await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
        await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
        await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
        return this.listBrowseLibraryDatesInner(q, actor, manager.getRepository(DocumentEntity), true);
      });
    }
    return this.listBrowseLibraryDatesInner(q, actor, this.docs, false);
  }

  private async listBrowseLibraryDatesInner(
    q: LibraryDateBrowseQuery,
    actor: AuthUser | undefined,
    docs: Repository<DocumentEntity>,
    accountantAssignedJoin: boolean,
  ): Promise<{ data: unknown[]; total: number; page: number; pageCount: number; limit: number }> {
    const page = Math.max(1, q.page);
    const limit = Math.min(100, Math.max(1, q.limit));
    const skip = (page - 1) * limit;
    const folderScoped = Boolean(q.folderId?.trim());
    const useUploadDate =
      q.dateBasis === "effective" ? false : q.dateBasis === "uploaded" || folderScoped;
    const ED = useUploadDate
      ? `COALESCE(doc.uploaded_at, doc.created_at)`
      : DocumentsAdminService.EFFECTIVE_DOC_DATE;
    const edTz = DocumentsAdminService.dateInLibraryTz(ED);
    const dateBucketExpr = `TO_CHAR(DATE(${edTz}), 'YYYY-MM-DD')`;
    const DY = `EXTRACT(YEAR FROM ${edTz})`;
    const DM = `EXTRACT(MONTH FROM ${edTz})`;
    const DD = `EXTRACT(DAY FROM ${edTz})`;

    const portalCid = actor?.customerId?.trim();
    const requestedCid = q.customerId?.trim();
    let customerIdFilter = requestedCid;
    if (portalCid) {
      if (requestedCid && requestedCid !== portalCid) {
        throw new ForbiddenException("Cannot query another customer's documents");
      }
      customerIdFilter = portalCid;
    }

    const qb = docs.createQueryBuilder("doc");
    if (q.level === "documents") {
      qb.leftJoinAndSelect("doc.folder", "folder")
        .leftJoinAndSelect("doc.customer", "docCustomer")
        .leftJoinAndSelect("folder.customer", "customer");
    } else {
      qb.leftJoin("doc.folder", "folder")
        .leftJoin("folder.customer", "customer")
        .leftJoin("doc.customer", "docCustomer");
    }
    qb.where(`${ED} IS NOT NULL`).andWhere("doc.deleted_at IS NULL");

    const dateKeyFilter = q.dateKey?.trim();
    if (dateKeyFilter && /^\d{4}-\d{2}-\d{2}$/.test(dateKeyFilter)) {
      qb.andWhere(`${dateBucketExpr} = :browseDateKey`, { browseDateKey: dateKeyFilter });
    } else {
      if (q.year != null) {
        qb.andWhere(`${DY} = :browseYear`, { browseYear: q.year });
      }
      if (q.month != null) {
        qb.andWhere(`${DM} = :browseMonthNum`, { browseMonthNum: q.month });
      }
      if (q.day != null) {
        qb.andWhere(`${DD} = :browseDay`, { browseDay: q.day });
      }
    }

    if (accountantAssignedJoin && actor?.userId) {
      qb.innerJoin("document_assignees", "da", "da.document_id = doc.id AND da.user_id = :assignUid", {
        assignUid: actor.userId,
      });
    } else {
      const staffAssignedOnly =
        q.assignedOnly === true && !!actor?.userId?.trim() && !actor.isAdmin && !actor.customerId;
      if (staffAssignedOnly) {
        qb.andWhere(
          `EXISTS (SELECT 1 FROM document_assignees das WHERE das.document_id = doc.id AND das.user_id = :assignScopeUid)`,
          { assignScopeUid: actor!.userId },
        );
      }
    }

    const folderScopedInner = Boolean(q.folderId?.trim());
    if (customerIdFilter && q.level === "documents") {
      qb.andWhere("(doc.customer_id = :browseCid OR folder.customer_id = :browseCid)", { browseCid: customerIdFilter });
    } else if (customerIdFilter && q.level !== "folders" && !folderScopedInner) {
      qb.andWhere("(doc.customer_id = :browseCid OR folder.customer_id = :browseCid)", { browseCid: customerIdFilter });
    }
    if (q.libraryKind && !folderScopedInner) {
      qb.andWhere("folder.type = :browseLib", { browseLib: q.libraryKind });
    }
    if (folderScopedInner) {
      qb.andWhere("doc.folder_id = :browseFolderId", { browseFolderId: q.folderId!.trim() });
    }
    if (q.level === "customers") {
      qb.andWhere("docCustomer.account_status = :browseActiveCustomerStatus", {
        browseActiveCustomerStatus: CustomerAccountStatus.active,
      });
    }
    if (q.level === "folders" && q.customerId?.trim()) {
      qb.andWhere("(doc.customer_id = :folderBrowseCid OR folder.customer_id = :folderBrowseCid)", {
        folderBrowseCid: q.customerId.trim(),
      });
    }

    if (q.level === "documents") {
      const term = q.searchText?.trim();
      if (term) {
        qb.andWhere(
          new Brackets((sub) => {
            sub
              .where("STRPOS(LOWER(COALESCE(doc.name, '')), LOWER(:dateSearchTerm)) > 0", { dateSearchTerm: term })
              .orWhere("STRPOS(LOWER(COALESCE(customer.name, '')), LOWER(:dateSearchTerm)) > 0", {
                dateSearchTerm: term,
              })
              .orWhere("STRPOS(LOWER(COALESCE(folder.name, '')), LOWER(:dateSearchTerm)) > 0", {
                dateSearchTerm: term,
              });
          }),
        );
      }
      const sortByUpload = folderScopedInner || useUploadDate;
      const countRow = await qb.clone().select("COUNT(DISTINCT doc.id)", "cnt").getRawOne<{ cnt: string }>();
      const total = Number(countRow?.cnt ?? 0);
      const rows = await qb
        .orderBy(sortByUpload ? "doc.uploadedAt" : "doc.name", sortByUpload ? "DESC" : "ASC")
        .addOrderBy("doc.id", sortByUpload ? "DESC" : "ASC")
        .skip(skip)
        .take(limit)
        .getMany();
      return {
        data: rows.map((doc) => this.toDocumentListRow(doc)),
        total,
        page,
        limit,
        pageCount: Math.max(1, Math.ceil(total / limit)),
      };
    }

    type GroupRow = Record<string, string | number | null>;
    let countDistinctExpr = "";

    switch (q.level) {
      case "years":
        countDistinctExpr = `COUNT(DISTINCT ${DY})`;
        break;
      case "months":
        countDistinctExpr = `COUNT(DISTINCT ${DM})`;
        break;
      case "days":
        countDistinctExpr = `COUNT(DISTINCT ${DD})`;
        break;
      case "dates":
        countDistinctExpr = `COUNT(DISTINCT ${dateBucketExpr})`;
        break;
      case "customers":
        countDistinctExpr = `COUNT(DISTINCT COALESCE(doc.customer_id, folder.customer_id))`;
        break;
      case "folders":
        countDistinctExpr = "COUNT(DISTINCT folder.id)";
        break;
      default:
        throw new ForbiddenException("Invalid date browse level");
    }

    const countRow = await qb.clone().select(countDistinctExpr, "cnt").getRawOne<{ cnt: string }>();
    const total = Number(countRow?.cnt ?? 0);

    if (q.level === "years") {
      const rows = await qb
        .clone()
        .select(DY, "year")
        .addSelect("COUNT(*)", "count")
        .groupBy(DY)
        .orderBy(DY, "DESC")
        .offset(skip)
        .limit(limit)
        .getRawMany<GroupRow>();
      return {
        data: rows.map((r) => ({ year: Number(r.year), count: Number(r.count) })),
        total,
        page,
        limit,
        pageCount: Math.max(1, Math.ceil(total / limit)),
      };
    }

    if (q.level === "months") {
      const rows = await qb
        .clone()
        .select(DM, "month")
        .addSelect("COUNT(*)", "count")
        .groupBy(DM)
        .orderBy(DM, "ASC")
        .offset(skip)
        .limit(limit)
        .getRawMany<GroupRow>();
      return {
        data: rows.map((r) => ({ month: Number(r.month), count: Number(r.count) })),
        total,
        page,
        limit,
        pageCount: Math.max(1, Math.ceil(total / limit)),
      };
    }

    if (q.level === "days") {
      const rows = await qb
        .clone()
        .select(DD, "day")
        .addSelect("COUNT(*)", "count")
        .groupBy(DD)
        .orderBy(DD, "ASC")
        .offset(skip)
        .limit(limit)
        .getRawMany<GroupRow>();
      return {
        data: rows.map((r) => ({ day: Number(r.day), count: Number(r.count) })),
        total,
        page,
        limit,
        pageCount: Math.max(1, Math.ceil(total / limit)),
      };
    }

    if (q.level === "dates") {
      const rows = await qb
        .clone()
        .select(dateBucketExpr, "dateKey")
        .addSelect("COUNT(*)", "count")
        .groupBy(dateBucketExpr)
        .orderBy(dateBucketExpr, "DESC")
        .offset(skip)
        .limit(limit)
        .getRawMany<GroupRow>();
      return {
        data: rows.map((r) => ({
          dateKey: String(r.dateKey ?? "Undated"),
          count: Number(r.count),
        })),
        total,
        page,
        limit,
        pageCount: Math.max(1, Math.ceil(total / limit)),
      };
    }

    if (q.level === "customers") {
      const rows = await qb
        .clone()
        .select("COALESCE(doc.customer_id, folder.customer_id)", "customerId")
        .addSelect("COALESCE(docCustomer.name, customer.name)", "customerName")
        .addSelect("COUNT(*)", "count")
        .groupBy("COALESCE(doc.customer_id, folder.customer_id)")
        .addGroupBy("COALESCE(docCustomer.name, customer.name)")
        .orderBy("COALESCE(docCustomer.name, customer.name)", "ASC")
        .offset(skip)
        .limit(limit)
        .getRawMany<GroupRow>();
      return {
        data: rows.map((r) => ({
          customerId: String(r.customerId ?? ""),
          customerName: String(r.customerName ?? "Unknown"),
          count: Number(r.count),
        })),
        total,
        page,
        limit,
        pageCount: Math.max(1, Math.ceil(total / limit)),
      };
    }

    const rows = await qb
      .clone()
      .select("folder.id", "folderId")
      .addSelect("folder.name", "folderName")
      .addSelect("folder.type", "libraryKind")
      .addSelect("COUNT(*)", "count")
      .groupBy("folder.id")
      .addGroupBy("folder.name")
      .addGroupBy("folder.type")
      .orderBy("folder.name", "ASC")
      .offset(skip)
      .limit(limit)
      .getRawMany<GroupRow>();
    return {
      data: rows.map((r) => ({
        folderId: String(r.folderId ?? ""),
        folderName: String(r.folderName ?? "—"),
        libraryKind: String(r.libraryKind ?? "files"),
        count: Number(r.count),
      })),
      total,
      page,
      limit,
      pageCount: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private parseSort(raw: string | undefined): { expr: string; order: "ASC" | "DESC" } {
    const def = { expr: "doc.name", order: "ASC" as const };
    if (!raw || typeof raw !== "string") return def;
    const [field, dirRaw] = raw.split(",").map((x) => x.trim());
    const order = dirRaw?.toUpperCase() === "DESC" ? ("DESC" as const) : ("ASC" as const);
    if (field === "name") return { expr: "doc.name", order };
    if (field === "customer.name") return { expr: "customer.name", order };
    if (field === "folder.name") return { expr: "folder.name", order };
    if (field === "type") return { expr: "folder.type", order };
    if (field === "uploadedAt") return { expr: "doc.uploadedAt", order };
    if (field === "createdAt") return { expr: "doc.createdAt", order };
    return def;
  }

  private parseUploadedAfter(raw: string | undefined): Date | undefined {
    const trimmed = raw?.trim();
    if (!trimmed) return undefined;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed;
  }

  private parseUploadedBefore(raw: string | undefined): Date | undefined {
    const trimmed = raw?.trim();
    if (!trimmed) return undefined;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed;
  }

  private parseUploadDateKey(raw: string | undefined): string | undefined {
    const trimmed = raw?.trim();
    if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
    return trimmed;
  }

  private normalizeUploadDateKey(raw: unknown): string {
    if (raw == null) return "";
    if (typeof raw === "string") {
      const trimmed = raw.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
      return trimmed;
    }
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      return raw.toISOString().slice(0, 10);
    }
    return String(raw).trim();
  }

  private applyUploadDateKeyFilter(qb: ReturnType<Repository<DocumentEntity>["createQueryBuilder"]>, uploadDateKey: string): void {
    qb.andWhere(`${libraryUploadDateKeySql("doc")} = :uploadDateKey`, { uploadDateKey });
  }

  /** All library documents for a ZIP export (respects browse filters and access scope). */
  async findDocumentsForLibraryExport(
    q: {
      customerId?: string;
      libraryKind?: FolderLibraryKind;
      folderId?: string;
      year?: number;
      month?: number;
      day?: number;
      searchText?: string;
      assignedOnly?: boolean;
      uploadedAfter?: string;
      uploadedBefore?: string;
      documentIds?: string[];
    },
    actor?: AuthUser,
  ): Promise<DocumentEntity[]> {
    const requestedCid = q.customerId?.trim();
    const portalCid = actor?.customerId?.trim();
    let customerIdFilter = requestedCid;
    if (portalCid) {
      if (requestedCid && requestedCid !== portalCid) {
        throw new ForbiddenException("Cannot export another customer's documents");
      }
      customerIdFilter = portalCid;
    }

    const selectedIds = [...new Set((q.documentIds ?? []).map((id) => id.trim()).filter(Boolean))].slice(0, 5000);

    const accountantScoped = await this.shouldUseAssignedDocumentScope(actor);
    const runQuery = async (docs: Repository<DocumentEntity>, assignedJoin: boolean) => {
      if (selectedIds.length > 0) {
        const qb = docs
          .createQueryBuilder("doc")
          .leftJoinAndSelect("doc.folder", "folder")
          .leftJoinAndSelect("doc.customer", "docCustomer")
          .leftJoinAndSelect("folder.customer", "customer")
          .where("doc.id IN (:...exportDocIds)", { exportDocIds: selectedIds })
          .andWhere("doc.deleted_at IS NULL");

        if (customerIdFilter) {
          qb.andWhere("(doc.customer_id = :exportCid OR folder.customer_id = :exportCid)", {
            exportCid: customerIdFilter,
          });
        }

        if (assignedJoin && actor?.userId) {
          qb.innerJoin("document_assignees", "da", "da.document_id = doc.id AND da.user_id = :assignUid", {
            assignUid: actor.userId,
          });
        } else {
          const staffAssignedOnly =
            q.assignedOnly === true && !!actor?.userId?.trim() && !actor.isAdmin && !actor.customerId;
          if (staffAssignedOnly) {
            qb.andWhere(
              `EXISTS (SELECT 1 FROM document_assignees das WHERE das.document_id = doc.id AND das.user_id = :assignScopeUid)`,
              { assignScopeUid: actor!.userId },
            );
          }
        }

        qb.orderBy("doc.uploadedAt", "DESC").addOrderBy("doc.id", "DESC");
        return qb.getMany();
      }

      const folderScoped = Boolean(q.folderId?.trim());
      const ED = `COALESCE(doc.uploaded_at, doc.created_at)`;
      const edTz = DocumentsAdminService.dateInLibraryTz(ED);
      const DY = `EXTRACT(YEAR FROM ${edTz})`;
      const DM = `EXTRACT(MONTH FROM ${edTz})`;
      const DD = `EXTRACT(DAY FROM ${edTz})`;

      const qb = docs
        .createQueryBuilder("doc")
        .leftJoinAndSelect("doc.folder", "folder")
        .leftJoinAndSelect("doc.customer", "docCustomer")
        .leftJoinAndSelect("folder.customer", "customer")
        .where(`${ED} IS NOT NULL`)
        .andWhere("doc.deleted_at IS NULL");

      if (customerIdFilter) {
        qb.andWhere("(doc.customer_id = :exportCid OR folder.customer_id = :exportCid)", {
          exportCid: customerIdFilter,
        });
      }

      if (q.year != null) {
        qb.andWhere(`${DY} = :exportYear`, { exportYear: q.year });
      }
      if (q.month != null) {
        qb.andWhere(`${DM} = :exportMonth`, { exportMonth: q.month });
      }
      if (q.day != null) {
        qb.andWhere(`${DD} = :exportDay`, { exportDay: q.day });
      }

      if (assignedJoin && actor?.userId) {
        qb.innerJoin("document_assignees", "da", "da.document_id = doc.id AND da.user_id = :assignUid", {
          assignUid: actor.userId,
        });
      } else {
        const staffAssignedOnly =
          q.assignedOnly === true && !!actor?.userId?.trim() && !actor.isAdmin && !actor.customerId;
        if (staffAssignedOnly) {
          qb.andWhere(
            `EXISTS (SELECT 1 FROM document_assignees das WHERE das.document_id = doc.id AND das.user_id = :assignScopeUid)`,
            { assignScopeUid: actor!.userId },
          );
        }
      }

      if (q.libraryKind && !folderScoped) {
        qb.andWhere("folder.type = :exportLib", { exportLib: q.libraryKind });
      }
      if (folderScoped) {
        qb.andWhere("doc.folder_id = :exportFolderId", { exportFolderId: q.folderId!.trim() });
      }

      const term = q.searchText?.trim();
      if (term) {
        qb.andWhere(
          new Brackets((sub) => {
            sub
              .where("STRPOS(LOWER(COALESCE(doc.name, '')), LOWER(:exportSearchTerm)) > 0", {
                exportSearchTerm: term,
              })
              .orWhere("STRPOS(LOWER(COALESCE(docCustomer.name, '')), LOWER(:exportSearchTerm)) > 0", {
                exportSearchTerm: term,
              })
              .orWhere("STRPOS(LOWER(COALESCE(customer.name, '')), LOWER(:exportSearchTerm)) > 0", {
                exportSearchTerm: term,
              })
              .orWhere("STRPOS(LOWER(COALESCE(folder.name, '')), LOWER(:exportSearchTerm)) > 0", {
                exportSearchTerm: term,
              });
          }),
        );
      }

      const uploadedAfter = this.parseUploadedAfter(q.uploadedAfter);
      if (uploadedAfter) {
        qb.andWhere("doc.uploaded_at >= :exportUploadedAfter", { exportUploadedAfter: uploadedAfter });
      }
      const uploadedBefore = this.parseUploadedBefore(q.uploadedBefore);
      if (uploadedBefore) {
        qb.andWhere("doc.uploaded_at <= :exportUploadedBefore", { exportUploadedBefore: uploadedBefore });
      }

      qb.orderBy("doc.uploadedAt", "DESC").addOrderBy("doc.id", "DESC").take(5000);
      return qb.getMany();
    };

    return this.dataSource.transaction(async (manager) => {
      if (accountantScoped) {
        await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
        await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
        await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      } else {
        await manager.query(`SELECT set_config('app.is_admin', $1, true)`, [actor?.isAdmin ? "1" : "0"]);
        await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [actor?.customerId?.trim() ?? ""]);
        await manager.query(`SELECT set_config('app.user_id', $1, true)`, [actor?.userId?.trim() ?? ""]);
      }
      return runQuery(manager.getRepository(DocumentEntity), accountantScoped);
    });
  }
}
