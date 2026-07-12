import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity("enquiry_user")
export class EnquiryUserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "full_name", type: "varchar", length: 255 })
  fullName!: string;

  @Column({ type: "varchar", length: 500 })
  interest!: string;

  @Column({ type: "varchar", length: 50 })
  phone!: string;

  @Column({ name: "country_code", type: "varchar", length: 16 })
  countryCode!: string;

  @Column({ type: "varchar", length: 255 })
  email!: string;
}
