import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { ExtractionSegmentEntity } from "../entities/extraction-segment.entity.js";
import { FinancialDocumentEntity } from "../entities/financial-document.entity.js";
import { InvoiceEntity } from "../entities/invoice.entity.js";
import { StatementEntity } from "../entities/statement.entity.js";
import { runWithTenantRls } from "../tenant/run-with-tenant-rls.js";
import type { FinancialJobResult } from "./financial-types.js";

@Injectable()
export class ExtractionPersistenceService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Replace DB rows for a job from pipeline JSON. Deletes prior rows for the same job.
   * All rows include `customerId` for tenant / future RLS.
   */
  /** Remove all persisted extraction rows for a job (used before re-running a completed extraction). */
  async clearForJob(jobId: string, customerId: string): Promise<void> {
    await runWithTenantRls(this.dataSource, customerId, async (manager) => {
      const fdRepo = manager.getRepository(FinancialDocumentEntity);
      const segRepo = manager.getRepository(ExtractionSegmentEntity);
      await fdRepo.delete({ jobId });
      await segRepo.delete({ jobId });
    });
  }

  async replaceForJob(
    jobId: string,
    customerId: string,
    ids: { documentId: string | null; fileId: string | null },
    result: FinancialJobResult
  ): Promise<void> {
    await runWithTenantRls(this.dataSource, customerId, async (manager) => {
      const fdRepo = manager.getRepository(FinancialDocumentEntity);
      const segRepo = manager.getRepository(ExtractionSegmentEntity);
      const invoiceRepo = manager.getRepository(InvoiceEntity);
      const statementRepo = manager.getRepository(StatementEntity);

      await fdRepo.delete({ jobId });

      for (const fd of result.financialDocuments) {
        await fdRepo.save({
          id: fd.id,
          jobId,
          customerId,
          fileId: ids.fileId,
          documentId: ids.documentId,
          docType: fd.type,
          pageStart: fd.metadata.pageRange.start,
          pageEnd: fd.metadata.pageRange.end,
          docStatus: fd.status,
        });

        if (fd.type === "invoice" && fd.invoice) {
          const inv = fd.invoice;
          await invoiceRepo.save({
            financialDocumentId: fd.id,
            customerId,
            vendor: inv.vendor,
            customerName: inv.customer,
            storeName: inv.storeName,
            customerAddress: inv.customerAddress,
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
            dueDate: inv.dueDate,
            currency: inv.currency,
            subtotal: inv.subtotal,
            tax: inv.tax,
            total: inv.total,
            notes: inv.notes,
            lineItemsDescription: inv.lineItemsDescription ?? null,
            status: inv.status,
            validationJson: JSON.parse(JSON.stringify(inv.validation)) as Record<string, unknown>,
            lineItems: inv.lineItems.map((li, lineIndex) => ({
              customerId,
              lineIndex,
              description: li.description,
              quantity: li.quantity,
              unitPrice: li.unitPrice,
              amount: li.amount,
              discount: li.discount,
              taxAmount: li.taxAmount,
            })),
          });
        } else if (fd.type === "statement" && fd.statement) {
          const st = fd.statement;
          await statementRepo.save({
            financialDocumentId: fd.id,
            customerId,
            accountHolder: st.accountHolder,
            bankName: st.bankName,
            accountNumber: st.accountNumber,
            periodStart: st.statementPeriodStart,
            periodEnd: st.statementPeriodEnd,
            currency: st.currency,
            openingBalance: st.openingBalance,
            closingBalance: st.closingBalance,
            notes: st.notes,
            status: st.status,
            validationJson: JSON.parse(JSON.stringify(st.validation)) as Record<string, unknown>,
            transactions: st.transactions.map((tx, lineIndex) => ({
              customerId,
              lineIndex,
              date: tx.date,
              description: tx.description,
              debit: tx.debit,
              credit: tx.credit,
              balance: tx.balance,
            })),
          });
        }
      }

      const pageNumbers = result.segments.map((s) => s.pageNumber);
      if (pageNumbers.length === 0) {
        await segRepo.delete({ jobId });
      } else {
        await segRepo
          .createQueryBuilder()
          .delete()
          .from(ExtractionSegmentEntity)
          .where("job_id = :jobId AND page_number NOT IN (:...pages)", { jobId, pages: pageNumbers })
          .execute();
      }

      for (const s of result.segments) {
        const existing = await segRepo.findOne({ where: { jobId, pageNumber: s.pageNumber } });
        await segRepo.save({
          id: existing?.id,
          jobId,
          customerId,
          fileId: ids.fileId,
          documentId: ids.documentId,
          pageNumber: s.pageNumber,
          text: s.text,
          textSource: s.textSource,
          segmentKind: s.type,
          classification: s.classification
            ? (JSON.parse(JSON.stringify(s.classification)) as Record<string, unknown>)
            : null,
          classificationRaw: s.classificationRaw,
          extractedData: s.extractedData != null ? JSON.parse(JSON.stringify(s.extractedData)) : null,
          extractedRaw: s.extractedRaw,
          extractedParseError: s.extractedParseError,
          segmentStatus: s.status,
          financialDocumentId: s.financialDocumentId,
          pipelineSegmentId: s.id,
        });
      }
    });
  }
}
