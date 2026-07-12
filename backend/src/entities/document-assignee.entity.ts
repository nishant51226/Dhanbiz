import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from "typeorm";
import { DocumentEntity } from "./document.entity";
import { UserEntity } from "./user.entity";

/** Many-to-many assignment of a library document to practice staff with `document:assignee`. */
@Entity("document_assignees")
@Unique(["documentId", "userId"])
export class DocumentAssigneeEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "document_id", type: "uuid" })
  documentId!: string;

  @ManyToOne(() => DocumentEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "document_id" })
  document!: DocumentEntity;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @Column({ name: "assigned_by_user_id", type: "uuid", nullable: true })
  assignedByUserId!: string | null;

  @ManyToOne(() => UserEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "assigned_by_user_id" })
  assignedByUser!: UserEntity | null;

  @CreateDateColumn({ name: "assigned_at" })
  assignedAt!: Date;
}
