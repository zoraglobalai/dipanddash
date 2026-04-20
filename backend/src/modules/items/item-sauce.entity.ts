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

import type { IngredientUnit } from "../ingredients/ingredients.constants";
import { INGREDIENT_UNITS } from "../ingredients/ingredients.constants";
import { Item } from "./item.entity";
import { SauceRecipe } from "./sauce-recipe.entity";

@Index("IDX_item_sauces_item_unique", ["itemId", "sauceRecipeId"], { unique: true })
@Entity({ name: "item_sauces" })
export class ItemSauce {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  itemId!: string;

  @ManyToOne(() => Item, { onDelete: "CASCADE" })
  @JoinColumn({ name: "itemId" })
  item!: Item;

  @Column({ type: "uuid" })
  sauceRecipeId!: string;

  @ManyToOne(() => SauceRecipe, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "sauceRecipeId" })
  sauceRecipe!: SauceRecipe;

  @Column({ type: "numeric", precision: 14, scale: 3 })
  quantity!: number;

  @Column({ type: "enum", enum: INGREDIENT_UNITS })
  unit!: IngredientUnit;

  @Column({ type: "numeric", precision: 14, scale: 6, default: 0 })
  normalizedQuantity!: number;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  estimatedCostContribution!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

