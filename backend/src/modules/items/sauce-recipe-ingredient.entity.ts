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
import type { IngredientUnit } from "../ingredients/ingredients.constants";
import { INGREDIENT_UNITS } from "../ingredients/ingredients.constants";
import { SauceRecipe } from "./sauce-recipe.entity";

@Index("IDX_sauce_recipe_ingredient_unique", ["sauceRecipeId", "ingredientId"], { unique: true })
@Entity({ name: "sauce_recipe_ingredients" })
export class SauceRecipeIngredient {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  sauceRecipeId!: string;

  @ManyToOne(() => SauceRecipe, { onDelete: "CASCADE" })
  @JoinColumn({ name: "sauceRecipeId" })
  sauceRecipe!: SauceRecipe;

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

