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

import { User } from "../users/user.entity";
import {
  GAMING_BOOKING_STATUSES,
  GAMING_BOOKING_TYPES,
  GAMING_PAYMENT_MODES,
  GAMING_PAYMENT_STATUSES,
  type GamingPaymentMode,
  type GamingBookingStatus,
  type GamingBookingType,
  type GamingPaymentStatus
} from "./gaming.constants";

type BookingCustomerMember = {
  name: string;
  phone: string;
};

@Entity({ name: "gaming_bookings" })
@Index("IDX_gaming_bookings_booking_number_unique", ["bookingNumber"], { unique: true })
@Index("IDX_gaming_bookings_status", ["status"])
@Index("IDX_gaming_bookings_resource", ["resourceCode"])
@Index("IDX_gaming_bookings_check_in", ["checkInAt"])
export class GamingBooking {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 64 })
  bookingNumber!: string;

  @Column({ type: "varchar", length: 20 })
  bookingType!: GamingBookingType;

  @Column({ type: "varchar", length: 40 })
  resourceCode!: string;

  @Column({ type: "varchar", length: 120 })
  resourceLabel!: string;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  resourceCodes!: string[];

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  customerGroup!: BookingCustomerMember[];

  @Column({ type: "varchar", length: 120, nullable: true })
  primaryCustomerName!: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  primaryCustomerPhone!: string | null;

  @Column({ type: "timestamptz" })
  checkInAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  checkOutAt!: Date | null;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  hourlyRate!: number;

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  finalAmount!: number;

  @Column({ type: "varchar", length: 20, default: GAMING_BOOKING_STATUSES[1] })
  status!: GamingBookingStatus;

  @Column({ type: "varchar", length: 20, default: GAMING_PAYMENT_STATUSES[0] })
  paymentStatus!: GamingPaymentStatus;

  @Column({ type: "varchar", length: 20, nullable: true })
  paymentMode!: GamingPaymentMode | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  foodOrderReference!: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  foodInvoiceNumber!: string | null;

  @Column({ type: "varchar", length: 20, default: "none" })
  foodInvoiceStatus!: "none" | "pending" | "paid" | "cancelled";

  @Column({ type: "numeric", precision: 12, scale: 2, default: 0 })
  foodAndBeverageAmount!: number;

  @Column({ type: "varchar", length: 40, nullable: true })
  bookingChannel!: string | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  sourceDeviceId!: string | null;

  @Column({ type: "text", nullable: true })
  note!: string | null;

  @Column({ type: "uuid" })
  staffId!: string;

  @ManyToOne(() => User, { onDelete: "RESTRICT" })
  @JoinColumn({ name: "staffId" })
  staff!: User;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}

export const isValidBookingType = (value: string): value is GamingBookingType =>
  (GAMING_BOOKING_TYPES as readonly string[]).includes(value);

export const isValidBookingStatus = (value: string): value is GamingBookingStatus =>
  (GAMING_BOOKING_STATUSES as readonly string[]).includes(value);

export const isValidPaymentStatus = (value: string): value is GamingPaymentStatus =>
  (GAMING_PAYMENT_STATUSES as readonly string[]).includes(value);

export const isValidPaymentMode = (value: string): value is GamingPaymentMode =>
  (GAMING_PAYMENT_MODES as readonly string[]).includes(value);
