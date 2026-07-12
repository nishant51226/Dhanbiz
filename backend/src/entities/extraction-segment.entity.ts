import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { TenantId } from "../tenant/tenant-scope.js";
import { Customer } from "./customer.entity";
import { DocumentEntity } from "./document.entity";
import { FinancialDocumentEntity } from "./financial-document.entity";
import { File } from "./file.entity";
import { Job } from "./job.entity";

/** One row per PDF page / segment; company-scoped for RLS. */
@Entity("extraction_segments")
@Index(["customerId"])
@Index(["jobId"])
@Index(["jobId", "pageNumber"], { unique: true })
export class ExtractionSegmentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "job_id", type: "uuid" })
  jobId!: string;

  @ManyToOne(() => Job, { onDelete: "CASCADE" })
  @JoinColumn({ name: "job_id" })
  job!: Job;

  @Column({ name: "customer_id", type: "uuid" })
  customerId!: TenantId;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @Column({ name: "file_id", type: "uuid", nullable: true })
  fileId!: string | null;

  @ManyToOne(() => File, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "file_id" })
  file!: File | null;

  @Column({ name: "document_id", type: "uuid", nullable: true })
  documentId!: string | null;

  @ManyToOne(() => DocumentEntity, { onDelete: "CASCADE", nullable: true })
  @JoinColumn({ name: "document_id" })
  document!: DocumentEntity | null;

  @Column({ name: "page_number", type: "int" })
  pageNumber!: number;

  @Column({ type: "text", default: "" })
  text!: string;

  /** `text` | `vision` */
  @Column({ name: "text_source", type: "varchar", length: 16 })
  textSource!: string;

  @Column({ name: "segment_kind", type: "varchar", length: 32, nullable: true })
  segmentKind!: string | null;

  @Column({ type: "jsonb", nullable: true })
  classification!: Record<string, unknown> | null;

  @Column({ name: "classification_raw", type: "text", nullable: true })
  classificationRaw!: string | null;

  @Column({ name: "extracted_data", type: "jsonb", nullable: true })
  extractedData!: unknown | null;

  @Column({ name: "extracted_raw", type: "text", nullable: true })
  extractedRaw!: string | null;

  @Column({ name: "extracted_parse_error", type: "text", nullable: true })
  extractedParseError!: string | null;

  @Column({ name: "segment_status", type: "varchar", length: 32 })
  segmentStatus!: string;

  @Column({ name: "financial_document_id", type: "uuid", nullable: true })
  financialDocumentId!: string | null;

  @ManyToOne(() => FinancialDocumentEntity, {
    nullable: true,
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "financial_document_id" })
  financialDocument!: FinancialDocumentEntity | null;

  /** Stable id from pipeline JSON (`${jobId}-p{n}`). */
  @Column({ name: "pipeline_segment_id", type: "varchar", length: 256 })
  pipelineSegmentId!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
