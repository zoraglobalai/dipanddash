import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";

import { Ingredient } from "../ingredients/ingredient.entity";
import type { IngredientUnit } from "../ingredients/ingredients.constants";
import { INGREDIENT_UNITS } from "../ingredients/ingredients.constants";
import { User } from "../users/user.entity";
import { SauceRecipe } from "./sauce-recipe.entity";

@Index("IDX_sauce_batches_recipe", ["sauceRecipeId"])
@Entity({ name: "sauce_batches" })
export class SauceBatch {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  sauceRecipeId!: string;

  @ManyToOne(() => SauceRecipe, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sauceRecipeId" })
  sauceRecipe!: SauceRecipe;

  @Column({ type: "uuid" })
  outputIngredientId!: string;

  @ManyToOne(() => Ingredient, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "outputIngredientId" })
  outputIngredient!: Ingredient;

  @Column({ type: "numeric", precision: 14, scale: 3 })
  producedQuantity!: number;

  @Column({ type: "enum", enum: INGREDIENT_UNITS })
  producedUnit!: IngredientUnit;

  @Column({ type: "numeric", precision: 14, scale: 6, default: 1 })
  batchFactor!: number;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  consumedCost!: number;

  @Column({ type: "varchar", length: 500, nullable: true })
  note!: string | null;

  @Column({ type: "uuid", nullable: true })
  createdByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: "SET NULL" })
  @JoinColumn({ name: "createdByUserId" })
  createdByUser!: User | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}

