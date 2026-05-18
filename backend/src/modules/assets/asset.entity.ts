import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Index("UQ_assets_name_section", ["name", "section"], { unique: true })
@Index("IDX_assets_section", ["section"])
@Entity({ name: "assets" })
export class Asset {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 120 })
  name!: string;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  quantity!: number;

  @Column({ type: "varchar", length: 32 })
  unit!: string;

  @Column({ type: "varchar", length: 20, default: "dip_and_dash" })
  section!: "dip_and_dash" | "gaming";

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
