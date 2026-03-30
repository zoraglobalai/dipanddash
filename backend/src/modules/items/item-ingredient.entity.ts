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
import { Item } from "./item.entity";

@Index("IDX_item_ingredient_unique", ["itemId", "ingredientId"], { unique: true })
@Entity({ name: "item_ingredients" })
export class ItemIngredient {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  itemId!: string;

  @ManyToOne(() => Item, { onDelete: "CASCADE" })
  @JoinColumn({ name: "itemId" })
  item!: Item;

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

