import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { PlansEntity } from "./plans.entity";

/** One row per plan: VAT / tax filing / dormant / extra employee settings. */
@Entity("plan_addons")
export class PlanAddonsEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "plan_id", type: "uuid" })
  planId!: string;

  @ManyToOne(() => PlansEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "plan_id" })
  plan!: PlansEntity;

  @Column({ name: "vat_percent", type: "decimal", precision: 7, scale: 4, default: 0 })
  vatPercent!: number;

  @Column({ name: "tax_filling_vat_enable", default: false })
  taxFillingVatEnable!: boolean;

  @Column({ name: "dormant_enable", default: false })
  dormantEnable!: boolean;

  @Column({ name: "dormant_cost", type: "decimal", precision: 15, scale: 2, default: 0 })
  dormantCost!: number;

  @Column({ name: "extra_employee_cost", type: "decimal", precision: 15, scale: 2, default: 0 })
  extraEmployeeCost!: number;
}
