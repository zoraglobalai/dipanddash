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

import { Ingredient } from "../ingredients/ingredient.entity";
import { type IngredientUnit, INGREDIENT_UNITS } from "../ingredients/ingredients.constants";
import { AddOn } from "./add-on.entity";

@Index("IDX_add_on_ingredient_unique", ["addOnId", "ingredientId"], { unique: true })
@Entity({ name: "add_on_ingredients" })
export class AddOnIngredient {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  addOnId!: string;

  @ManyToOne(() => AddOn, { onDelete: "CASCADE" })
  @JoinColumn({ name: "addOnId" })
  addOn!: AddOn;

  @Column({ type: "uuid" })
  ingredientId!: string;

  @ManyToOne(() => Ingredient, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "ingredientId" })
  ingredient!: Ingredient;

  @Column({ type: "numeric", precision: 14, scale: 3 })
  quantity!: number;

  @Column({ type: "enum", enum: INGREDIENT_UNITS })
  unit!: IngredientUnit;

  @Column({ type: "numeric", precision: 14, scale: 6, default: 0 })
  normalizedQuantity!: number;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  costContribution!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

