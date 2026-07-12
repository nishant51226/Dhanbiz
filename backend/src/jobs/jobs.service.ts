import { Injectable, Logger } from "@nestjs/common";
import type { AuthUser } from "../auth/auth.types";
import { practiceStaffUsesAssignedDocumentScope } from "../auth/practice-staff-permission.util.js";
import { CrudRequest, GetManyDefaultResponse } from "@nestjsx/crud";
import { ComparisonOperator, QueryFilter, type ParsedRequestParams } from "@nestjsx/crud-request";
import { InjectRepository } from "@nestjs/typeorm";
import { TypeOrmCrudService } from "@nestjsx/crud-typeorm";
import type { Request } from "express";
import { Brackets, DataSource, Repository } from "typeorm";
import { DocumentAssigneeEntity } from "../entities/document-assignee.entity";
import { FolderLibraryKind } from "../entities/folder.entity";
import { Job, JobStatus } from "../entities/job.entity";
import { UserRoleEntity } from "../entities/user-role.entity";

/**
 * Override getMany/getOne: nestjsx + TypeORM joins for eager `customer` + `file` can produce
 * PostgreSQL "column reference Job_id is ambiguous". Loading relations with
 * `relationLoadStrategy: "query"` avoids the problematic join SQL.
 *
 * `getMany` uses a dedicated query builder so list filters (status, customer, library kind),
 * text search, pagination, and sorting work when the client sends `s` (search): nestjsx omits
 * `parsed.filter` in that case, but raw URL still has `filter`; when raw `filter` is missing we use
 * `parsed.filter` from the interceptor (never rely on `parsed.search` being absent — CRUD wraps it).
 */
@Injectable()
export class JobsService extends TypeOrmCrudService<Job> {
  private readonly log = new Logger(JobsService.name);

  constructor(
    @InjectRepository(Job) repo: Repository<Job>,
    @InjectRepository(UserRoleEntity) private readonly userRoles: Repository<UserRoleEntity>,
    private readonly dataSource: DataSource,
  ) {
    super(repo);
  }

  private async resolveActor(actor?: AuthUser): Promise<AuthUser | undefined> {
    if (actor?.userId) return actor;
    try {
      const row = await this.dataSource.query(
        `SELECT
          NULLIF(current_setting('app.user_id', true), '') AS user_id,
          NULLIF(current_setting('app.customer_id', true), '') AS customer_id,
          current_setting('app.is_admin', true) AS is_admin`
      );
      const first = Array.isArray(row) ? (row[0] as Record<string, unknown> | undefined) : undefined;
      const userId = typeof first?.user_id === "string" ? first.user_id.trim() : "";
      if (!userId) return undefined;
      const customerIdRaw = typeof first?.customer_id === "string" ? first.customer_id.trim() : "";
      const isAdminRaw = String(first?.is_admin ?? "0");
      return {
        userId,
        customerId: customerIdRaw || null,
        isAdmin: isAdminRaw === "1" || isAdminRaw.toLowerCase() === "true",
      };
    } catch {
      return undefined;
    }
  }

  private async shouldUseAssignedDocumentScope(actor?: AuthUser): Promise<boolean> {
    const resolvedActor = await this.resolveActor(actor);
    if (!resolvedActor || resolvedActor.isAdmin || resolvedActor.customerId) return false;
    const enabled = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      return practiceStaffUsesAssignedDocumentScope(manager, resolvedActor.userId);
    });
    return enabled;
  }

  async getMany(
    req: CrudRequest,
    rawQuery?: Request["query"],
    actor?: AuthUser,
  ): Promise<GetManyDefaultResponse<Job>> {
    const resolvedActor = await this.resolveActor(actor);
    const { parsed, options } = req;
    const query = options.query ?? {};
    const take = this.getTake(parsed, query) ?? query.limit ?? 200;
    const skip = this.getSkip(parsed, take) ?? 0;
    const accountantScoped = await this.shouldUseAssignedDocumentScope(resolvedActor);
    if (accountantScoped) {
      const { data, total } = await this.dataSource.transaction(async (manager) => {
        await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
        await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
        await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
        const qb = manager
          .getRepository(Job)
          .createQueryBuilder("job")
          .leftJoinAndSelect("job.customer", "customer")
          .leftJoinAndSelect("job.file", "file")
          .leftJoinAndSelect("job.document", "document")
          .leftJoinAndSelect("document.folder", "folder");
        this.applyJobAssigneeScope(qb, resolvedActor!.userId);

        const filters = this.mergeJobListFilters(parsed, rawQuery);
        this.applyJobListFilters(qb, filters);
        this.applyLibraryKindFromQuery(qb, rawQuery, { includeLegacyFileJobs: true });
        if (parsed.search) {
          this.applyJobListSearch(qb, parsed.search);
        }

        if (parsed.sort?.length) {
          const s = parsed.sort[0];
          const col = this.repo.metadata.findColumnWithPropertyPath(s.field);
          if (col) {
            qb.orderBy(`job.${s.field}`, s.order === "ASC" ? "ASC" : "DESC");
          } else {
            qb.orderBy("job.createdAt", "DESC");
          }
        } else {
          qb.orderBy("job.createdAt", "DESC");
        }

        qb.skip(skip).take(take);
        const [data, total] = await qb.getManyAndCount();
        return { data, total };
      });
      return this.createPageInfo(data, total, take, skip);
    }

    const qb = this.repo
      .createQueryBuilder("job")
      .leftJoinAndSelect("job.customer", "customer")
      .leftJoinAndSelect("job.file", "file")
      .leftJoinAndSelect("job.document", "document")
      .leftJoinAndSelect("document.folder", "folder");

    const assignedRaw = rawQuery?.assignedOnly;
    const assignedOnlyStr = String(Array.isArray(assignedRaw) ? assignedRaw[0] : assignedRaw ?? "")
      .trim()
      .toLowerCase();
    const assignedOnly =
      assignedOnlyStr === "true" || assignedOnlyStr === "1" || assignedOnlyStr === "yes";
    const legacyFileJobsInScope = Boolean(
      assignedOnly && resolvedActor?.userId && !resolvedActor.isAdmin,
    );
    if (legacyFileJobsInScope) {
      this.applyJobAssigneeScope(qb, resolvedActor!.userId);
    } else {
      qb.where("job.document_id IS NOT NULL");
    }

    const filters = this.mergeJobListFilters(parsed, rawQuery);
    this.applyJobListFilters(qb, filters);
    this.applyLibraryKindFromQuery(qb, rawQuery, {
      includeLegacyFileJobs: legacyFileJobsInScope,
    });
    if (parsed.search) {
      this.applyJobListSearch(qb, parsed.search);
    }

    if (parsed.sort?.length) {
      const s = parsed.sort[0];
      const col = this.repo.metadata.findColumnWithPropertyPath(s.field);
      if (col) {
        qb.orderBy(`job.${s.field}`, s.order === "ASC" ? "ASC" : "DESC");
      } else {
        qb.orderBy("job.createdAt", "DESC");
      }
    } else {
      qb.orderBy("job.createdAt", "DESC");
    }

    qb.skip(skip).take(take);

    const [data, total] = await qb.getManyAndCount();
    return this.createPageInfo(data, total, take, skip);
  }

  /**
   * List filters come from URL `filter=field||op||value` (possibly repeated).
   * `CrudRequestInterceptor` always sets `parsed.search` (wrapped `$and`), so it is not a reliable
   * signal for "client sent `s`". Prefer raw `filter` when present; otherwise use `parsed.filter`
   * (populated when the client omits `s`, while raw query may be transformed).
   */
  private mergeJobListFilters(
    parsed: ParsedRequestParams,
    rawQuery: Request["query"] | undefined
  ): QueryFilter[] {
    const fromRaw = rawQuery ? this.parseRawFilterParams(rawQuery.filter) : [];
    if (fromRaw.length > 0) return fromRaw;
    return parsed.filter ?? [];
  }

  private parseRawFilterParams(
    filter: Request["query"]["filter"] | undefined
  ): QueryFilter[] {
    if (filter === undefined || filter === null) {
      return [];
    }
    const parts = Array.isArray(filter) ? filter : [filter];
    const out: QueryFilter[] = [];
    for (const raw of parts) {
      if (typeof raw !== "string") continue;
      const seg = raw.split("||");
      if (seg.length < 2) continue;
      const field = seg[0];
      const operator = seg[1];
      const value = seg.length > 2 ? seg[2] : "";
      out.push({ field, operator: operator as ComparisonOperator, value });
    }
    return out;
  }

  private applyJobListFilters(qb: ReturnType<Repository<Job>["createQueryBuilder"]>, filters: QueryFilter[]) {
    for (const f of filters) {
      const op = String(f.operator).toLowerCase();
      if (f.field === "status" && op === "$eq" && typeof f.value === "string") {
        if ((Object.values(JobStatus) as string[]).includes(f.value)) {
          qb.andWhere("job.status = :listStatus", { listStatus: f.value });
        }
      }
      if (f.field === "customerId" && op === "$eq" && typeof f.value === "string") {
        qb.andWhere("job.customer_id = :listCustomerId", { listCustomerId: f.value });
      }
    }
  }

  private applyLibraryKindFromQuery(
    qb: ReturnType<Repository<Job>["createQueryBuilder"]>,
    rawQuery: Request["query"] | undefined,
    opts?: { includeLegacyFileJobs?: boolean }
  ) {
    if (!rawQuery) {
      return;
    }
    const raw = rawQuery.libraryKind;
    const rawStr = Array.isArray(raw) ? raw[0] : raw;
    if (typeof rawStr !== "string") {
      return;
    }
    const v = rawStr.trim();
    if (!v || !(Object.values(FolderLibraryKind) as string[]).includes(v)) {
      return;
    }

    /**
     * Filter by folder library kind via EXISTS (same idea as DocumentsAdminService `folder.type`).
     * Cast enum to text so the bound parameter always compares predictably.
     *
     * Default staff/admin list is document-backed jobs only (`document_id` set): use a single EXISTS
     * (no `Brackets` OR) to avoid query-builder edge cases. Assignee / legacy file-backed paths may
     * include jobs with only `file_id`, so keep the OR + EXISTS branch for those.
     */
    const typeMatch = `CAST(f_k.type AS text) = :libraryKind`;
    if (!opts?.includeLegacyFileJobs) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM documents d_k INNER JOIN folders f_k ON f_k.id = d_k.folder_id WHERE d_k.id = job.document_id AND ${typeMatch})`,
        { libraryKind: v },
      );
      return;
    }

    qb.andWhere(
      new Brackets((sub) => {
        sub
          .where(
            `job.document_id IS NOT NULL AND EXISTS (SELECT 1 FROM documents d_k INNER JOIN folders f_k ON f_k.id = d_k.folder_id WHERE d_k.id = job.document_id AND ${typeMatch})`,
            { libraryKind: v },
          )
          .orWhere(
            `(job.document_id IS NULL AND job.file_id IS NOT NULL AND EXISTS (SELECT 1 FROM documents d_lib INNER JOIN folders f_lib ON f_lib.id = d_lib.folder_id WHERE d_lib.customer_id = job.customer_id AND d_lib.metadata->>'fileId' IS NOT NULL AND TRIM(d_lib.metadata->>'fileId') = TRIM(job.file_id::text) AND CAST(f_lib.type AS text) = :libraryKind))`,
            { libraryKind: v },
          );
      }),
    );
  }

  private applyJobListSearch(
    qb: ReturnType<Repository<Job>["createQueryBuilder"]>,
    search: unknown
  ) {
    const term = this.extractContLSearchTerm(search);
    if (!term) return;
    const like = `%${this.escapeLike(term)}%`;
    qb.andWhere(
      new Brackets((sub) => {
        sub
          .where("file.name ILIKE :jobSearchLike ESCAPE '\\'", { jobSearchLike: like })
          .orWhere("customer.name ILIKE :jobSearchLike ESCAPE '\\'", { jobSearchLike: like })
          .orWhere("document.name ILIKE :jobSearchLike ESCAPE '\\'", { jobSearchLike: like });
      })
    );
  }

  /**
   * Supports admin UI `{ $or: [ … ] }` and nestjsx-wrapped `{ $and: [ … ] }` from
   * `CrudRequestInterceptor`.
   */
  private extractContLSearchTerm(search: unknown): string | null {
    if (!search || typeof search !== "object") return null;
    const root = search as Record<string, unknown>;
    if ("$and" in root && Array.isArray(root.$and)) {
      for (const part of root.$and) {
        const t = this.extractContLSearchTerm(part);
        if (t) return t;
      }
      return null;
    }
    if ("$or" in root && Array.isArray(root.$or)) {
      for (const branch of root.$or) {
        const t = this.extractContLSearchTerm(branch);
        if (t) return t;
      }
      return null;
    }
    return this.contLTermFromBranch(root);
  }

  private contLTermFromBranch(branch: unknown): string | null {
    if (!branch || typeof branch !== "object") return null;
    for (const [, cond] of Object.entries(branch as Record<string, unknown>)) {
      if (!cond || typeof cond !== "object") continue;
      const c = cond as Record<string, unknown>;
      const raw =
        (typeof c.$contL === "string" && c.$contL) ||
        (typeof c.$contl === "string" && c.$contl) ||
        (typeof c.contl === "string" && c.contl);
      if (raw && raw.trim()) return raw.trim();
    }
    return null;
  }

  /**
   * Limit jobs to those whose linked library document lists the user in `document_assignees`.
   * When `job.document_id` is set (normal library pipeline), only that document's assignees count —
   * never fall through to the staging-file path, which can otherwise match unrelated assignments.
   */
  private applyJobAssigneeScope(
    qb: ReturnType<Repository<Job>["createQueryBuilder"]>,
    userId: string
  ): void {
    qb.andWhere(
      new Brackets((sub) => {
        sub
          .where(
            `job.document_id IS NOT NULL AND EXISTS (SELECT 1 FROM document_assignees daj WHERE daj.document_id = job.document_id AND daj.user_id = :jobAssigneeUid)`
          )
          .orWhere(
            `job.document_id IS NULL AND job.file_id IS NOT NULL AND EXISTS (SELECT 1 FROM documents d INNER JOIN document_assignees da ON da.document_id = d.id LEFT JOIN folders f ON f.id = d.folder_id WHERE d.metadata->>'fileId' IS NOT NULL AND TRIM(d.metadata->>'fileId') = TRIM(job.file_id::text) AND da.user_id = :jobAssigneeUid AND (d.customer_id = job.customer_id OR f.customer_id = job.customer_id))`
          );
      }),
      { jobAssigneeUid: userId }
    );
  }

  private escapeLike(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  }

  async getOne(req: CrudRequest): Promise<Job> {
    return this.getOneForActor(req);
  }

  async getOneForActor(req: CrudRequest, actor?: AuthUser): Promise<Job> {
    const resolvedActor = await this.resolveActor(actor);
    const id = req.parsed.paramsFilter.find((f) => f.field === "id")?.value;
    if (id === undefined || id === null) {
      this.throwBadRequestException("Missing job id");
    }
    if (await this.shouldUseAssignedDocumentScope(resolvedActor)) {
      const scoped = await this.dataSource.transaction(async (manager) => {
        await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
        await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
        await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
        const qb = manager
          .getRepository(Job)
          .createQueryBuilder("job")
          .leftJoinAndSelect("job.customer", "customer")
          .leftJoinAndSelect("job.file", "file")
          .leftJoinAndSelect("job.document", "document")
          .leftJoinAndSelect("document.folder", "folder")
          .where("job.id = :id", { id: String(id) });
        this.applyJobAssigneeScope(qb, resolvedActor!.userId);
        return qb.getOne();
      });
      if (!scoped) {
        this.log.warn(`[jobs.getOne] assigned-scope miss user=${resolvedActor?.userId ?? "anon"} job=${String(id)}`);
        this.throwNotFoundException(this.alias);
      }
      return scoped!;
    }
    const job = await this.repo.findOne({
      where: { id: String(id) },
      relations: { customer: true, file: true, document: true },
      relationLoadStrategy: "query",
    });
    if (!job) {
      this.log.warn(`[jobs.getOne] default-scope miss user=${resolvedActor?.userId ?? "anon"} job=${String(id)}`);
      this.throwNotFoundException(
        `${this.alias} not found (it may have been deleted with its file or document)`,
      );
    }
    return job!;
  }
}
