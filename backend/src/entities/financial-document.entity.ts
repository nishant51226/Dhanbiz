import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import type { TenantId } from "../tenant/tenant-scope.js";
import { Customer } from "./customer.entity";
import { DocumentEntity } from "./document.entity";
import { File } from "./file.entity";
import { Job } from "./job.entity";

/** Persisted invoice/statement (one logical document per merged page range). Company-scoped for RLS. */
@Entity("financial_documents")
@Index(["customerId"])
@Index(["jobId"])
export class FinancialDocumentEntity {
  @PrimaryColumn({ type: "uuid" })
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

  /** `invoice` | `statement` */
  @Column({ name: "doc_type", type: "varchar", length: 32 })
  docType!: string;

  @Column({ name: "page_start", type: "int" })
  pageStart!: number;

  @Column({ name: "page_end", type: "int" })
  pageEnd!: number;

  @Column({ name: "doc_status", type: "varchar", length: 32 })
  docStatus!: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
