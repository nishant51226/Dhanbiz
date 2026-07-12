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
import { InvoiceEntity } from "./invoice.entity";

@Entity("invoice_lines")
@Index(["customerId"])
@Index(["invoiceId"])
export class InvoiceLineEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "invoice_id", type: "uuid" })
  invoiceId!: string;

  @ManyToOne(() => InvoiceEntity, (inv) => inv.lineItems, { onDelete: "CASCADE" })
  @JoinColumn({ name: "invoice_id" })
  invoice!: InvoiceEntity;

  @Column({ name: "customer_id", type: "uuid" })
  customerId!: TenantId;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @Column({ name: "line_index", type: "int" })
  lineIndex!: number;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "double precision", nullable: true })
  quantity!: number | null;

  @Column({ name: "unit_price", type: "double precision", nullable: true })
  unitPrice!: number | null;

  @Column({ type: "double precision", nullable: true })
  amount!: number | null;

  @Column({ type: "double precision", nullable: true })
  discount!: number | null;

  @Column({ name: "tax_amount", type: "double precision", nullable: true })
  taxAmount!: number | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
