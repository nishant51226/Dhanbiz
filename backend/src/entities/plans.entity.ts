import { Column, Entity, JoinTable, ManyToMany, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { CustomerTypeEntity } from "./customer-type.entity";
import { PlanServiceEntity } from "./plan-service.entity";

@Entity("plans")
export class PlansEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column({ name: "billing_cycle", default: "monthly" })
  billingCycle!: string;

  /** Customer types this plan applies to (join table `plan_customer_type`). */
  @ManyToMany(() => CustomerTypeEntity)
  @JoinTable({
    name: "plan_customer_type",
    joinColumn: { name: "plan_id", referencedColumnName: "id" },
    inverseJoinColumn: { name: "customer_type_id", referencedColumnName: "id" },
  })
  customerTypes!: CustomerTypeEntity[];

  @Column({ name: "max_turnover", type: "decimal", precision: 15, scale: 2, nullable: true })
  maxTurnover!: number | null;

  /** When false, plan is hidden from customer-facing flows that filter active matrix plans. */
  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  @OneToMany(() => PlanServiceEntity, (ps) => ps.plan)
  planServiceLinks!: PlanServiceEntity[];
}
