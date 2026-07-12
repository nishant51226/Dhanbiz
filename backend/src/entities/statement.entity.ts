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
import { StatementLineEntity } from "./statement-line.entity";

@Entity("statements")
export class StatementEntity {
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

  @Column({ name: "account_holder", type: "varchar", length: 512, nullable: true })
  accountHolder!: string | null;

  @Column({ name: "bank_name", type: "varchar", length: 512, nullable: true })
  bankName!: string | null;

  @Column({ name: "account_number", type: "varchar", length: 256, nullable: true })
  accountNumber!: string | null;

  @Column({ name: "period_start", type: "varchar", length: 64, nullable: true })
  periodStart!: string | null;

  @Column({ name: "period_end", type: "varchar", length: 64, nullable: true })
  periodEnd!: string | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  currency!: string | null;

  @Column({ name: "opening_balance", type: "double precision", nullable: true })
  openingBalance!: number | null;

  @Column({ name: "closing_balance", type: "double precision", nullable: true })
  closingBalance!: number | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @Column({ type: "varchar", length: 32 })
  status!: string;

  @Column({ name: "validation_json", type: "jsonb", nullable: true })
  validationJson!: Record<string, unknown> | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => StatementLineEntity, (l) => l.statement, { cascade: true })
  transactions!: StatementLineEntity[];
}
