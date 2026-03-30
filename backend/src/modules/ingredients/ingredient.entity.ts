import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

import type { IngredientUnit } from "./ingredients.constants";
import { INGREDIENT_UNITS } from "./ingredients.constants";
import { IngredientCategory } from "./ingredient-category.entity";

@Entity({ name: "ingredients" })
export class Ingredient {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 120, unique: true })
  name!: string;

  @Column({ type: "uuid" })
  categoryId!: string;

  @ManyToOne(() => IngredientCategory, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "categoryId" })
  category!: IngredientCategory;

  @Column({ type: "enum", enum: INGREDIENT_UNITS })
  unit!: IngredientUnit;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  perUnitPrice!: number;

  @Column({ type: "numeric", precision: 12, scale: 3, default: 0 })
  minStock!: number;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
