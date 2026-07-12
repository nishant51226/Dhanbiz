import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { PlansEntity } from "./plans.entity";

@Entity("plan_limit")
export class PlanLimitEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "plan_id", type: "uuid" })
  planId!: string;

  @ManyToOne(() => PlansEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "plan_id" })
  plan!: PlansEntity;

  @Column({ name: "free_payroll_limit", type: "int", default: 0 })
  freePayrollLimit!: number;
}
