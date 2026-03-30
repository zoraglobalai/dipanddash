import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn
} from "typeorm";

import { Ingredient } from "./ingredient.entity";

@Entity({ name: "ingredient_stocks" })
export class IngredientStock {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid", unique: true })
  ingredientId!: string;

  @OneToOne(() => Ingredient, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ingredientId" })
  ingredient!: Ingredient;

  @Column({ type: "numeric", precision: 14, scale: 3, default: 0 })
  totalStock!: number;

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  lastUpdatedAt!: Date;
}
