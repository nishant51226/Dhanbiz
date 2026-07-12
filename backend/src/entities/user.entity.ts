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

@Entity("users")
@Unique(["email"])
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 320 })
  email!: string;

  @Column({ name: "password_hash", type: "text" })
  passwordHash!: string;

  @Column({ name: "customer_id", type: "uuid", nullable: true })
  customerId!: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "customer_id" })
  customer!: Customer | null;

  @Column({ name: "phone_number", type: "varchar", length: 32, nullable: true })
  phoneNumber!: string | null;

  @Column({ name: "is_admin", type: "boolean", default: () => "false" })
  isAdmin!: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}

