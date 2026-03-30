import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";

import { Ingredient } from "./ingredient.entity";
import { IngredientStockLogType } from "./ingredients.constants";

@Entity({ name: "ingredient_stock_logs" })
export class IngredientStockLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  ingredientId!: string;

  @ManyToOne(() => Ingredient, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ingredientId" })
  ingredient!: Ingredient;

  @Column({ type: "enum", enum: IngredientStockLogType })
  type!: IngredientStockLogType;

  @Column({ type: "numeric", precision: 14, scale: 3 })
  quantity!: number;

  @Column({ type: "varchar", length: 255, nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}
