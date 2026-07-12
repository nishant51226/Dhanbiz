import { ArrayMaxSize, IsArray, IsIn, IsISO8601, IsOptional, IsUUID } from "class-validator";

export type CustomerDocumentsLayoutMode =
  | "per_document"
  | "per_folder"
  | "per_date"
  | "invoice_register"
  | "statement_register";
export type CustomerDocumentsDateBasis = "effective" | "uploaded";

export type CustomerDocumentsExportRequest = {
  from: string;
  to: string;
  layoutMode: CustomerDocumentsLayoutMode;
  dateBasis?: CustomerDocumentsDateBasis;
  customerName?: string;
  documentIds?: string[];
};

export type CustomerDocumentsExportCandidate = {
  id: string;
  name: string;
  folderPath: string;
  uploadedAt: string;
  documentType: string;
  /** Invoice document in range (uploaded as invoice or with extracted invoice data). */
  invoiceEligible: boolean;
  /** Statement document in range (uploaded as statement or with extracted statement data). */
  statementEligible: boolean;
  /** True when invoice/statement extraction is available for the selected register layout. */
  extractionReady: boolean;
};

export class CustomerDocumentsReportDto {
  @IsUUID()
  customerId!: string;

  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsIn(["per_document", "per_folder", "per_date", "invoice_register", "statement_register"])
  layoutMode!: CustomerDocumentsLayoutMode;

  @IsOptional()
  @IsIn(["effective", "uploaded"])
  dateBasis?: CustomerDocumentsDateBasis;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID("4", { each: true })
  documentIds?: string[];
}
