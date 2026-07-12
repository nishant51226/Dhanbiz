import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";
import type { TenantId } from "../tenant/tenant-scope.js";
import { Customer } from "./customer.entity";
import { FinancialDocumentEntity } from "./financial-document.entity";
import { InvoiceLineEntity } from "./invoice-line.entity";

/** Invoice header for one `financial_documents` row (doc_type = invoice). */
@Entity("invoices")
export class InvoiceEntity {
  /** Same id as parent `financial_documents.id` (1:1). */
  @PrimaryColumn({ name: "financial_document_id", type: "uuid" })
  financialDocumentId!: string;

  @OneToOne(() => FinancialDocumentEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "financial_document_id" })
  financialDocument!: FinancialDocumentEntity;

  @Column({ name: "customer_id", type: "uuid" })
  customerId!: TenantId;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @Column({ type: "varchar", length: 512, nullable: true })
  vendor!: string | null;

  @Column({ name: "customer_name", type: "varchar", length: 512, nullable: true })
  customerName!: string | null;

  @Column({ name: "store_name", type: "varchar", length: 512, nullable: true })
  storeName!: string | null;

  @Column({ name: "customer_address", type: "text", nullable: true })
  customerAddress!: string | null;

  @Column({ name: "invoice_number", type: "varchar", length: 256, nullable: true })
  invoiceNumber!: string | null;

  @Column({ name: "invoice_date", type: "varchar", length: 64, nullable: true })
  invoiceDate!: string | null;

  @Column({ name: "due_date", type: "varchar", length: 64, nullable: true })
  dueDate!: string | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  currency!: string | null;

  @Column({ type: "double precision", nullable: true })
  subtotal!: number | null;

  @Column({ type: "double precision", nullable: true })
  tax!: number | null;

  @Column({ type: "double precision", nullable: true })
  total!: number | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  /** Short summary of line items (1–2 lines), editable in HITL review. */
  @Column({ name: "line_items_description", type: "text", nullable: true })
  lineItemsDescription!: string | null;

  @Column({ type: "varchar", length: 32 })
  status!: string;

  @Column({ name: "validation_json", type: "jsonb", nullable: true })
  validationJson!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => InvoiceLineEntity, (l) => l.invoice, { cascade: true })
  lineItems!: InvoiceLineEntity[];
}
