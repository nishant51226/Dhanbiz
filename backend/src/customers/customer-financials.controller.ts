import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermission } from "../auth/require-permission.decorator";
import { CustomerFinancialsService } from "./customer-financials.service";

@ApiBearerAuth("bearer")
@Controller("customers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomerFinancialsController {
  constructor(private readonly financials: CustomerFinancialsService) {}

  @Get(":customerId/invoices/:financialDocumentId")
  @RequirePermission("invoice:read")
  getInvoiceDetail(
    @Param("customerId") customerId: string,
    @Param("financialDocumentId") financialDocumentId: string
  ) {
    return this.financials.getInvoiceDetail(customerId, financialDocumentId);
  }

  @Get(":customerId/invoices")
  @RequirePermission("invoice:read")
  listInvoices(@Param("customerId") customerId: string) {
    return this.financials.listInvoices(customerId);
  }

  @Get(":customerId/statements/:financialDocumentId")
  @RequirePermission("statement:read")
  getStatementDetail(
    @Param("customerId") customerId: string,
    @Param("financialDocumentId") financialDocumentId: string
  ) {
    return this.financials.getStatementDetail(customerId, financialDocumentId);
  }

  @Get(":customerId/statements")
  @RequirePermission("statement:read")
  listStatements(@Param("customerId") customerId: string) {
    return this.financials.listStatements(customerId);
  }
}
