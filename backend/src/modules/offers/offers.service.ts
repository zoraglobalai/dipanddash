import { In } from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { ItemCategory } from "../items/item-category.entity";
import { Item } from "../items/item.entity";
import { User } from "../users/user.entity";
import { Coupon } from "./coupon.entity";
import { CouponUsage } from "./coupon-usage.entity";
import {
  type CouponDerivedStatus,
  type CouponDiscountType
} from "./offers.constants";

type CouponListFilters = {
  page: number;
  limit: number;
  search?: string;
  discountType?: CouponDiscountType;
  status?: CouponDerivedStatus;
  firstTimeUserOnly?: boolean;
};

type CouponPayload = {
  couponCode: string;
  title?: string;
  description?: string;
  discountType: CouponDiscountType;
  discountValue?: number | null;
  minimumOrderAmount?: number | null;
  maximumDiscountAmount?: number | null;
  maxUses?: number | null;
  usagePerUserLimit?: number | null;
  firstTimeUserOnly?: boolean;
  isActive?: boolean;
  validFrom: Date;
  validUntil: Date;
  freeItemCategoryId?: string | null;
  freeItemId?: string | null;
  internalNote?: string;
};

type CouponUpdatePayload = Partial<CouponPayload>;

type CouponDraft = {
  couponCode: string;
  title: string | null;
  description: string | null;
  discountType: CouponDiscountType;
  discountValue: number | null;
  minimumOrderAmount: number | null;
  maximumDiscountAmount: number | null;
  maxUses: number | null;
  usagePerUserLimit: number | null;
  firstTimeUserOnly: boolean;
  isActive: boolean;
  validFrom: Date;
  validUntil: Date;
  freeItemCategoryId: string | null;
  freeItemId: string | null;
  internalNote: string | null;
};

const getNumericValue = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toMoney = (value: string | number | null | undefined) =>
  Number(getNumericValue(value).toFixed(2));

const toFixed = (value: string | number | null | undefined, digits = 2) =>
  Number(getNumericValue(value).toFixed(digits));

const cleanOptionalText = (value?: string | null) => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const sanitizeCouponCode = (value: string) => value.replace(/\s+/g, "").toUpperCase();

const getPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

export class OffersService {
  private readonly couponRepository = AppDataSource.getRepository(Coupon);
  private readonly couponUsageRepository = AppDataSource.getRepository(CouponUsage);
  private readonly itemCategoryRepository = AppDataSource.getRepository(ItemCategory);
  private readonly itemRepository = AppDataSource.getRepository(Item);
  private readonly userRepository = AppDataSource.getRepository(User);

  private deriveStatus(coupon: {
    isActive: boolean;
    validFrom: Date;
    validUntil: Date;
  }): CouponDerivedStatus {
    const now = new Date();
    if (!coupon.isActive) {
      return "disabled";
    }
    if (coupon.validFrom > now) {
      return "scheduled";
    }
    if (coupon.validUntil < now) {
      return "expired";
    }
    return "active";
  }

  private getRewardPreview(coupon: Coupon, freeItemName?: string | null) {
    if (coupon.discountType === "percentage") {
      return `${toFixed(coupon.discountValue)}% off`;
    }
    if (coupon.discountType === "fixed_amount") {
      return `INR ${toMoney(coupon.discountValue)} off`;
    }
    return `Free ${freeItemName || "item"}`;
  }

  private async getCouponUsageCountMap(couponIds: string[]) {
    if (!couponIds.length) {
      return new Map<string, number>();
    }

    const usageCounts = await this.couponUsageRepository
      .createQueryBuilder("usage")
      .select("usage.couponId", "couponId")
      .addSelect("COUNT(*)", "count")
      .where("usage.couponId IN (:...couponIds)", { couponIds })
      .groupBy("usage.couponId")
      .getRawMany<{ couponId: string; count: string }>();

    return new Map(usageCounts.map((entry) => [entry.couponId, Number(entry.count)]));
  }

  private async validateUniqueCouponCode(couponCode: string, excludeId?: string) {
    const query = this.couponRepository
      .createQueryBuilder("coupon")
      .where("LOWER(coupon.couponCode) = LOWER(:couponCode)", { couponCode });

    if (excludeId) {
      query.andWhere("coupon.id != :excludeId", { excludeId });
    }

    const exists = await query.getOne();
    if (exists) {
      throw new AppError(409, "Coupon code already exists");
    }
  }

  private async ensureFreeItemBelongsToCategory(freeItemCategoryId: string, freeItemId: string) {
    const [category, item] = await Promise.all([
      this.itemCategoryRepository.findOne({
        where: { id: freeItemCategoryId, isActive: true }
      }),
      this.itemRepository.findOne({
        where: { id: freeItemId, isActive: true },
        relations: { category: true }
      })
    ]);

    if (!category) {
      throw new AppError(404, "Selected free item category was not found");
    }
    if (!item) {
      throw new AppError(404, "Selected free item was not found");
    }
    if (item.categoryId !== freeItemCategoryId) {
      throw new AppError(422, "Selected item does not belong to the selected category");
    }
  }

  private async validateCouponDraft(draft: CouponDraft) {
    if (draft.validUntil <= draft.validFrom) {
      throw new AppError(422, "Valid until date must be after valid from date");
    }

    if (draft.discountType === "percentage") {
      if (draft.discountValue === null || draft.discountValue <= 0) {
        throw new AppError(422, "Please enter a valid percentage discount value");
      }
      if (draft.discountValue > 100) {
        throw new AppError(422, "Percentage discount cannot exceed 100");
      }
      draft.freeItemCategoryId = null;
      draft.freeItemId = null;
      return;
    }

    if (draft.discountType === "fixed_amount") {
      if (draft.discountValue === null || draft.discountValue <= 0) {
        throw new AppError(422, "Please enter a valid fixed amount discount value");
      }
      draft.freeItemCategoryId = null;
      draft.freeItemId = null;
      return;
    }

    draft.discountValue = null;
    draft.maximumDiscountAmount = null;

    if (!draft.freeItemCategoryId || !draft.freeItemId) {
      throw new AppError(422, "Please select a free item");
    }

    await this.ensureFreeItemBelongsToCategory(draft.freeItemCategoryId, draft.freeItemId);
  }

  private buildCreateDraft(payload: CouponPayload): CouponDraft {
    return {
      couponCode: sanitizeCouponCode(payload.couponCode),
      title: cleanOptionalText(payload.title) ?? null,
      description: cleanOptionalText(payload.description) ?? null,
      discountType: payload.discountType,
      discountValue:
        payload.discountValue === undefined || payload.discountValue === null
          ? null
          : toMoney(payload.discountValue),
      minimumOrderAmount:
        payload.minimumOrderAmount === undefined || payload.minimumOrderAmount === null
          ? null
          : toMoney(payload.minimumOrderAmount),
      maximumDiscountAmount:
        payload.maximumDiscountAmount === undefined || payload.maximumDiscountAmount === null
          ? null
          : toMoney(payload.maximumDiscountAmount),
      maxUses: payload.maxUses ?? null,
      usagePerUserLimit: payload.usagePerUserLimit ?? null,
      firstTimeUserOnly: payload.firstTimeUserOnly ?? false,
      isActive: payload.isActive ?? true,
      validFrom: new Date(payload.validFrom),
      validUntil: new Date(payload.validUntil),
      freeItemCategoryId: payload.freeItemCategoryId ?? null,
      freeItemId: payload.freeItemId ?? null,
      internalNote: cleanOptionalText(payload.internalNote) ?? null
    };
  }

  private buildUpdateDraft(existing: Coupon, payload: CouponUpdatePayload): CouponDraft {
    return {
      couponCode:
        payload.couponCode !== undefined
          ? sanitizeCouponCode(payload.couponCode)
          : existing.couponCode,
      title:
        payload.title !== undefined
          ? (cleanOptionalText(payload.title) ?? null)
          : existing.title,
      description:
        payload.description !== undefined
          ? (cleanOptionalText(payload.description) ?? null)
          : existing.description,
      discountType: payload.discountType ?? existing.discountType,
      discountValue:
        payload.discountValue !== undefined
          ? payload.discountValue === null
            ? null
            : toMoney(payload.discountValue)
          : existing.discountValue === null
            ? null
            : toMoney(existing.discountValue),
      minimumOrderAmount:
        payload.minimumOrderAmount !== undefined
          ? payload.minimumOrderAmount === null
            ? null
            : toMoney(payload.minimumOrderAmount)
          : existing.minimumOrderAmount === null
            ? null
            : toMoney(existing.minimumOrderAmount),
      maximumDiscountAmount:
        payload.maximumDiscountAmount !== undefined
          ? payload.maximumDiscountAmount === null
            ? null
            : toMoney(payload.maximumDiscountAmount)
          : existing.maximumDiscountAmount === null
            ? null
            : toMoney(existing.maximumDiscountAmount),
      maxUses: payload.maxUses !== undefined ? payload.maxUses : existing.maxUses,
      usagePerUserLimit:
        payload.usagePerUserLimit !== undefined ? payload.usagePerUserLimit : existing.usagePerUserLimit,
      firstTimeUserOnly:
        payload.firstTimeUserOnly !== undefined
          ? payload.firstTimeUserOnly
          : existing.firstTimeUserOnly,
      isActive: payload.isActive !== undefined ? payload.isActive : existing.isActive,
      validFrom: payload.validFrom ? new Date(payload.validFrom) : existing.validFrom,
      validUntil: payload.validUntil ? new Date(payload.validUntil) : existing.validUntil,
      freeItemCategoryId:
        payload.freeItemCategoryId !== undefined ? payload.freeItemCategoryId : existing.freeItemCategoryId,
      freeItemId: payload.freeItemId !== undefined ? payload.freeItemId : existing.freeItemId,
      internalNote:
        payload.internalNote !== undefined
          ? (cleanOptionalText(payload.internalNote) ?? null)
          : existing.internalNote
    };
  }

  private mapCouponSummary(coupon: Coupon, usageCountMap: Map<string, number>) {
    const usageCountFromRows = usageCountMap.get(coupon.id) ?? 0;
    const currentUsageCount = Math.max(usageCountFromRows, coupon.totalUsageCount ?? 0);
    const remainingUses = coupon.maxUses ? Math.max(coupon.maxUses - currentUsageCount, 0) : null;
    const usagePercentage = coupon.maxUses
      ? Number(((currentUsageCount / coupon.maxUses) * 100).toFixed(2))
      : null;

    return {
      id: coupon.id,
      couponCode: coupon.couponCode,
      title: coupon.title,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue === null ? null : toMoney(coupon.discountValue),
      minimumOrderAmount:
        coupon.minimumOrderAmount === null ? null : toMoney(coupon.minimumOrderAmount),
      maximumDiscountAmount:
        coupon.maximumDiscountAmount === null ? null : toMoney(coupon.maximumDiscountAmount),
      maxUses: coupon.maxUses,
      usagePerUserLimit: coupon.usagePerUserLimit,
      firstTimeUserOnly: coupon.firstTimeUserOnly,
      isActive: coupon.isActive,
      validFrom: coupon.validFrom,
      validUntil: coupon.validUntil,
      freeItemCategoryId: coupon.freeItemCategoryId,
      freeItemCategoryName: coupon.freeItemCategory?.name ?? null,
      freeItemId: coupon.freeItemId,
      freeItemName: coupon.freeItem?.name ?? null,
      rewardPreview: this.getRewardPreview(coupon, coupon.freeItem?.name ?? null),
      derivedStatus: this.deriveStatus(coupon),
      currentUsageCount,
      remainingUses,
      usagePercentage,
      internalNote: coupon.internalNote,
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt
    };
  }

  private async getCouponOrFail(couponId: string) {
    const coupon = await this.couponRepository.findOne({
      where: { id: couponId },
      relations: {
        freeItemCategory: true,
        freeItem: true
      }
    });

    if (!coupon) {
      throw new AppError(404, "Coupon not found");
    }

    return coupon;
  }

  async listCoupons(filters: CouponListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(50, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.couponRepository
      .createQueryBuilder("coupon")
      .leftJoinAndSelect("coupon.freeItemCategory", "freeItemCategory")
      .leftJoinAndSelect("coupon.freeItem", "freeItem")
      .where("1 = 1")
      .orderBy("coupon.createdAt", "DESC");

    if (filters.search) {
      query.andWhere("(LOWER(coupon.couponCode) LIKE LOWER(:search) OR LOWER(coupon.title) LIKE LOWER(:search))", {
        search: `%${filters.search}%`
      });
    }

    if (filters.discountType) {
      query.andWhere("coupon.discountType = :discountType", { discountType: filters.discountType });
    }

    if (filters.firstTimeUserOnly !== undefined) {
      query.andWhere("coupon.firstTimeUserOnly = :firstTimeUserOnly", {
        firstTimeUserOnly: filters.firstTimeUserOnly
      });
    }

    if (filters.status) {
      const now = new Date();
      if (filters.status === "disabled") {
        query.andWhere("coupon.isActive = false");
      } else if (filters.status === "scheduled") {
        query.andWhere("coupon.isActive = true").andWhere("coupon.validFrom > :now", { now });
      } else if (filters.status === "expired") {
        query.andWhere("coupon.isActive = true").andWhere("coupon.validUntil < :now", { now });
      } else {
        query
          .andWhere("coupon.isActive = true")
          .andWhere("coupon.validFrom <= :now", { now })
          .andWhere("coupon.validUntil >= :now", { now });
      }
    }

    const total = await query.getCount();
    const coupons = await query.offset(offset).limit(limit).getMany();

    const usageCountMap = await this.getCouponUsageCountMap(coupons.map((coupon) => coupon.id));

    return {
      coupons: coupons.map((coupon) => this.mapCouponSummary(coupon, usageCountMap)),
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  async getCoupon(id: string) {
    const coupon = await this.getCouponOrFail(id);
    const usageCountMap = await this.getCouponUsageCountMap([id]);
    return this.mapCouponSummary(coupon, usageCountMap);
  }

  async createCoupon(payload: CouponPayload) {
    const draft = this.buildCreateDraft(payload);

    await this.validateUniqueCouponCode(draft.couponCode);
    await this.validateCouponDraft(draft);

    const coupon = this.couponRepository.create({
      couponCode: draft.couponCode,
      title: draft.title,
      description: draft.description,
      discountType: draft.discountType,
      discountValue: draft.discountValue,
      minimumOrderAmount: draft.minimumOrderAmount,
      maximumDiscountAmount: draft.maximumDiscountAmount,
      maxUses: draft.maxUses,
      usagePerUserLimit: draft.usagePerUserLimit,
      firstTimeUserOnly: draft.firstTimeUserOnly,
      isActive: draft.isActive,
      validFrom: draft.validFrom,
      validUntil: draft.validUntil,
      freeItemCategoryId: draft.freeItemCategoryId,
      freeItemId: draft.freeItemId,
      totalUsageCount: 0,
      internalNote: draft.internalNote
    });

    const savedCoupon = await this.couponRepository.save(coupon);
    return this.getCoupon(savedCoupon.id);
  }

  async updateCoupon(id: string, payload: CouponUpdatePayload) {
    const existing = await this.getCouponOrFail(id);
    const draft = this.buildUpdateDraft(existing, payload);

    if (draft.couponCode !== existing.couponCode) {
      await this.validateUniqueCouponCode(draft.couponCode, id);
    }
    await this.validateCouponDraft(draft);

    existing.couponCode = draft.couponCode;
    existing.title = draft.title;
    existing.description = draft.description;
    existing.discountType = draft.discountType;
    existing.discountValue = draft.discountValue;
    existing.minimumOrderAmount = draft.minimumOrderAmount;
    existing.maximumDiscountAmount = draft.maximumDiscountAmount;
    existing.maxUses = draft.maxUses;
    existing.usagePerUserLimit = draft.usagePerUserLimit;
    existing.firstTimeUserOnly = draft.firstTimeUserOnly;
    existing.isActive = draft.isActive;
    existing.validFrom = draft.validFrom;
    existing.validUntil = draft.validUntil;
    existing.freeItemCategoryId = draft.freeItemCategoryId;
    existing.freeItemId = draft.freeItemId;
    existing.internalNote = draft.internalNote;

    await this.couponRepository.save(existing);
    return this.getCoupon(id);
  }

  async updateCouponStatus(id: string, isActive: boolean) {
    const coupon = await this.getCouponOrFail(id);
    coupon.isActive = isActive;
    await this.couponRepository.save(coupon);
    return this.getCoupon(id);
  }

  async deleteCoupon(id: string) {
    const coupon = await this.getCouponOrFail(id);
    await this.couponRepository.remove(coupon);
    return {
      id: coupon.id,
      couponCode: coupon.couponCode
    };
  }

  async listCouponUsages(couponId: string, pagination: { page: number; limit: number }) {
    const coupon = await this.getCouponOrFail(couponId);

    const page = Math.max(1, pagination.page || 1);
    const limit = Math.min(50, Math.max(1, pagination.limit || 10));
    const offset = (page - 1) * limit;

    const total = await this.couponUsageRepository.count({
      where: {
        couponId
      }
    });

    const usages = await this.couponUsageRepository.find({
      where: { couponId },
      relations: {
        user: true,
        freeItem: true
      },
      order: { usedAt: "DESC" },
      skip: offset,
      take: limit
    });

    const mappedUsages = usages.map((usage) => ({
      id: usage.id,
      userId: usage.userId,
      userName: usage.user?.fullName ?? "Guest User",
      username: usage.user?.username ?? "-",
      email: usage.user?.email ?? null,
      couponCode: coupon.couponCode,
      orderReference: usage.orderId ?? `ORD-${usage.id.slice(0, 8).toUpperCase()}`,
      discountAmountApplied:
        usage.discountAmountApplied === null ? null : toMoney(usage.discountAmountApplied),
      freeItemId: usage.freeItemId,
      freeItemName: usage.freeItem?.name ?? null,
      benefitText:
        coupon.discountType === "free_item"
          ? `Free ${usage.freeItem?.name ?? coupon.freeItem?.name ?? "item"}`
          : `INR ${toMoney(usage.discountAmountApplied)} discount`,
      usedAt: usage.usedAt,
      createdAt: usage.createdAt
    }));

    const totalUsageCount = Math.max(total, coupon.totalUsageCount ?? 0);
    const remainingUses = coupon.maxUses ? Math.max(coupon.maxUses - totalUsageCount, 0) : null;
    const usagePercentage = coupon.maxUses
      ? Number(((totalUsageCount / coupon.maxUses) * 100).toFixed(2))
      : null;

    return {
      summary: {
        couponId: coupon.id,
        couponCode: coupon.couponCode,
        maxUses: coupon.maxUses,
        currentUsageCount: totalUsageCount,
        remainingUses,
        usagePercentage
      },
      usages: mappedUsages,
      pagination: getPaginationMeta(page, limit, total)
    };
  }

  async getStats() {
    const now = new Date();

    const [totalCoupons, activeCoupons, expiredCoupons, scheduledCoupons, disabledCoupons, freeItemCoupons, totalCouponUsages] =
      await Promise.all([
        this.couponRepository.count(),
        this.couponRepository
          .createQueryBuilder("coupon")
          .where("coupon.isActive = true")
          .andWhere("coupon.validFrom <= :now", { now })
          .andWhere("coupon.validUntil >= :now", { now })
          .getCount(),
        this.couponRepository
          .createQueryBuilder("coupon")
          .where("coupon.isActive = true")
          .andWhere("coupon.validUntil < :now", { now })
          .getCount(),
        this.couponRepository
          .createQueryBuilder("coupon")
          .where("coupon.isActive = true")
          .andWhere("coupon.validFrom > :now", { now })
          .getCount(),
        this.couponRepository
          .createQueryBuilder("coupon")
          .where("coupon.isActive = false")
          .getCount(),
        this.couponRepository
          .createQueryBuilder("coupon")
          .where("coupon.discountType = :discountType", { discountType: "free_item" })
          .getCount(),
        this.couponUsageRepository.count()
      ]);

    return {
      totalCoupons,
      activeCoupons,
      expiredCoupons,
      scheduledCoupons,
      disabledCoupons,
      totalCouponUsages,
      freeItemCoupons
    };
  }

  async getMetaItemCategories() {
    const categories = await this.itemCategoryRepository.find({
      where: { isActive: true },
      order: { name: "ASC" }
    });

    return categories.map((category) => ({
      id: category.id,
      name: category.name
    }));
  }

  async getMetaItems(categoryId?: string) {
    const query = this.itemRepository
      .createQueryBuilder("item")
      .leftJoinAndSelect("item.category", "category")
      .where("item.isActive = true")
      .orderBy("item.name", "ASC");

    if (categoryId) {
      query.andWhere("item.categoryId = :categoryId", { categoryId });
    }

    const items = await query.getMany();

    return items.map((item) => ({
      id: item.id,
      name: item.name,
      categoryId: item.categoryId,
      categoryName: item.category.name,
      sellingPrice: toMoney(item.sellingPrice)
    }));
  }

  async createMockUsage(couponId: string) {
    const coupon = await this.getCouponOrFail(couponId);
    const users = await this.userRepository.find({
      where: { isActive: true },
      take: 1,
      order: { createdAt: "DESC" }
    });

    if (!users.length) {
      throw new AppError(404, "No users available to attach mock usage");
    }

    const usage = this.couponUsageRepository.create({
      couponId: coupon.id,
      userId: users[0].id,
      orderId: `MOCK-${Date.now()}`,
      usedAt: new Date(),
      discountAmountApplied:
        coupon.discountType === "free_item" ? null : toMoney(coupon.discountValue),
      freeItemId: coupon.discountType === "free_item" ? coupon.freeItemId : null
    });

    await this.couponUsageRepository.save(usage);
    coupon.totalUsageCount = Math.max(0, coupon.totalUsageCount) + 1;
    await this.couponRepository.save(coupon);
    return this.listCouponUsages(coupon.id, { page: 1, limit: 10 });
  }
}
