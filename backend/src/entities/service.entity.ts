import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

/** Catalogue row: attachable services for matrix subscription `plans` (table `services`). */
@Entity("services")
export class ServiceEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;

  @Column({ type: "text", nullable: true })
  description!: string | null;

  @Column({ type: "decimal", precision: 15, scale: 2, default: 0 })
  price!: string;

  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  /** When true, this catalogue row is treated as an included bundle feature (vs optional add-on). */
  @Column({ name: "is_included", default: true })
  isIncluded!: boolean;
}
