import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from "typeorm";

import { ItemCategory } from "../items/item-category.entity";
import { Item } from "../items/item.entity";
import { COUPON_DISCOUNT_TYPES, type CouponDiscountType } from "./offers.constants";

@Entity({ name: "coupons" })
export class Coupon {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 60, unique: true })
  couponCode!: string;

  @Column({ type: "varchar", length: 140, nullable: true })
  title!: string | null;

  @Column({ type: "varchar", length: 600, nullable: true })
  description!: string | null;

  @Column({ type: "enum", enum: COUPON_DISCOUNT_TYPES })
  discountType!: CouponDiscountType;

  @Column({ type: "numeric", precision: 12, scale: 2, nullable: true })
  discountValue!: number | null;

  @Column({ type: "numeric", precision: 12, scale: 2, nullable: true })
  minimumOrderAmount!: number | null;

  @Column({ type: "numeric", precision: 12, scale: 2, nullable: true })
  maximumDiscountAmount!: number | null;

  @Column({ type: "int", nullable: true })
  maxUses!: number | null;

  @Column({ type: "int", nullable: true })
  usagePerUserLimit!: number | null;

  @Column({ type: "boolean", default: false })
  firstTimeUserOnly!: boolean;

  @Column({ type: "boolean", default: true })
  isActive!: boolean;

  @Column({ type: "timestamptz" })
  validFrom!: Date;

  @Column({ type: "timestamptz" })
  validUntil!: Date;

  @Column({ type: "uuid", nullable: true })
  freeItemCategoryId!: string | null;

  @ManyToOne(() => ItemCategory, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "freeItemCategoryId" })
  freeItemCategory!: ItemCategory | null;

  @Column({ type: "uuid", nullable: true })
  freeItemId!: string | null;

  @ManyToOne(() => Item, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "freeItemId" })
  freeItem!: Item | null;

  @Column({ type: "int", default: 0 })
  totalUsageCount!: number;

  @Column({ type: "varchar", length: 500, nullable: true })
  internalNote!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}

