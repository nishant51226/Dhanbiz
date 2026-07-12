import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AiExecutionEntity } from "../entities/ai-execution.entity.js";
import { AiPricingEntity } from "../entities/ai-pricing.entity.js";
import { ExtractionSegmentEntity } from "../entities/extraction-segment.entity.js";
import { FinancialDocumentEntity } from "../entities/financial-document.entity.js";
import { InvoiceEntity } from "../entities/invoice.entity.js";
import { StatementEntity } from "../entities/statement.entity.js";
import { AiExecutionsService } from "../extraction/ai-executions.service.js";
import { ExtractionPersistenceService } from "../extraction/extraction-persistence.service.js";
import { ExtractPipelineService } from "./extract-pipeline.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FinancialDocumentEntity,
      ExtractionSegmentEntity,
      InvoiceEntity,
      StatementEntity,
      AiExecutionEntity,
      AiPricingEntity,
    ]),
  ],
  providers: [ExtractPipelineService, ExtractionPersistenceService, AiExecutionsService],
  exports: [ExtractPipelineService, ExtractionPersistenceService, AiExecutionsService],
})
export class ExtractModule {}
