import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermission } from "../auth/require-permission.decorator";
import { CompaniesHouseService } from "../companies-house/companies-house.service";

/**
 * Companies House search + company profile for customer onboarding (snake_case patches).
 */
@Controller("company-lookup")
@ApiTags("admin_portal-customer")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission("customer:read")
export class CompanyLookupController {
  constructor(private readonly companiesHouse: CompaniesHouseService) {}

  /**
   * Single response: onboarding `company` patch + full `companies_house` (normalized fields,
   * `ch_company_profile` = raw GET /company body, `ch_linked_resources` = JSON from each `links.*` URL).
   */
  @Get("complete")
  @ApiOperation({
    summary: "Complete Companies House bundle (profile + all link endpoints)",
    description:
      "Calls GET /company/{number} then every path in `links` (e.g. self, officers, filing_history, persons_with_significant_control). " +
      "List endpoints use the first page (100 items). Returns `companies_house` ready to merge into `onboarding_data`.",
  })
  @ApiQuery({ name: "company_number", required: true, example: "14302120" })
  async lookupComplete(@Query("company_number") companyNumber: string) {
    return this.companiesHouse.getCompanyCompleteBundle(companyNumber ?? "");
  }

  /**
   * Search Companies House (companies only). Used when the user enters a name and clicks Look up.
   * Query: q (required, min 2 chars), start_index, items_per_page (1ù100).
   */
  @Get("search")
  async search(
    @Query("q") q: string,
    @Query("start_index") startIndex?: string,
    @Query("items_per_page") itemsPerPage?: string,
  ) {
    const si = startIndex !== undefined ? Number.parseInt(startIndex, 10) : 0;
    const ipp = itemsPerPage !== undefined ? Number.parseInt(itemsPerPage, 10) : 20;
    return this.companiesHouse.searchCompanies(q ?? "", {
      startIndex: Number.isFinite(si) ? si : 0,
      itemsPerPage: Number.isFinite(ipp) ? ipp : 20,
    });
  }

  /**
   * Load one company by number and return fields to merge into onboarding JSON.
   * Same Companies House fetches as `GET Ö/complete` (profile + all `links`); response omits top-level `company_number`.
   * Query: company_number (required), e.g. 04910341 or SC123456.
   */
  @Get()
  async lookupByNumber(@Query("company_number") companyNumber: string) {
    const b = await this.companiesHouse.getCompanyCompleteBundle(companyNumber ?? "");
    return { company: b.company, companies_house: b.companies_house };
  }
}
