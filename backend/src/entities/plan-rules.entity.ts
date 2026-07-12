import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { PlansEntity } from "./plans.entity";

@Entity("plan_rules")
export class PlanRulesEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "plan_id", type: "uuid" })
  planId!: string;

  @ManyToOne(() => PlansEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "plan_id" })
  plan!: PlansEntity;

  @Column({ default: false })
  extendable!: boolean;

  @Column({ name: "increment_step", type: "decimal", precision: 15, scale: 2, default: 0 })
  incrementStep!: number;

  @Column({ name: "increment_cost", type: "decimal", precision: 15, scale: 2, default: 0 })
  incrementCost!: number;
}
