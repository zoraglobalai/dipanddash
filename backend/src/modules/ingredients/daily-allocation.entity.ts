import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

import { Ingredient } from "./ingredient.entity";

@Index("IDX_daily_allocation_ingredient_date_unique", ["ingredientId", "date"], { unique: true })
@Entity({ name: "daily_allocations" })
export class DailyAllocation {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  ingredientId!: string;

  @ManyToOne(() => Ingredient, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ingredientId" })
  ingredient!: Ingredient;

  @Column({ type: "date" })
  date!: string;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  allocatedQuantity!: number;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  usedQuantity!: number;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  remainingQuantity!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
