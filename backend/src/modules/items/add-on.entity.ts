import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

@Entity({ name: "add_ons" })
export class AddOn {
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

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  estimatedIngredientCost!: number;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

