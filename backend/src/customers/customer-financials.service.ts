import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InvoiceEntity } from "../entities/invoice.entity.js";
import { InvoiceLineEntity } from "../entities/invoice-line.entity.js";
import { StatementEntity } from "../entities/statement.entity.js";

export type CustomerInvoiceRow = {
  financialDocumentId: string;
  jobId: string;
  fileId: string | null;
  documentId: string | null;
  fileName: string;
  pageStart: number;
  pageEnd: number;
  vendor: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  /** Sum of line amounts (null if no lines). */
  amount: number | null;
  /** Sum of line discounts (null if no lines). */
  discount: number | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string | null;
  status: string;
};

export type CustomerInvoiceLineRow = {
  lineIndex: number;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  amount: number | null;
  discount: number | null;
  taxAmount: number | null;
};

export type CustomerInvoiceDetail = CustomerInvoiceRow & {
  dueDate: string | null;
  notes: string | null;
  lineItemsDescription: string | null;
  customerName: string | null;
  customerAddress: string | null;
  validationJson: Record<string, unknown> | null;
  lineItems: CustomerInvoiceLineRow[];
};

export type CustomerStatementRow = {
  financialDocumentId: string;
  jobId: string;
  fileId: string | null;
  documentId: string | null;
  fileName: string;
  pageStart: number;
  pageEnd: number;
  accountHolder: string | null;
  bankName: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  closingBalance: number | null;
  currency: string | null;
  status: string;
};

export type CustomerStatementLineRow = {
  lineIndex: number;
  date: string | null;
  description: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
};

export type CustomerStatementDetail = CustomerStatementRow & {
  accountNumber: string | null;
  openingBalance: number | null;
  notes: string | null;
  validationJson: Record<string, unknown> | null;
  lineItems: CustomerStatementLineRow[];
};

function lineAmountDiscountSums(lines: InvoiceLineEntity[]): { amount: number | null; discount: number | null } {
  if (!lines.length) return { amount: null, discount: null };
  let amount = 0;
  let discount = 0;
  for (const l of lines) {
    amount += l.amount ?? 0;
    discount += l.discount ?? 0;
  }
  return { amount, discount };
}

@Injectable()
export class CustomerFinancialsService {
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @InjectRepository(StatementEntity)
    private readonly statements: Repository<StatementEntity>,
    @InjectRepository(InvoiceLineEntity)
    private readonly invoiceLines: Repository<InvoiceLineEntity>
  ) {}

  async listInvoices(customerId: string): Promise<CustomerInvoiceRow[]> {
    const rows = await this.invoices.find({
      where: { customerId },
      relations: { financialDocument: { job: true, file: true, document: true } },
      order: { financialDocumentId: "DESC" },
    });
    const ids = rows.map((r) => r.financialDocumentId);
    const aggMap = new Map<string, { amount: number; discount: number }>();
    if (ids.length > 0) {
      const raw = await this.invoiceLines
        .createQueryBuilder("l")
        .select("l.invoice_id", "invoiceId")
        .addSelect("SUM(COALESCE(l.amount, 0))", "amountSum")
        .addSelect("SUM(COALESCE(l.discount, 0))", "discountSum")
        .where("l.customer_id = :customerId", { customerId })
        .andWhere("l.invoice_id IN (:...ids)", { ids })
        .groupBy("l.invoice_id")
        .getRawMany<{ invoiceId: string; amountSum: string; discountSum: string }>();
      for (const r of raw) {
        aggMap.set(r.invoiceId, {
          amount: Number(r.amountSum),
          discount: Number(r.discountSum),
        });
      }
    }
    return rows.map((inv) => {
      const agg = aggMap.get(inv.financialDocumentId);
      return {
        financialDocumentId: inv.financialDocumentId,
        jobId: inv.financialDocument.jobId,
        fileId: inv.financialDocument.fileId ?? null,
        documentId: inv.financialDocument.documentId ?? null,
        fileName: inv.financialDocument.document?.name ?? inv.financialDocument.file?.name ?? "",
        pageStart: inv.financialDocument.pageStart,
        pageEnd: inv.financialDocument.pageEnd,
        vendor: inv.vendor,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        amount: agg ? agg.amount : null,
        discount: agg ? agg.discount : null,
        subtotal: inv.subtotal,
        tax: inv.tax,
        total: inv.total,
        currency: inv.currency,
        status: inv.status,
      };
    });
  }

  async getInvoiceDetail(customerId: string, financialDocumentId: string): Promise<CustomerInvoiceDetail> {
    const inv = await this.invoices.findOne({
      where: { customerId, financialDocumentId },
      relations: { lineItems: true, financialDocument: { job: true, file: true, document: true } },
    });
    if (!inv) {
      throw new NotFoundException("Invoice not found");
    }
    const lines = [...(inv.lineItems ?? [])].sort((a, b) => a.lineIndex - b.lineIndex);
    const fd = inv.financialDocument;
    const { amount, discount } = lineAmountDiscountSums(lines);
    return {
      financialDocumentId: inv.financialDocumentId,
      jobId: fd.jobId,
      fileId: fd.fileId ?? null,
      documentId: fd.documentId ?? null,
      fileName: fd.document?.name ?? fd.file?.name ?? "",
      pageStart: fd.pageStart,
      pageEnd: fd.pageEnd,
      vendor: inv.vendor,
      customerName: inv.customerName,
      customerAddress: inv.customerAddress,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      amount,
      discount,
      subtotal: inv.subtotal,
      total: inv.total,
      tax: inv.tax,
      currency: inv.currency,
      notes: inv.notes,
      lineItemsDescription: inv.lineItemsDescription,
      status: inv.status,
      validationJson: inv.validationJson,
      lineItems: lines.map((l) => ({
        lineIndex: l.lineIndex,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        amount: l.amount,
        discount: l.discount,
        taxAmount: l.taxAmount,
      })),
    };
  }

  async listStatements(customerId: string): Promise<CustomerStatementRow[]> {
    const rows = await this.statements.find({
      where: { customerId },
      relations: { financialDocument: { job: true, file: true, document: true } },
      order: { financialDocumentId: "DESC" },
    });
    return rows.map((st) => ({
      financialDocumentId: st.financialDocumentId,
      jobId: st.financialDocument.jobId,
      fileId: st.financialDocument.fileId ?? null,
      documentId: st.financialDocument.documentId ?? null,
      fileName: st.financialDocument.document?.name ?? st.financialDocument.file?.name ?? "",
      pageStart: st.financialDocument.pageStart,
      pageEnd: st.financialDocument.pageEnd,
      accountHolder: st.accountHolder,
      bankName: st.bankName,
      periodStart: st.periodStart,
      periodEnd: st.periodEnd,
      closingBalance: st.closingBalance,
      currency: st.currency,
      status: st.status,
    }));
  }

  async getStatementDetail(customerId: string, financialDocumentId: string): Promise<CustomerStatementDetail> {
    const st = await this.statements.findOne({
      where: { customerId, financialDocumentId },
      relations: { transactions: true, financialDocument: { job: true, file: true, document: true } },
    });
    if (!st) {
      throw new NotFoundException("Statement not found");
    }
    const lines = [...(st.transactions ?? [])].sort((a, b) => a.lineIndex - b.lineIndex);
    const fd = st.financialDocument;
    return {
      financialDocumentId: st.financialDocumentId,
      jobId: fd.jobId,
      fileId: fd.fileId ?? null,
      documentId: fd.documentId ?? null,
      fileName: fd.document?.name ?? fd.file?.name ?? "",
      pageStart: fd.pageStart,
      pageEnd: fd.pageEnd,
      accountHolder: st.accountHolder,
      bankName: st.bankName,
      accountNumber: st.accountNumber,
      periodStart: st.periodStart,
      periodEnd: st.periodEnd,
      openingBalance: st.openingBalance,
      closingBalance: st.closingBalance,
      currency: st.currency,
      notes: st.notes,
      status: st.status,
      validationJson: st.validationJson,
      lineItems: lines.map((l) => ({
        lineIndex: l.lineIndex,
        date: l.date,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
        balance: l.balance,
      })),
    };
  }
}
