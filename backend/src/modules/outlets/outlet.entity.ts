import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "outlets" })
export class Outlet {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 16, unique: true })
  outletCode!: string;

  @Column({ type: "varchar", length: 160 })
  outletName!: string;

  @Column({ type: "varchar", length: 240 })
  location!: string;

  @Column({ type: "varchar", length: 140 })
  managerName!: string;

  @Column({ type: "varchar", length: 20 })
  managerPhone!: string;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
