import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { INGREDIENT_CATEGORY_KINDS, type IngredientCategoryKind } from "./ingredients.constants";

@Entity({ name: "ingredient_categories" })
export class IngredientCategory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 80, unique: true })
  name!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ type: "enum", enum: INGREDIENT_CATEGORY_KINDS, default: "core" })
  kind!: IngredientCategoryKind;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
