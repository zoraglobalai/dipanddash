import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

@Entity({ name: "combos" })
export class Combo {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 160, unique: true })
  name!: string;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  sellingPrice!: number;

  @Column({ type: "numeric", precision: 6, scale: 2, default: 0 })
  gstPercentage!: number;

  @Column({ type: "varchar", length: 1024, nullable: true })
  imageUrl!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  note!: string | null;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

