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
import { RoleEntity } from "./role.entity";
import { UserEntity } from "./user.entity";

/** Links a login (`users`) to a customer with a role and active flag (e.g. portal users). */
@Entity("customer_users")
@Unique(["customerId", "userId"])
export class CustomerUserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "customer_id", type: "uuid" })
  customerId!: string;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ name: "role_id", type: "uuid" })
  roleId!: string;

  @ManyToOne(() => RoleEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "role_id" })
  role!: RoleEntity;

  @Column({ name: "is_active", type: "boolean", default: () => "true" })
  isActive!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}
