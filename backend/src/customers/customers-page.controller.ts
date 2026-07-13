import {
  BadRequestException,
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { AuthUser } from "../auth/auth.types";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermission } from "../auth/require-permission.decorator";
import { CustomersListExportBodyDto } from "./dto/customers-list-export.dto";
import { CustomersListExportPreviewBodyDto } from "./dto/customers-list-export-preview.dto";
import { ONBOARDING_DASHBOARD_SORT_FIELDS } from "./onboarding-dashboard-sort-fields";
import { CustomersPageService } from "./customers-page.service";
import { Req } from "@nestjs/common";

function parseAccountStatusInQuery(
  raw: string | undefined,
): Array<"draft" | "active" | "inactive" | "proposed"> | undefined {
  const t = raw?.trim();
  if (!t) return undefined;
  const allowed = new Set(["draft", "active", "inactive", "proposed"]);
  const out = t
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is "draft" | "active" | "inactive" | "proposed" => allowed.has(s));
  return out.length > 0 ? [...new Set(out)] : undefined;
}

type AuthedRequest = Request & { user?: AuthUser };

@Controller("customers")
@ApiTags("admin_portal-customer")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("customer:read")
export class CustomersPageController {
  constructor(private readonly customersPage: CustomersPageService) {}

  /**
   * Paginated customers with latest `customer_form_submission` row (`data` + `status`) per row.
   * Static path must stay before CRUD `GET /customers/:id` where `:id` could otherwise capture literals on some setups.
   */
  /** Allowlisted `onboarding_data` JSON paths for staff dashboard column sorts. */
  @Get("onboarding-dashboard-sort-fields")
  @ApiOperation({ summary: "Catalog of onboarding JSON fields for customer list / dashboard sorting" })
  onboardingDashboardSortFields() {
    return { fields: ONBOARDING_DASHBOARD_SORT_FIELDS.map((f) => ({ id: f.id, label: f.label })) };
  }

  @Get("page-with-submission-data")
  @ApiQuery({ name: "page", required: true, type: Number, description: "1-based page index." })
  @ApiQuery({
    name: "limit",
    required: true,
    type: Number,
    description: "Page size (clamped to 1–100 on the server).",
  })
  @ApiQuery({
    name: "sort",
    required: false,
    type: String,
    description:
      "Sort as `field,order`. Fields: `name`, `createdAt`; order: `ASC` or `DESC`. Omit for default `name,ASC`.",
    example: "name,ASC",
  })
  @ApiQuery({
    name: "search",
    required: false,
    type: String,
    description: "Optional substring filter on customer name (case-insensitive). Omit for no filter.",
  })
  @ApiQuery({
    name: "createdFrom",
    required: false,
    type: String,
    description: "Inclusive created-at lower bound (`YYYY-MM-DD` or ISO datetime).",
  })
  @ApiQuery({
    name: "createdTo",
    required: false,
    type: String,
    description: "Inclusive created-at upper bound (`YYYY-MM-DD` or ISO datetime).",
  })
  @ApiQuery({
    name: "updatedFrom",
    required: false,
    type: String,
    description: "Inclusive updated-at lower bound (`YYYY-MM-DD` or ISO datetime).",
  })
  @ApiQuery({
    name: "updatedTo",
    required: false,
    type: String,
    description: "Inclusive updated-at upper bound (`YYYY-MM-DD` or ISO datetime).",
  })
  @ApiQuery({
    name: "formStatus",
    required: false,
    enum: ["all", "draft", "completed"],
    description: "Filter by latest onboarding form submission status.",
  })
  @ApiQuery({
    name: "accountStatus",
    required: false,
    enum: ["all", "draft", "active", "inactive", "proposed"],
    description: "Filter by `customers.account_status`.",
  })
  @ApiQuery({
    name: "accountStatusIn",
    required: false,
    type: String,
    description:
      "Comma-separated account statuses (e.g. `draft,active`). When set, overrides `accountStatus` for multi-status filters.",
  })
  @ApiQuery({
    name: "onboardingSort",
    required: false,
    type: String,
    description:
      "Sort by `onboarding_data` JSON path: `fieldId,ASC|DESC`. Field ids from GET /customers/onboarding-dashboard-sort-fields. When set, overrides `sort` for ordering (tie-break: name ASC).",
    example: "companies_house.company_status,DESC",
  })
  async pageWithSubmissionData(
    @Req() req: AuthedRequest,
    @Query("page", ParseIntPipe) page: number,
    @Query("limit", ParseIntPipe) limit: number,
    @Query("sort") sort?: string,
    @Query("onboardingSort") onboardingSort?: string,
    @Query("search") search?: string,
    @Query("createdFrom") createdFrom?: string,
    @Query("createdTo") createdTo?: string,
    @Query("updatedFrom") updatedFrom?: string,
    @Query("updatedTo") updatedTo?: string,
    @Query("formStatus") formStatus?: "all" | "draft" | "completed",
    @Query("accountStatus") accountStatus?: "all" | "draft" | "active" | "inactive" | "proposed",
    @Query("accountStatusIn") accountStatusInRaw?: string,
  ) {
    const accountStatusIn = parseAccountStatusInQuery(accountStatusInRaw);
    return this.customersPage.findPageWithLatestSubmission({
      user: req.user,
      page,
      limit,
      sort,
      onboardingSort,
      search,
      filters: {
        search,
        createdFrom,
        createdTo,
        updatedFrom,
        updatedTo,
        formStatus,
        accountStatus,
        accountStatusIn,
      },
    });
  }

  /** True when another customer already has this company / CH registration number (draft or saved onboarding). */
  @Get("company-registration-conflict")
  @ApiOperation({
    summary: "Check duplicate company registration number",
    description:
      "Compares normalized UK company numbers against `customers.onboarding_data` and `customer_form_submission.data`. " +
      "Pass `excludeCustomerId` when continuing an existing draft so that customer is ignored.",
  })
  @ApiQuery({ name: "number", required: true, example: "04910341" })
  @ApiQuery({ name: "excludeCustomerId", required: false })
  async companyRegistrationConflict(
    @Query("number") number?: string,
    @Query("excludeCustomerId") excludeCustomerId?: string,
  ) {
    const n = String(number ?? "").trim();
    if (!n) throw new BadRequestException("Query parameter `number` is required.");
    return this.customersPage.findCompanyRegistrationConflict(n, excludeCustomerId);
  }

  /**
   * Tabular export for the admin customers list: optional date / name / onboarding-status filters,
   * and a chosen subset/order of columns.
   */
  @Post("export-list")
  @ApiOperation({
    summary: "Export customers list (CSV or XLSX)",
    description:
      "Returns a spreadsheet of customers matching `filters`, including only `columns` (see DTO). Max 10,000 rows.",
  })
  @ApiBody({ type: CustomersListExportBodyDto })
  async exportList(@Req() req: AuthedRequest, @Body() body: CustomersListExportBodyDto): Promise<StreamableFile> {
    const { buffer, contentType, filename } = await this.customersPage.exportFilteredList(body, req.user);
    return new StreamableFile(buffer, {
      type: contentType,
      disposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
    });
  }

  /** JSON preview: matching customer names + sample rows (same filters/columns as export). */
  @Post("export-list-preview")
  @ApiOperation({
    summary: "Preview customers list export",
    description:
      "Returns total match count, up to `matchingNameLimit` id+name pairs, and up to `previewRowLimit` tabular rows using the same rules as POST /customers/export-list.",
  })
  @ApiBody({ type: CustomersListExportPreviewBodyDto })
  async exportListPreview(@Req() req: AuthedRequest, @Body() body: CustomersListExportPreviewBodyDto) {
    return this.customersPage.previewExportList(body, req.user);
  }
}
