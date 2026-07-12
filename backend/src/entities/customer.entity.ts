import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { CustomerUserEntity } from "./customer-user.entity";
import { File } from "./file.entity";
import { Job } from "./job.entity";
import { PlansEntity } from "./plans.entity";

/** Lifecycle on the customer row (separate from `customer_form_submission.status`). */
export enum CustomerAccountStatus {
  draft = "draft",
  active = "active",
  inactive = "inactive",
  proposed = "proposed",
}

@Entity("customers")
export class Customer {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 512 })
  name!: string;

  /**
   * Canonical onboarding JSON **after the wizard is finished** (`PATCH` from the app).
   * While onboarding is in progress, use `customer_form_submission.data` only; do not rely on this column.
   * DocuSeal webhooks may merge remote signatures here **only if** this field is already set (post-finish).
   */
  @Column({ name: "onboarding_data", type: "jsonb", nullable: true })
  onboardingData!: Record<string, unknown> | null;

  @Column({ name: "annual_turnover_gbp", type: "decimal", precision: 15, scale: 2, nullable: true })
  annualTurnoverGbp!: number | null;

  /** Matrix bundle `plans.id` (subscription catalogue), not legacy `subscription_plans`. */
  @Column({ name: "plan_id", type: "uuid", nullable: true })
  planId!: string | null;

  @ManyToOne(() => PlansEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "plan_id" })
  plan?: PlansEntity | null;

  @Column({
    name: "account_status",
    type: "enum",
    enum: CustomerAccountStatus,
    enumName: "customers_account_status_enum",
    default: CustomerAccountStatus.draft,
  })
  accountStatus!: CustomerAccountStatus;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @DeleteDateColumn({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;

  @OneToMany(() => CustomerUserEntity, (cu) => cu.customer)
  customerUsers?: CustomerUserEntity[];

  @OneToMany(() => File, (f) => f.customer)
  files?: File[];

  @OneToMany(() => Job, (j) => j.customer)
  jobs?: Job[];
}
