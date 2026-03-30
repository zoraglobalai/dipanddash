import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from "typeorm";

import { User } from "../users/user.entity";
import { Item } from "../items/item.entity";
import { Coupon } from "./coupon.entity";

@Entity({ name: "coupon_usages" })
export class CouponUsage {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  couponId!: string;

  @ManyToOne(() => Coupon, { onDelete: "CASCADE" })
  @JoinColumn({ name: "couponId" })
  coupon!: Coupon;

  @Column({ type: "uuid", nullable: true })
  userId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "userId" })
  user!: User | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  orderId!: string | null;

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP" })
  usedAt!: Date;

  @Column({ type: "numeric", precision: 12, scale: 2, nullable: true })
  discountAmountApplied!: number | null;

  @Column({ type: "uuid", nullable: true })
  freeItemId!: string | null;

  @ManyToOne(() => Item, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "freeItemId" })
  freeItem!: Item | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;
}

