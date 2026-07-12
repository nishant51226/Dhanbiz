import { BadRequestException, Injectable, PayloadTooLargeException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { AuthUser } from "../auth/auth.types";
import { DataSource } from "typeorm";
import type { SelectQueryBuilder } from "typeorm";
import { In, Repository } from "typeorm";
import { CustomerFormSubmissionStatus } from "../entities/customer-form-submission.entity";
import { Customer, CustomerAccountStatus } from "../entities/customer.entity";
import {
  buildTabularExportCsv,
  buildTabularExportXlsx,
  customersListExportFilenameBase,
} from "./customer-export.util";
import { summaryExportLabel } from "./customer-summary-export.constants";
import {
  buildCustomerSummaryExportRow,
  normalizeListExportColumnIds,
} from "./customer-summary-export.builder";
import type { LatestSubmissionExport } from "./customers-list-export.mapper";
import type { CustomersListExportBodyDto, CustomersListExportFiltersDto } from "./dto/customers-list-export.dto";
import type { CustomersListExportPreviewBodyDto } from "./dto/customers-list-export-preview.dto";
import { CustomerFormSubmissionsService } from "./customer-form-submissions.service";
import { StaffCustomerAssignmentSyncService } from "./staff-customer-assignment-sync.service.js";
import {
  onboardingDataTextSqlExpr,
  parseOnboardingDashboardSort,
} from "./onboarding-dashboard-sort-fields";

export type CustomerPageSubmissionPayload = {
  id: string;
  status: "draft" | "completed";
  data: Record<string, unknown>;
  updatedAt: string;
};

export type CustomerPageRowDto = {
  id: string;
  name: string;
  accountStatus: CustomerAccountStatus;
  createdAt: string;
  updatedAt: string;
  onboardingData: Record<string, unknown> | null;
  latestFormSubmission: CustomerPageSubmissionPayload | null;
  planId: string | null;
  planName: string | null;
};

export type CustomerPageResponseDto = {
  data: CustomerPageRowDto[];
  total: number;
  page: number;
  pageCount: number;
  limit: number;
};

export type CompaniesHouseDashboardBucketDto = { label: string; count: number };
export type CompaniesHouseDashboardYearBucketDto = { year: string; count: number };

/** Aggregates from `onboarding_data.companies_house` for staff dashboard charts. */
export type CompaniesHouseDashboardAggregatesDto = {
  totalCustomersInScope: number;
  customersWithChSnapshot: number;
  byCompanyStatus: CompaniesHouseDashboardBucketDto[];
  /** Raw CH `type` (e.g. ltd). */
  byChType: CompaniesHouseDashboardBucketDto[];
  /** Friendly `company.type` from onboarding (e.g. Limited company), same scoped rows as CH snapshot. */
  byOnboardingCompanyType: CompaniesHouseDashboardBucketDto[];
  byCreationYear: CompaniesHouseDashboardYearBucketDto[];
  byCessationYear: CompaniesHouseDashboardYearBucketDto[];
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Align with UK onboarding `normalizeChCompanyNumber` in NewCustomerPage.tsx */
function normalizeUkCompanyRegistrationNumber(raw: string): string {
  const t = String(raw ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
  if (!t) return "";
  if (/^\d+$/.test(t)) return t.padStart(8, "0");
  return t;
}

function isPlausibleUkCompanyRegistrationNumber(raw: string): boolean {
  const t = String(raw ?? "")
    .replace(/\s/g, "")
    .toUpperCase();
  if (t.length < 6) return false;
  if (/^\d{6,8}$/.test(t)) return true;
  return /^[A-Z]{2}\d{6}$/.test(t);
}

function parseSort(sortRaw: string | undefined): { field: "name" | "createdAt"; order: "ASC" | "DESC" } {
  const raw = (sortRaw ?? "name,ASC").trim();
  const [f, o] = raw.split(",").map((s) => s.trim());
  const order = o?.toUpperCase() === "DESC" ? "DESC" : "ASC";
  if (f === "createdAt") return { field: "createdAt", order };
  return { field: "name", order };
}

const MAX_LIST_EXPORT_ROWS = 10_000;

/** `YYYY-MM-DD` → UTC day bounds; otherwise `Date.parse`. */
function parseRangeBound(raw: string | undefined, endOfDay: boolean): Date | null {
  const s = raw?.trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
    if (endOfDay) return new Date(Date.UTC(y, mo, d, 23, 59, 59, 999));
    return new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Raw SQL list paths do not use TypeORM soft-delete filtering. */
const CUSTOMER_NOT_ARCHIVED_SQL = "c.deleted_at IS NULL";

function applyAccountStatusFiltersToQb(
  qb: SelectQueryBuilder<Customer>,
  filters: CustomersListExportFiltersDto | undefined,
): void {
  const f = filters ?? {};
  const statusIn = f.accountStatusIn?.filter(Boolean);
  if (statusIn && statusIn.length > 0) {
    qb.andWhere("c.accountStatus IN (:...accountStatusIn)", { accountStatusIn: statusIn });
    return;
  }
  const accountStatus = f.accountStatus ?? "all";
  if (accountStatus !== "all") {
    qb.andWhere("c.accountStatus = :accountStatus", { accountStatus });
  }
}

function applyAccountStatusFiltersToRawSql(
  where: string[],
  paramsArr: unknown[],
  filters: CustomersListExportFiltersDto | undefined,
): void {
  const f = filters ?? {};
  const statusIn = f.accountStatusIn?.filter(Boolean);
  if (statusIn && statusIn.length > 0) {
    paramsArr.push(statusIn);
    where.push(`c.account_status = ANY($${paramsArr.length}::customers_account_status_enum[])`);
    return;
  }
  const accountStatus = f.accountStatus ?? "all";
  if (accountStatus !== "all") {
    paramsArr.push(accountStatus);
    where.push(`c.account_status = $${paramsArr.length}`);
  }
}

function applyExportFiltersToQb(
  qb: SelectQueryBuilder<Customer>,
  filters: CustomersListExportFiltersDto | undefined,
): void {
  const f = filters ?? {};
  const search = f.search?.trim();
  if (search) {
    qb.andWhere("c.name ILIKE :s", { s: `%${search}%` });
  }

  const cf = parseRangeBound(f.createdFrom, false);
  if (cf) qb.andWhere("c.createdAt >= :createdFrom", { createdFrom: cf });
  const ct = parseRangeBound(f.createdTo, true);
  if (ct) qb.andWhere("c.createdAt <= :createdTo", { createdTo: ct });

  const uf = parseRangeBound(f.updatedFrom, false);
  if (uf) qb.andWhere("c.updatedAt >= :updatedFrom", { updatedFrom: uf });
  const ut = parseRangeBound(f.updatedTo, true);
  if (ut) qb.andWhere("c.updatedAt <= :updatedTo", { updatedTo: ut });

  const formStatus = f.formStatus ?? "all";
  const completed = CustomerFormSubmissionStatus.completed;
  if (formStatus === "completed") {
    qb.andWhere(
      `EXISTS (
          SELECT 1 FROM (
            SELECT DISTINCT ON (customer_id) customer_id, status
            FROM customer_form_submission
            WHERE customer_id = c.id
            ORDER BY customer_id, updated_at DESC
          ) latest
          WHERE latest.status = :completedStatus
        )`,
      { completedStatus: completed },
    );
  } else if (formStatus === "draft") {
    qb.andWhere(
      `NOT EXISTS (
          SELECT 1 FROM (
            SELECT DISTINCT ON (customer_id) customer_id, status
            FROM customer_form_submission
            WHERE customer_id = c.id
            ORDER BY customer_id, updated_at DESC
          ) latest
          WHERE latest.status = :completedStatus
        )`,
      { completedStatus: completed },
    );
  }

  applyAccountStatusFiltersToQb(qb, f);
}

function applyCustomerListFiltersToRawSql(
  where: string[],
  paramsArr: unknown[],
  filters: CustomersListExportFiltersDto | undefined,
): void {
  where.push(CUSTOMER_NOT_ARCHIVED_SQL);
  const f = filters ?? {};
  const search = f.search?.trim();
  if (search) {
    paramsArr.push(`%${search}%`);
    where.push(`c.name ILIKE $${paramsArr.length}`);
  }

  const cf = parseRangeBound(f.createdFrom, false);
  if (cf) {
    paramsArr.push(cf);
    where.push(`c.created_at >= $${paramsArr.length}`);
  }
  const ct = parseRangeBound(f.createdTo, true);
  if (ct) {
    paramsArr.push(ct);
    where.push(`c.created_at <= $${paramsArr.length}`);
  }

  const uf = parseRangeBound(f.updatedFrom, false);
  if (uf) {
    paramsArr.push(uf);
    where.push(`c.updated_at >= $${paramsArr.length}`);
  }
  const ut = parseRangeBound(f.updatedTo, true);
  if (ut) {
    paramsArr.push(ut);
    where.push(`c.updated_at <= $${paramsArr.length}`);
  }

  const formStatus = f.formStatus ?? "all";
  const completed = CustomerFormSubmissionStatus.completed;
  if (formStatus === "completed") {
    where.push(
      `EXISTS (
          SELECT 1 FROM (
            SELECT DISTINCT ON (customer_id) customer_id, status
            FROM customer_form_submission
            WHERE customer_id = c.id
            ORDER BY customer_id, updated_at DESC
          ) latest
          WHERE latest.status = '${completed}'
        )`,
    );
  } else if (formStatus === "draft") {
    where.push(
      `NOT EXISTS (
          SELECT 1 FROM (
            SELECT DISTINCT ON (customer_id) customer_id, status
            FROM customer_form_submission
            WHERE customer_id = c.id
            ORDER BY customer_id, updated_at DESC
          ) latest
          WHERE latest.status = '${completed}'
        )`,
    );
  }

  applyAccountStatusFiltersToRawSql(where, paramsArr, f);
}

@Injectable()
export class CustomersPageService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
    private readonly formSubmissions: CustomerFormSubmissionsService,
    private readonly dataSource: DataSource,
    private readonly staffAssignmentSync: StaffCustomerAssignmentSyncService,
  ) {}

  private async assignedCustomerIdsForStaffUser(userId: string): Promise<string[]> {
    const rows = (await this.customers.query(
      `
      SELECT customer_id AS "customerId"
      FROM staff_customer_assignments
      WHERE staff_user_id = $1
      `,
      [userId],
    )) as Array<{ customerId: string }>;
    return [...new Set(rows.map((r) => String(r.customerId ?? "").trim()).filter(Boolean))];
  }

  private async applyStaffScopeFilter(qb: SelectQueryBuilder<Customer>, user?: AuthUser): Promise<boolean> {
    if (!user || user.isAdmin) return false;
    if (user.customerId) {
      qb.andWhere("c.id = :portalCustomerId", { portalCustomerId: user.customerId });
      return false;
    }
    const rows = (await this.customers.query(
      `
      SELECT customer_id AS "customerId"
      FROM staff_customer_assignments
      WHERE staff_user_id = $1
      `,
      [user.userId],
    )) as Array<{ customerId: string }>;
    const assignedIds = [...new Set(rows.map((r) => String(r.customerId ?? "").trim()).filter(Boolean))];
    if (assignedIds.length === 0) {
      return true;
    }
    qb.andWhere("c.id IN (:...assignedIds)", { assignedIds });
    return false;
  }

  async findPageWithLatestSubmission(params: {
    user?: AuthUser;
    page: number;
    limit: number;
    sort?: string;
    /** e.g. `company.number,DESC` — see GET /customers/onboarding-dashboard-sort-fields */
    onboardingSort?: string;
    /** Legacy name search; merged into `filters.search` when set. */
    search?: string;
    filters?: CustomersListExportFiltersDto;
  }): Promise<CustomerPageResponseDto> {
    const page = clampInt(params.page, 1, 1_000_000);
    const limit = clampInt(params.limit, 1, 100);
    const skip = (page - 1) * limit;
    const { field, order } = parseSort(params.sort);
    const onboardingOrder = parseOnboardingDashboardSort(params.onboardingSort);
    const filters: CustomersListExportFiltersDto = {
      ...(params.filters ?? {}),
      search: params.search?.trim() || params.filters?.search?.trim() || undefined,
    };

    await this.staffAssignmentSync.syncAllCustomersForPracticeStaffIfPermitted(params.user);

    if (params.user && !params.user.isAdmin && !params.user.customerId) {
      const assignedIds = await this.assignedCustomerIdsForStaffUser(params.user.userId);
      if (assignedIds.length === 0) {
        return { data: [], total: 0, page, pageCount: 1, limit };
      }
      const sortCol = field === "createdAt" ? "created_at" : "name";
      const orderBySql = onboardingOrder
        ? `${onboardingDataTextSqlExpr("c", onboardingOrder.path)} ${onboardingOrder.order} NULLS LAST, c.name ASC`
        : `c.${sortCol} ${order}`;
      const pageRows = await this.dataSource.transaction(async (manager) => {
        // Explicitly bypass RLS for this read path; scoping is enforced by assignedIds filter below.
        await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
        await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
        await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);

        const where: string[] = [`c.id = ANY($1::uuid[])`];
        const paramsArr: unknown[] = [assignedIds];
        applyCustomerListFiltersToRawSql(where, paramsArr, filters);
        const whereSql = where.join(" AND ");
        const totalRows = (await manager.query(
          `SELECT COUNT(*)::int AS "total" FROM customers c WHERE ${whereSql}`,
          paramsArr,
        )) as Array<{ total: number }>;
        const total = Number(totalRows[0]?.total ?? 0);

        const limitPos = paramsArr.length + 1;
        const offsetPos = paramsArr.length + 2;
        const rows = (await manager.query(
          `
          SELECT
            c.id,
            c.name,
            c.account_status AS "accountStatus",
            c.created_at AS "createdAt",
            c.updated_at AS "updatedAt",
            c.onboarding_data AS "onboardingData",
            c.plan_id AS "planId",
            p.name AS "planName"
          FROM customers c
          LEFT JOIN plans p ON p.id = c.plan_id
          WHERE ${whereSql}
          ORDER BY ${orderBySql}
          LIMIT $${limitPos}
          OFFSET $${offsetPos}
          `,
          [...paramsArr, limit, skip],
        )) as Array<{
          id: string;
          name: string;
          accountStatus: CustomerAccountStatus;
          createdAt: string | Date;
          updatedAt: string | Date;
          onboardingData: Record<string, unknown> | null;
          planId: string | null;
          planName: string | null;
        }>;
        return { rows, total };
      });

      const ids = pageRows.rows.map((r) => r.id);
      const latestByCustomer = await this.formSubmissions.getLatestWithDataByCustomerIds(ids);
      const data: CustomerPageRowDto[] = pageRows.rows.map((c) => {
        const sub = latestByCustomer.get(c.id);
        return {
          id: c.id,
          name: c.name,
          accountStatus: c.accountStatus ?? CustomerAccountStatus.draft,
          createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
          updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : String(c.updatedAt),
          onboardingData: c.onboardingData ?? null,
          planId: c.planId ?? null,
          planName: typeof c.planName === "string" && c.planName.trim() ? c.planName.trim() : null,
          latestFormSubmission: sub
            ? {
                id: sub.id,
                status: sub.status,
                data: sub.data,
                updatedAt: sub.updatedAt,
              }
            : null,
        };
      });
      const pageCount = Math.max(1, Math.ceil(pageRows.total / limit));
      return { data, total: pageRows.total, page, pageCount, limit };
    }

    const probeQb = this.customers.createQueryBuilder("c");
    const noAssignments = await this.applyStaffScopeFilter(probeQb, params.user);
    if (noAssignments) {
      return { data: [], total: 0, page, pageCount: 1, limit };
    }

    const runAdminScopedList = async (manager: DataSource["manager"]) => {
      const qb = manager.getRepository(Customer).createQueryBuilder("c");
      await this.applyStaffScopeFilter(qb, params.user);
      applyExportFiltersToQb(qb, filters);
      const total = await qb.clone().getCount();
      qb.leftJoinAndSelect("c.plan", "plan");
      if (onboardingOrder) {
        const expr = onboardingDataTextSqlExpr("c", onboardingOrder.path);
        qb.addSelect(expr, "onboarding_sort_key");
        qb.orderBy("onboarding_sort_key", onboardingOrder.order, "NULLS LAST").addOrderBy("c.name", "ASC");
      } else {
        qb.orderBy(`c.${field}`, order);
      }
      qb.skip(skip).take(limit);
      const list = await qb.getMany();
      return { list, total };
    };

    const pageResult = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      return runAdminScopedList(manager);
    });

    const { list, total } = pageResult;

    const ids = list.map((c) => c.id);
    const latestByCustomer = await this.formSubmissions.getLatestWithDataByCustomerIds(ids);

    const data: CustomerPageRowDto[] = list.map((c) => {
      const sub = latestByCustomer.get(c.id);
      return {
        id: c.id,
        name: c.name,
        accountStatus: c.accountStatus ?? CustomerAccountStatus.draft,
        createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
        updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : String(c.updatedAt),
        onboardingData: c.onboardingData ?? null,
        planId: c.planId ?? null,
        planName:
          typeof c.plan?.name === "string" && c.plan.name.trim() ? c.plan.name.trim() : null,
        latestFormSubmission: sub
          ? {
              id: sub.id,
              status: sub.status,
              data: sub.data,
              updatedAt: sub.updatedAt,
            }
          : null,
      };
    });

    const pageCount = Math.max(1, Math.ceil(total / limit));
    return { data, total, page, pageCount, limit };
  }

  async exportFilteredList(body: CustomersListExportBodyDto, user?: AuthUser): Promise<{
    buffer: Buffer;
    contentType: string;
    filename: string;
  }> {
    const columnKeys = normalizeListExportColumnIds(body.columns);
    if (columnKeys.length === 0) {
      throw new BadRequestException("Select at least one valid column to export.");
    }

    await this.staffAssignmentSync.syncAllCustomersForPracticeStaffIfPermitted(user);

    const qb = this.customers.createQueryBuilder("c");
    const noAssignments = await this.applyStaffScopeFilter(qb, user);
    if (noAssignments) {
      const hdrs = columnKeys.map((k) => summaryExportLabel(k));
      const base = customersListExportFilenameBase();
      if (body.format === "xlsx") {
        const buffer = await buildTabularExportXlsx(hdrs, []);
        return {
          buffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          filename: `${base}.xlsx`,
        };
      }
      const buffer = buildTabularExportCsv(hdrs, []);
      return {
        buffer,
        contentType: "text/csv; charset=utf-8",
        filename: `${base}.csv`,
      };
    }
    applyExportFiltersToQb(qb, body.filters);

    const count = await qb.clone().getCount();
    if (count > MAX_LIST_EXPORT_ROWS) {
      throw new PayloadTooLargeException(
        `Too many rows (${count}). Narrow filters (max ${MAX_LIST_EXPORT_ROWS} per export).`,
      );
    }

    qb.orderBy("c.name", "ASC");
    const list = await qb.getMany();
    const ids = list.map((row) => row.id);
    const latestByCustomer = await this.formSubmissions.getLatestWithDataByCustomerIds(ids);
    const enriched =
      ids.length > 0
        ? await this.customers.find({
            where: { id: In(ids) },
            relations: { plan: true, customerUsers: { user: true } },
          })
        : [];
    const byId = new Map(enriched.map((e) => [e.id, e]));

    const rows: string[][] = [];
    let headers: string[] | null = null;
    for (const c of list) {
      const full = byId.get(c.id) ?? c;
      const sub = latestByCustomer.get(c.id);
      const latest: LatestSubmissionExport = sub ? { status: sub.status, data: sub.data } : null;
      const { headers: h, values } = buildCustomerSummaryExportRow(full, latest, columnKeys);
      headers = h;
      rows.push(values);
    }

    const hdrs = headers ?? columnKeys.map((k) => summaryExportLabel(k));
    const base = customersListExportFilenameBase();
    if (body.format === "xlsx") {
      const buffer = await buildTabularExportXlsx(hdrs, rows);
      return {
        buffer,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename: `${base}.xlsx`,
      };
    }
    const buffer = buildTabularExportCsv(hdrs, rows);
    return {
      buffer,
      contentType: "text/csv; charset=utf-8",
      filename: `${base}.csv`,
    };
  }

  async previewExportList(body: CustomersListExportPreviewBodyDto, user?: AuthUser): Promise<{
    total: number;
    exportCap: number;
    exceedsExportCap: boolean;
    previewRowLimit: number;
    previewTruncated: boolean;
    matchingCustomers: { id: string; name: string }[];
    matchingCustomersTruncated: boolean;
    headers: string[];
    rows: string[][];
  }> {
    const columnKeys = normalizeListExportColumnIds(body.columns);
    if (columnKeys.length === 0) {
      throw new BadRequestException("Select at least one valid column to export.");
    }

    await this.staffAssignmentSync.syncAllCustomersForPracticeStaffIfPermitted(user);

    const qb = this.customers.createQueryBuilder("c");
    const noAssignments = await this.applyStaffScopeFilter(qb, user);
    if (noAssignments) {
      return {
        total: 0,
        exportCap: MAX_LIST_EXPORT_ROWS,
        exceedsExportCap: false,
        previewRowLimit: Math.min(100, Math.max(1, body.previewRowLimit ?? 40)),
        previewTruncated: false,
        matchingCustomers: [],
        matchingCustomersTruncated: false,
        headers: columnKeys.map((k) => summaryExportLabel(k)),
        rows: [],
      };
    }
    applyExportFiltersToQb(qb, body.filters);
    const total = await qb.clone().getCount();

    const nameLimit = Math.min(200, Math.max(1, body.matchingNameLimit ?? 120));
    const rowLimit = Math.min(100, Math.max(1, body.previewRowLimit ?? 40));

    const matchingCustomers = await qb
      .clone()
      .select(["c.id", "c.name"])
      .orderBy("c.name", "ASC")
      .take(nameLimit)
      .getMany();
    const matchingCustomersTruncated = total > nameLimit;

    const list = await qb.clone().orderBy("c.name", "ASC").take(rowLimit).getMany();
    const previewTruncated = total > rowLimit;
    const ids = list.map((row) => row.id);
    const latestByCustomer = await this.formSubmissions.getLatestWithDataByCustomerIds(ids);
    const enriched =
      ids.length > 0
        ? await this.customers.find({
            where: { id: In(ids) },
            relations: { plan: true, customerUsers: { user: true } },
          })
        : [];
    const byId = new Map(enriched.map((e) => [e.id, e]));

    const rows: string[][] = [];
    let headers: string[] | null = null;
    for (const c of list) {
      const full = byId.get(c.id) ?? c;
      const sub = latestByCustomer.get(c.id);
      const latest: LatestSubmissionExport = sub ? { status: sub.status, data: sub.data } : null;
      const { headers: h, values } = buildCustomerSummaryExportRow(full, latest, columnKeys);
      headers = h;
      rows.push(values);
    }

    return {
      total,
      exportCap: MAX_LIST_EXPORT_ROWS,
      exceedsExportCap: total > MAX_LIST_EXPORT_ROWS,
      previewRowLimit: rowLimit,
      previewTruncated,
      matchingCustomers: matchingCustomers.map((r) => ({ id: r.id, name: r.name })),
      matchingCustomersTruncated,
      headers: headers ?? columnKeys.map((k) => summaryExportLabel(k)),
      rows,
    };
  }

  /**
   * Scope matches customer list: all customers for admin; assigned customers for practice staff;
   * single customer for portal-scoped JWT (unusual on this route).
   */
  async getCompaniesHouseDashboardAggregates(user?: AuthUser): Promise<CompaniesHouseDashboardAggregatesDto> {
    const empty: CompaniesHouseDashboardAggregatesDto = {
      totalCustomersInScope: 0,
      customersWithChSnapshot: 0,
      byCompanyStatus: [],
      byChType: [],
      byOnboardingCompanyType: [],
      byCreationYear: [],
      byCessationYear: [],
    };

    await this.staffAssignmentSync.syncAllCustomersForPracticeStaffIfPermitted(user);

    let clause = CUSTOMER_NOT_ARCHIVED_SQL;
    const params: unknown[] = [];
    if (user && !user.isAdmin) {
      if (user.customerId) {
        clause = `${CUSTOMER_NOT_ARCHIVED_SQL} AND c.id = $1::uuid`;
        params.push(user.customerId);
      } else {
        const ids = await this.assignedCustomerIdsForStaffUser(user.userId);
        if (ids.length === 0) return empty;
        clause = `${CUSTOMER_NOT_ARCHIVED_SQL} AND c.id = ANY($1::uuid[])`;
        params.push(ids);
      }
    }

    const q = async (sql: string, p: unknown[]) => this.dataSource.query(sql, p) as Promise<Array<Record<string, unknown>>>;

    const totalRows = await q(`SELECT COUNT(*)::int AS n FROM customers c WHERE ${clause}`, [...params]);
    const totalCustomersInScope = Number((totalRows[0] as { n?: number })?.n ?? 0);

    const chRows = await q(
      `SELECT COUNT(*)::int AS n FROM customers c WHERE ${clause} AND (c.onboarding_data->'companies_house') IS NOT NULL`,
      [...params],
    );
    const customersWithChSnapshot = Number((chRows[0] as { n?: number })?.n ?? 0);

    const statusRows = await q(
      `
      SELECT
        COALESCE(NULLIF(trim(c.onboarding_data->'companies_house'->>'company_status'), ''), '(unknown)') AS label,
        COUNT(*)::int AS count
      FROM customers c
      WHERE ${clause} AND (c.onboarding_data->'companies_house') IS NOT NULL
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 40
      `,
      [...params],
    );

    const typeRows = await q(
      `
      SELECT
        COALESCE(NULLIF(trim(c.onboarding_data->'companies_house'->>'type'), ''), '(unknown)') AS label,
        COUNT(*)::int AS count
      FROM customers c
      WHERE ${clause} AND (c.onboarding_data->'companies_house') IS NOT NULL
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 40
      `,
      [...params],
    );

    const displayTypeRows = await q(
      `
      SELECT
        COALESCE(NULLIF(trim(c.onboarding_data->'company'->>'type'), ''), '(unknown)') AS label,
        COUNT(*)::int AS count
      FROM customers c
      WHERE ${clause} AND (c.onboarding_data->'companies_house') IS NOT NULL
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 40
      `,
      [...params],
    );

    const creationRows = await q(
      `
      SELECT y AS year, COUNT(*)::int AS count
      FROM (
        SELECT LEFT(trim(c.onboarding_data->'companies_house'->>'date_of_creation'), 4) AS y
        FROM customers c
        WHERE ${clause}
          AND (c.onboarding_data->'companies_house') IS NOT NULL
          AND (c.onboarding_data->'companies_house'->>'date_of_creation') ~ '^[0-9]{4}-'
      ) t
      WHERE t.y ~ '^[0-9]{4}$' AND LENGTH(t.y) = 4
      GROUP BY y
      ORDER BY y ASC
      `,
      [...params],
    );

    const cessationRows = await q(
      `
      SELECT y AS year, COUNT(*)::int AS count
      FROM (
        SELECT LEFT(trim(c.onboarding_data->'companies_house'->>'date_of_cessation'), 4) AS y
        FROM customers c
        WHERE ${clause}
          AND (c.onboarding_data->'companies_house') IS NOT NULL
          AND (c.onboarding_data->'companies_house'->>'date_of_cessation') ~ '^[0-9]{4}-'
      ) t
      WHERE t.y ~ '^[0-9]{4}$' AND LENGTH(t.y) = 4
      GROUP BY y
      ORDER BY y ASC
      `,
      [...params],
    );

    const mapBuckets = (rows: Array<Record<string, unknown>>): CompaniesHouseDashboardBucketDto[] =>
      rows.map((r) => ({
        label: String(r.label ?? ""),
        count: Number(r.count ?? 0),
      }));

    const mapYears = (rows: Array<Record<string, unknown>>): CompaniesHouseDashboardYearBucketDto[] =>
      rows.map((r) => ({
        year: String(r.year ?? ""),
        count: Number(r.count ?? 0),
      }));

    return {
      totalCustomersInScope,
      customersWithChSnapshot,
      byCompanyStatus: mapBuckets(statusRows),
      byChType: mapBuckets(typeRows),
      byOnboardingCompanyType: mapBuckets(displayTypeRows),
      byCreationYear: mapYears(creationRows),
      byCessationYear: mapYears(cessationRows),
    };
  }

  /**
   * Detects whether another customer already uses this Companies House-style registration number
   * in `customers.onboarding_data` or any `customer_form_submission.data` row.
   */
  async findCompanyRegistrationConflict(
    numberRaw: string,
    excludeCustomerId?: string | null,
  ): Promise<{ conflict: boolean; customerId?: string; customerName?: string }> {
    const norm = normalizeUkCompanyRegistrationNumber(numberRaw);
    if (!norm || !isPlausibleUkCompanyRegistrationNumber(numberRaw)) {
      return { conflict: false };
    }
    let exclude: string | null = null;
    const ex = String(excludeCustomerId ?? "").trim();
    if (ex.length > 0 && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ex)) {
      exclude = ex.toLowerCase();
    }

    const sql = `
      SELECT x.id::text AS "id", x.name::text AS "name"
      FROM (
        SELECT c.id, c.name
        FROM customers c
        WHERE c.deleted_at IS NULL
          AND ($2::uuid IS NULL OR c.id <> $2::uuid)
          AND c.onboarding_data IS NOT NULL
          AND (
            (CASE
              WHEN NULLIF(TRIM(COALESCE(c.onboarding_data->'company'->>'number', '')), '') IS NULL THEN NULL
              WHEN regexp_replace(upper(trim(c.onboarding_data->'company'->>'number')), '[[:space:]]', '', 'g') ~ '^[0-9]+$'
                THEN lpad(regexp_replace(upper(trim(c.onboarding_data->'company'->>'number')), '[[:space:]]', '', 'g'), 8, '0')
              ELSE NULLIF(regexp_replace(upper(trim(c.onboarding_data->'company'->>'number')), '[[:space:]]', '', 'g'), '')
            END) = $1::text
            OR (CASE
              WHEN NULLIF(TRIM(COALESCE(c.onboarding_data->'companies_house'->>'company_number', '')), '') IS NULL THEN NULL
              WHEN regexp_replace(upper(trim(c.onboarding_data->'companies_house'->>'company_number')), '[[:space:]]', '', 'g') ~ '^[0-9]+$'
                THEN lpad(regexp_replace(upper(trim(c.onboarding_data->'companies_house'->>'company_number')), '[[:space:]]', '', 'g'), 8, '0')
              ELSE NULLIF(regexp_replace(upper(trim(c.onboarding_data->'companies_house'->>'company_number')), '[[:space:]]', '', 'g'), '')
            END) = $1::text
          )
        UNION ALL
        SELECT cfs.customer_id AS id, cu.name
        FROM customer_form_submission cfs
        INNER JOIN customers cu ON cu.id = cfs.customer_id
        WHERE cu.deleted_at IS NULL
          AND ($2::uuid IS NULL OR cfs.customer_id <> $2::uuid)
          AND cfs.data IS NOT NULL
          AND (
            (CASE
              WHEN NULLIF(TRIM(COALESCE(cfs.data->'company'->>'number', '')), '') IS NULL THEN NULL
              WHEN regexp_replace(upper(trim(cfs.data->'company'->>'number')), '[[:space:]]', '', 'g') ~ '^[0-9]+$'
                THEN lpad(regexp_replace(upper(trim(cfs.data->'company'->>'number')), '[[:space:]]', '', 'g'), 8, '0')
              ELSE NULLIF(regexp_replace(upper(trim(cfs.data->'company'->>'number')), '[[:space:]]', '', 'g'), '')
            END) = $1::text
            OR (CASE
              WHEN NULLIF(TRIM(COALESCE(cfs.data->'companies_house'->>'company_number', '')), '') IS NULL THEN NULL
              WHEN regexp_replace(upper(trim(cfs.data->'companies_house'->>'company_number')), '[[:space:]]', '', 'g') ~ '^[0-9]+$'
                THEN lpad(regexp_replace(upper(trim(cfs.data->'companies_house'->>'company_number')), '[[:space:]]', '', 'g'), 8, '0')
              ELSE NULLIF(regexp_replace(upper(trim(cfs.data->'companies_house'->>'company_number')), '[[:space:]]', '', 'g'), '')
            END) = $1::text
          )
      ) x
      LIMIT 1
    `;

    const rows = (await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT set_config('app.is_admin', $1, true)`, ["1"]);
      await manager.query(`SELECT set_config('app.customer_id', $1, true)`, [""]);
      await manager.query(`SELECT set_config('app.user_id', $1, true)`, [""]);
      return manager.query(sql, [norm, exclude]);
    })) as Array<{ id: string; name: string }>;

    const hit = rows[0];
    if (!hit?.id) return { conflict: false };
    return { conflict: true, customerId: hit.id, customerName: hit.name };
  }
}
