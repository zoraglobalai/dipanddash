import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

import { Ingredient } from "../ingredients/ingredient.entity";
import type { IngredientUnit } from "../ingredients/ingredients.constants";
import { INGREDIENT_UNITS } from "../ingredients/ingredients.constants";
import { SauceBatch } from "./sauce-batch.entity";
import { SauceRecipeIngredient } from "./sauce-recipe-ingredient.entity";

@Index("IDX_sauce_recipes_name_unique", ["name"], { unique: true })
@Index("IDX_sauce_recipes_output_ingredient_unique", ["outputIngredientId"], { unique: true })
@Entity({ name: "sauce_recipes" })
export class SauceRecipe {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 160 })
  name!: string;

  @Column({ type: "uuid" })
  outputIngredientId!: string;

  @ManyToOne(() => Ingredient, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "outputIngredientId" })
  outputIngredient!: Ingredient;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 1 })
  baseBatchQuantity!: number;

  @Column({ type: "enum", enum: INGREDIENT_UNITS })
  outputUnit!: IngredientUnit;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  estimatedBatchCost!: number;

  @Column({ type: "varchar", length: 500, nullable: true })
  note!: string | null;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @OneToMany(() => SauceRecipeIngredient, (row) => row.sauceRecipe)
  ingredients!: SauceRecipeIngredient[];

  @OneToMany(() => SauceBatch, (batch) => batch.sauceRecipe)
  batches!: SauceBatch[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

