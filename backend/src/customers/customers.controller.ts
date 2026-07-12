import {
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Crud, CrudController, CrudRequest, Override, ParsedRequest } from "@nestjsx/crud";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequireAnyPermission, RequirePermission } from "../auth/require-permission.decorator";
import { Customer } from "../entities/customer.entity";
import { CUSTOMER_SUMMARY_EXPORT_CATALOG } from "./customer-summary-export.constants";
import { CustomersService } from "./customers.service";
import { CustomerSummaryExportColumnsDto, CustomerSummaryExportFileDto } from "./dto/customer-summary-export.dto";
import { ExportCustomerDto } from "./dto/export-customer.dto";
import { isRlsTenantDebugEnabled } from "../tenant/rls-tenant-debug.util";

/** Nestjsx CRUD mixins attach `*Base` methods at runtime; TS does not see them on the class. */
type CrudHost = Record<string, (...args: unknown[]) => unknown>;

/** Portal JWTs carry `customerId`; those actors must not change matrix plan assignment (staff-only). */
function customerWriteDtoWithoutPlanIfPortalScoped<T extends object>(dto: T, user: AuthUser | undefined): T {
  if (!user?.customerId || user.isAdmin) return dto;
  const copy = { ...(dto as Record<string, unknown>) };
  delete copy.planId;
  delete copy.plan;
  return copy as T;
}

@ApiBearerAuth("bearer")
@Crud({
  model: { type: Customer },
  params: {
    id: {
      field: "id",
      type: "uuid",
      primary: true,
    },
  },
  /**
   * Do not eager-join `plan` here: nestjsx + TypeORM can emit SQL where
   * `"Customer_id"` is ambiguous once joins are expanded (Postgres error).
   * List rows still include `planId` on `customers`; use `GET /customers/:id`
   * for nested `plan` (matrix bundle) / `portalUsers`.
   */
})
@Controller("customers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController implements CrudController<Customer> {
  private readonly log = new Logger(CustomersController.name);

  constructor(public service: CustomersService) {}

  /** Static column definitions for customer summary export (labels + default selection). */
  @Get("summary-export-catalog")
  @ApiOperation({ summary: "Customer summary export column catalog" })
  @RequirePermission("customer:read")
  summaryExportCatalog() {
    return { columns: [...CUSTOMER_SUMMARY_EXPORT_CATALOG] };
  }

  /** Wide export: header row = flattened keys, second row = values (`format=csv` default, `format=xlsx`). */
  @Get(":id/export")
  @ApiOperation({
    summary: "Export customer (CSV or XLSX)",
    description:
      "Returns a two-row file: first row is sorted dot-notation keys from the same payload as GET /customers/:id; second row is values.",
  })
  @RequirePermission("customer:read")
  async exportCustomer(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("format") formatRaw?: string
  ): Promise<StreamableFile> {
    const fmt = formatRaw?.trim().toLowerCase() === "xlsx" ? "xlsx" : "csv";
    const { buffer, contentType, filename } = await this.service.exportCustomerFile(id, fmt);
    return new StreamableFile(buffer, {
      type: contentType,
      disposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
    });
  }

  /** Same file as GET …/export when `columns` is omitted; otherwise only selected flattened keys (in request order). */
  @Post(":id/export")
  @ApiOperation({
    summary: "Export customer with column selection (CSV or XLSX)",
    description:
      "Body: `format` and optional `columns` (dot-notation keys). When `columns` is omitted or empty, all keys are exported like GET …/export.",
  })
  @RequirePermission("customer:read")
  async exportCustomerWithColumns(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: ExportCustomerDto
  ): Promise<StreamableFile> {
    const fmt = body.format === "xlsx" ? "xlsx" : "csv";
    const { buffer, contentType, filename } = await this.service.exportCustomerFile(id, fmt, body.columns);
    return new StreamableFile(buffer, {
      type: contentType,
      disposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
    });
  }

  @Post(":id/summary-export-preview")
  @ApiOperation({ summary: "Preview customer summary export (human headers + one row)" })
  @RequirePermission("customer:read")
  async summaryExportPreview(@Param("id", ParseUUIDPipe) id: string, @Body() body: CustomerSummaryExportColumnsDto) {
    return this.service.getCustomerSummaryExportRow(id, body.columns);
  }

  @Post(":id/summary-export")
  @ApiOperation({ summary: "Download customer summary CSV or XLSX" })
  @RequirePermission("customer:read")
  async summaryExportFile(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: CustomerSummaryExportFileDto
  ): Promise<StreamableFile> {
    const fmt = body.format === "xlsx" ? "xlsx" : "csv";
    const { buffer, contentType, filename } = await this.service.exportCustomerSummaryFile(id, fmt, body.columns);
    return new StreamableFile(buffer, {
      type: contentType,
      disposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
    });
  }

  @Override("getManyBase")
  @RequirePermission("customer:read")
  async getMany(@ParsedRequest() req: CrudRequest, @Req() httpReq: Request) {
    const result = (await (this as unknown as CrudHost).getManyBase(req)) as {
      data?: unknown[];
      total?: number;
      count?: number;
    };
    if (isRlsTenantDebugEnabled()) {
      const user = (httpReq as Request & { user?: AuthUser }).user;
      const n = Array.isArray(result?.data) ? result.data.length : null;
      const total = result?.total ?? result?.count;
      this.log.log(
        `[RLS_TENANT_DEBUG] GET /customers list page_size=${n ?? "?"} total=${total ?? "?"} actor=${JSON.stringify({
          isAdmin: Boolean(user?.isAdmin),
          customerId: user?.customerId ? `${String(user.customerId).slice(0, 8)}…` : null,
          userId: user?.userId ? `${String(user.userId).slice(0, 8)}…` : null,
        })}`,
      );
    }
    return result;
  }

  @Override("getOneBase")
  @ApiTags("admin_portal-customer")
  @ApiOperation({
    summary: "Get customer by id",
    description: "Used to see customer detail.",
  })
  @RequireAnyPermission("customer:read", "portal:file:read", "portal:file:write", "portal:subscription_plan:read")
  async getOne(@ParsedRequest() req: CrudRequest, @Req() httpReq: Request) {
    const id = String((httpReq.params as Record<string, string | undefined>)?.id ?? "").trim();
    if (id) {
      const actor = (httpReq as Request & { user?: AuthUser }).user;
      const detail = await this.service.findOneDetailForApi(id, actor);
      if (detail) return detail;
      throw new NotFoundException("Customer not found");
    }
    return (this as unknown as CrudHost).getOneBase(req);
  }

  @Override("createOneBase")
  @RequirePermission("customer:write")
  createOne(
    @ParsedRequest() req: CrudRequest,
    @Body() dto: Customer,
    @Req() httpReq: Request & { user?: AuthUser },
  ) {
    return this.service.createOne(req, dto, httpReq.user);
  }

  @Override("createManyBase")
  @RequirePermission("customer:write")
  createMany(@ParsedRequest() req: CrudRequest, @Body() dto: unknown) {
    return (this as unknown as CrudHost).createManyBase(req, dto);
  }

  @Override("updateOneBase")
  @RequirePermission("customer:write")
  updateOne(@ParsedRequest() req: CrudRequest, @Body() dto: Customer, @Req() httpReq: Request) {
    const user = (httpReq as Request & { user?: AuthUser }).user;
    const body = customerWriteDtoWithoutPlanIfPortalScoped(dto, user);
    return (this as unknown as CrudHost).updateOneBase(req, body);
  }

  @Override("replaceOneBase")
  @RequirePermission("customer:write")
  replaceOne(@ParsedRequest() req: CrudRequest, @Body() dto: Customer, @Req() httpReq: Request) {
    const user = (httpReq as Request & { user?: AuthUser }).user;
    const body = customerWriteDtoWithoutPlanIfPortalScoped(dto, user);
    return (this as unknown as CrudHost).replaceOneBase(req, body);
  }

  @Override("deleteOneBase")
  @ApiOperation({
    summary: "Archive (soft-delete) a draft customer",
    description:
      "Sets `deleted_at` on the customer row. Only customers with `account_status` = `draft` can be archived; others return 400.",
  })
  @RequirePermission("customer:write")
  deleteOne(@ParsedRequest() req: CrudRequest) {
    return this.service.deleteOne(req);
  }
}
