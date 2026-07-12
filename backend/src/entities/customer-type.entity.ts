import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("customer_type")
export class CustomerTypeEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  name!: string;
}
