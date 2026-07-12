import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";
import { Customer } from "./customer.entity";
import { UserEntity } from "./user.entity";

/** Maps a practice/staff user to customers they are allowed to access. */
@Entity("staff_customer_assignments")
@Unique(["staffUserId", "customerId"])
export class StaffCustomerAssignmentEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "staff_user_id", type: "uuid" })
  staffUserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "staff_user_id" })
  staffUser!: UserEntity;

  @Column({ name: "customer_id", type: "uuid" })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
