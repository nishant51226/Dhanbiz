import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import type { Request } from "express";
import { DataSource, IsNull, Repository } from "typeorm";
import { runOnTransactionCommit } from "typeorm-transactional";
import type { AuthUser } from "../auth/auth.types.js";
import {
  PORTAL_JOB_FILE_META_KEY,
  PORTAL_JOB_STAGING_META_KEY,
} from "../customer-portal/portal-staging.constants.js";
import { DocumentEntity } from "../entities/document.entity.js";
import {
  FileActivityAction,
  FileActivityActorKind,
  FileActivityLogEntity,
} from "../entities/file-activity-log.entity.js";
import type { File } from "../entities/file.entity.js";
import type { Job } from "../entities/job.entity.js";
import { runWithAdminRls } from "../tenant/run-with-tenant-rls.js";

/** Library documents on the Files tab (excludes staging/hidden). */
export const LIBRARY_ACTIVITY_DOCUMENT_TYPES = new Set(["file", "invoice", "statement"]);

export type FileActivityRecordInput = {
  customerId: string;
  documentId?: string | null;
  fileId?: string | null;
  jobId?: string | null;
  action: FileActivityAction;
  summary: string;
  metadata?: Record<string, unknown>;
  actorUserId?: string | null;
  actorKind?: FileActivityActorKind;
  actorIsAdmin?: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type RequestActorContext = {
  actorUserId: string | null;
  actorKind: FileActivityActorKind;
  actorIsAdmin: boolean;
  ipAddress: string | null;
  userAgent: string | null;
};

export type FileActivityRequestContext = {
  user?: AuthUser;
  ip?: string;
  headers?: Request["headers"];
};

@Injectable()
export class FileActivityLogService {
  private readonly log = new Logger(FileActivityLogService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(FileActivityLogEntity)
    private readonly logs: Repository<FileActivityLogEntity>,
    @InjectRepository(DocumentEntity)
    private readonly documents: Repository<DocumentEntity>,
  ) {}

  isFilesLibraryDocument(doc: Pick<DocumentEntity, "documentType" | "metadata">): boolean {
    if (this.isStagingDocument(doc)) return false;
    return LIBRARY_ACTIVITY_DOCUMENT_TYPES.has(doc.documentType);
  }

  isStagingDocument(doc: Pick<DocumentEntity, "metadata">): boolean {
    const meta = doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
    if (meta[PORTAL_JOB_STAGING_META_KEY] === true) return true;
    if (meta.hidden === true) return true;
    return false;
  }

  private isAuthUser(v: FileActivityRequestContext | AuthUser | undefined): v is AuthUser {
    return Boolean(v && "userId" in v && "isAdmin" in v);
  }

  isStagingFile(file: Pick<File, "metadata">): boolean {
    const meta = file.metadata && typeof file.metadata === "object" ? file.metadata : {};
    return meta[PORTAL_JOB_FILE_META_KEY] === true;
  }

  /** Documents may only carry tenant scope on `folder`, not `doc.customer_id`. */
  resolveDocumentCustomerId(
    doc: Pick<DocumentEntity, "customerId"> & {
      folder?: { customerId?: string | null; customer?: { id?: string } | null } | null;
    },
  ): string | null {
    const direct = doc.customerId?.trim();
    if (direct) return direct;
    const folder = doc.folder;
    if (!folder) return null;
    const fromFolder = folder.customerId?.trim();
    if (fromFolder) return fromFolder;
    const fromRelation = folder.customer?.id?.trim();
    if (fromRelation) return fromRelation;
    return null;
  }

  actorFromUser(user?: AuthUser): Omit<RequestActorContext, "ipAddress" | "userAgent"> {
    if (!user) {
      return {
        actorUserId: null,
        actorKind: FileActivityActorKind.system,
        actorIsAdmin: false,
      };
    }
    return {
      actorUserId: user.userId,
      actorKind: user.customerId ? FileActivityActorKind.portal : FileActivityActorKind.staff,
      actorIsAdmin: user.isAdmin,
    };
  }

  actorFromRequest(req?: FileActivityRequestContext): RequestActorContext {
    const user = req?.user;
    const ipAddress = typeof req?.ip === "string" && req.ip.trim() ? req.ip.trim() : null;
    const uaRaw = req?.headers?.["user-agent"];
    const userAgent = typeof uaRaw === "string" && uaRaw.trim() ? uaRaw.trim().slice(0, 512) : null;
    if (!user) {
      return {
        actorUserId: null,
        actorKind: FileActivityActorKind.system,
        actorIsAdmin: false,
        ipAddress,
        userAgent,
      };
    }
    return {
      actorUserId: user.userId,
      actorKind: user.customerId ? FileActivityActorKind.portal : FileActivityActorKind.staff,
      actorIsAdmin: user.isAdmin,
      ipAddress,
      userAgent,
    };
  }

  /** Fire-and-forget; never throws to callers. Deferred until the request transaction commits. */
  record(input: FileActivityRecordInput): void {
    this.schedulePersist(input);
  }

  /**
   * Audit rows must not run on the request-scoped TypeORM connection (CLS + RlsTenantInterceptor):
   * an INSERT mid-upload would use tenant GUCs, fail RLS, and abort the whole upload transaction.
   */
  private schedulePersist(input: FileActivityRecordInput): void {
    const run = () => {
      void this.persist(input).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.error(`file activity log failed action=${input.action}: ${msg}`);
      });
    };
    try {
      runOnTransactionCommit(run);
    } catch {
      // Queue workers and other non-request paths have no transactional hook manager.
      run();
    }
  }

  private linkedFileIdForDocument(
    doc: DocumentEntity,
    extra?: { fileId?: string | null; jobId?: string | null; metadata?: Record<string, unknown> },
  ): string | null {
    if (extra && Object.prototype.hasOwnProperty.call(extra, "fileId")) {
      return extra.fileId?.trim() || null;
    }
    const meta = doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
    const fromMeta = typeof meta.fileId === "string" ? meta.fileId.trim() : "";
    return fromMeta || null;
  }

  /** Log download activity for each document; failures on one row do not block the rest. */
  async recordDownloadsForDocuments(
    docs: DocumentEntity[],
    reqOrUser: FileActivityRequestContext | AuthUser | undefined,
    summaryFor: (doc: DocumentEntity) => string,
    metadataFor?: (doc: DocumentEntity) => Record<string, unknown>,
  ): Promise<void> {
    const results = await Promise.allSettled(
      docs.map((doc) =>
        this.recordForDocumentAwait(
          doc,
          FileActivityAction.downloaded,
          summaryFor(doc),
          reqOrUser,
          {
            fileId: null,
            metadata: metadataFor?.(doc) ?? {},
          },
        ),
      ),
    );
    for (let i = 0; i < results.length; i += 1) {
      const outcome = results[i];
      if (outcome.status === "rejected") {
        const doc = docs[i];
        const msg = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        this.log.warn(`file activity download log failed doc=${doc?.id ?? "?"}: ${msg}`);
      }
    }
  }

  recordForDocument(
    doc: DocumentEntity,
    action: FileActivityAction,
    summary: string,
    reqOrUser?: FileActivityRequestContext | AuthUser,
    extra?: {
      fileId?: string | null;
      jobId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): void {
    if (!this.isFilesLibraryDocument(doc)) return;
    const linkedFileId = this.linkedFileIdForDocument(doc, extra);
    const actor = this.isAuthUser(reqOrUser)
      ? { ...this.actorFromUser(reqOrUser), ipAddress: null, userAgent: null }
      : this.actorFromRequest(reqOrUser);
    const customerId = this.resolveDocumentCustomerId(doc);
    if (!customerId) {
      this.log.warn(`file activity skipped doc=${doc.id} action=${action}: no customer scope`);
      return;
    }
    this.schedulePersist({
      customerId,
      documentId: doc.id,
      fileId: linkedFileId,
      jobId: extra?.jobId ?? null,
      action,
      summary,
      metadata: extra?.metadata ?? {},
      actorUserId: actor.actorUserId,
      actorKind: actor.actorKind,
      actorIsAdmin: actor.actorIsAdmin,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  }

  async recordForDocumentAwait(
    doc: DocumentEntity,
    action: FileActivityAction,
    summary: string,
    reqOrUser?: FileActivityRequestContext | AuthUser,
    extra?: {
      fileId?: string | null;
      jobId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (!this.isFilesLibraryDocument(doc)) return;
    const linkedFileId = this.linkedFileIdForDocument(doc, extra);
    const actor = this.isAuthUser(reqOrUser)
      ? { ...this.actorFromUser(reqOrUser), ipAddress: null, userAgent: null }
      : this.actorFromRequest(reqOrUser);
    const customerId = this.resolveDocumentCustomerId(doc);
    if (!customerId) {
      this.log.warn(`file activity skipped doc=${doc.id} action=${action}: no customer scope`);
      return;
    }
    await this.persist({
      customerId,
      documentId: doc.id,
      fileId: linkedFileId,
      jobId: extra?.jobId ?? null,
      action,
      summary,
      metadata: extra?.metadata ?? {},
      actorUserId: actor.actorUserId,
      actorKind: actor.actorKind,
      actorIsAdmin: actor.actorIsAdmin,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
  }

  async findFilesLibraryDocumentByFileId(fileId: string): Promise<DocumentEntity | null> {
    const trimmed = fileId.trim();
    if (!trimmed) return null;
    const doc = await this.documents
      .createQueryBuilder("doc")
      .where("doc.document_type = :type", { type: "file" })
      .andWhere("doc.deleted_at IS NULL")
      .andWhere(`doc.metadata->>'fileId' = :fileId`, { fileId: trimmed })
      .getOne();
    if (!doc || !this.isFilesLibraryDocument(doc)) return null;
    return doc;
  }

  recordContentAccess(params: {
    documentId?: string | null;
    document?: DocumentEntity | null;
    fileId?: string | null;
    fileName?: string | null;
    download: boolean;
    req?: FileActivityRequestContext;
    route?: string;
  }): void {
    void this.recordContentAccessAwait(params).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`file activity content access failed: ${msg}`);
    });
  }

  /** Awaited variant — use on content GET so the list can read the log immediately after preview. */
  async recordContentAccessAwait(params: {
    documentId?: string | null;
    document?: DocumentEntity | null;
    fileId?: string | null;
    fileName?: string | null;
    download: boolean;
    req?: FileActivityRequestContext;
    route?: string;
  }): Promise<void> {
    const doc = await this.resolveContentDocument(params.document, params.fileId, params.documentId);
    if (!doc) return;
    const action = params.download ? FileActivityAction.downloaded : FileActivityAction.viewed;
    const name = params.fileName?.trim() || doc.name || doc.originalName || "file";
    await this.recordForDocumentAwait(
      doc,
      action,
      `${params.download ? "Downloaded" : "Viewed"} ${name}`,
      params.req,
      {
        metadata: {
          intent: params.download ? "download" : "view",
          route: params.route ?? null,
        },
      },
    );
  }

  tryLogJob(
    job: Pick<Job, "id" | "customerId" | "documentId" | "fileId" | "status">,
    action: FileActivityAction,
    opts?: {
      fromStatus?: string | null;
      toStatus?: string | null;
      summary?: string;
      actorUserId?: string | null;
      actorKind?: FileActivityActorKind;
    },
  ): void {
    void this.resolveJobScope(job).then((scope) => {
      if (!scope) return;
      const summary =
        opts?.summary?.trim() ||
        `Job ${action.replace(/^job_/, "").replace(/_/g, " ")} (${job.id.slice(0, 8)}…)`;
      this.record({
        customerId: scope.customerId,
        documentId: scope.documentId,
        fileId: scope.fileId,
        jobId: job.id,
        action,
        summary,
        metadata: {
          fromStatus: opts?.fromStatus ?? null,
          toStatus: opts?.toStatus ?? job.status,
        },
        actorUserId: opts?.actorUserId ?? null,
        actorKind: opts?.actorKind ?? FileActivityActorKind.system,
        actorIsAdmin: opts?.actorKind !== FileActivityActorKind.portal,
      });
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`file activity job log failed job=${job.id}: ${msg}`);
    });
  }

  private async resolveContentDocument(
    document: DocumentEntity | null | undefined,
    fileId: string | null | undefined,
    documentId?: string | null,
  ): Promise<DocumentEntity | null> {
    if (document) {
      return this.isFilesLibraryDocument(document) ? document : null;
    }
    if (documentId?.trim()) {
      const doc = await this.documents.findOne({ where: { id: documentId.trim() } });
      if (doc && this.isFilesLibraryDocument(doc)) return doc;
    }
    if (fileId?.trim()) {
      return this.findFilesLibraryDocumentByFileId(fileId);
    }
    return null;
  }

  private async resolveJobScope(
    job: Pick<Job, "customerId" | "documentId" | "fileId">,
  ): Promise<{ customerId: string; documentId: string | null; fileId: string | null } | null> {
    if (job.documentId) {
      const doc = await this.documents.findOne({
        where: { id: job.documentId, deletedAt: IsNull() },
      });
      if (!doc || !this.isFilesLibraryDocument(doc)) return null;
      const meta = doc.metadata && typeof doc.metadata === "object" ? doc.metadata : {};
      const linkedFileId =
        typeof meta.fileId === "string" && meta.fileId.trim() ? meta.fileId.trim() : job.fileId;
      return { customerId: doc.customerId, documentId: doc.id, fileId: linkedFileId ?? null };
    }
    if (job.fileId) {
      const doc = await this.findFilesLibraryDocumentByFileId(job.fileId);
      if (!doc) return null;
      return { customerId: doc.customerId, documentId: doc.id, fileId: job.fileId };
    }
    return null;
  }

  private isPostgresFkViolation(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const code = (err as { code?: string }).code;
    return code === "23503";
  }

  private async persist(input: FileActivityRecordInput): Promise<void> {
    try {
      await this.persistRow(input);
    } catch (err) {
      if (input.fileId && this.isPostgresFkViolation(err)) {
        this.log.warn(
          `file activity retry without file_id doc=${input.documentId ?? "?"} action=${input.action}`,
        );
        await this.persistRow({ ...input, fileId: null });
        return;
      }
      throw err;
    }
  }

  private async persistRow(input: FileActivityRecordInput): Promise<void> {
    const actorKind = input.actorKind ?? FileActivityActorKind.system;
    const summary = input.summary.slice(0, 512);
    const metadataJson = JSON.stringify(input.metadata ?? {});

    await runWithAdminRls(
      this.dataSource,
      async (manager) => {
        /**
         * Raw INSERT on the dedicated admin connection — avoids typeorm-transactional rebinding
         * `Repository.save` to the request transaction (see CustomersService.createOne comment).
         */
        await manager.query(
          `
          INSERT INTO file_activity_logs (
            customer_id, document_id, file_id, job_id, action,
            actor_user_id, actor_kind, summary, metadata, ip_address, user_agent
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
          `,
          [
            input.customerId,
            input.documentId ?? null,
            input.fileId ?? null,
            input.jobId ?? null,
            input.action,
            input.actorUserId ?? null,
            actorKind,
            summary,
            metadataJson,
            input.ipAddress ?? null,
            input.userAgent ?? null,
          ],
        );
      },
      "FileActivityLogService.persist",
    );
  }
}
