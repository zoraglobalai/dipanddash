import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { Outlet } from "./outlet.entity";

type OutletListFilters = {
  search?: string;
  includeInactive?: boolean;
  page: number;
  limit: number;
};

type CreateOutletPayload = {
  outletName: string;
  location: string;
  managerName: string;
  managerPhone: string;
  isActive?: boolean;
};

type UpdateOutletPayload = Partial<CreateOutletPayload>;

const getPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

const normalizeText = (value: string) => value.trim();

const mapOutletSummary = (outlet: Outlet) => ({
  id: outlet.id,
  outletCode: outlet.outletCode,
  outletName: outlet.outletName,
  location: outlet.location,
  managerName: outlet.managerName,
  managerPhone: outlet.managerPhone,
  isActive: outlet.isActive,
  createdAt: outlet.createdAt,
  updatedAt: outlet.updatedAt
});

export class OutletsService {
  private readonly outletRepository = AppDataSource.getRepository(Outlet);

  private async getOutletOrFail(id: string) {
    const outlet = await this.outletRepository.findOne({ where: { id } });
    if (!outlet) {
      throw new AppError(404, "Outlet not found");
    }
    return outlet;
  }

  private async getNextOutletCode() {
    const rows = await this.outletRepository
      .createQueryBuilder("outlet")
      .select("outlet.outletCode", "outletCode")
      .where("outlet.outletCode LIKE :prefix", { prefix: "DND%" })
      .getRawMany<{ outletCode: string }>();

    const maxNumber = rows.reduce((max, row) => {
      const numeric = Number(row.outletCode.replace("DND", ""));
      if (!Number.isFinite(numeric)) {
        return max;
      }
      return Math.max(max, numeric);
    }, 0);

    return `DND${String(maxNumber + 1).padStart(3, "0")}`;
  }

  private async createOutletWithGeneratedCode(payload: CreateOutletPayload) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const outletCode = await this.getNextOutletCode();
      try {
        const outlet = this.outletRepository.create({
          outletCode,
          outletName: normalizeText(payload.outletName),
          location: normalizeText(payload.location),
          managerName: normalizeText(payload.managerName),
          managerPhone: normalizeText(payload.managerPhone),
          isActive: payload.isActive ?? true
        });
        return await this.outletRepository.save(outlet);
      } catch (error) {
        const errorCode = (error as { code?: string })?.code;
        if (errorCode === "23505") {
          continue;
        }
        throw error;
      }
    }
    throw new AppError(500, "Unable to generate outlet code. Please try again.");
  }

  async listOutlets(filters: OutletListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.outletRepository.createQueryBuilder("outlet").orderBy("outlet.createdAt", "DESC");

    if (!filters.includeInactive) {
      query.andWhere("outlet.isActive = true");
    }

    if (filters.search) {
      query.andWhere(
        `(
          LOWER(outlet.outletCode) LIKE LOWER(:search)
          OR LOWER(outlet.outletName) LIKE LOWER(:search)
          OR LOWER(outlet.location) LIKE LOWER(:search)
          OR LOWER(outlet.managerName) LIKE LOWER(:search)
          OR LOWER(outlet.managerPhone) LIKE LOWER(:search)
        )`,
        { search: `%${filters.search}%` }
      );
    }

    const [outlets, total, totalOutlets, activeOutlets, inactiveOutlets, locationCount, lastCreatedOutlet, monthlyCount] =
      await Promise.all([
        query.clone().offset(offset).limit(limit).getMany(),
        query.getCount(),
        this.outletRepository.count(),
        this.outletRepository.count({ where: { isActive: true } }),
        this.outletRepository.count({ where: { isActive: false } }),
        this.outletRepository
          .createQueryBuilder("outlet")
          .select("COUNT(DISTINCT LOWER(outlet.location))", "count")
          .getRawOne<{ count: string }>(),
        this.outletRepository.createQueryBuilder("outlet").orderBy("outlet.createdAt", "DESC").getOne(),
        this.outletRepository
          .createQueryBuilder("outlet")
          .where("outlet.createdAt >= :fromDate", {
            fromDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString()
          })
          .getCount()
      ]);

    return {
      outlets: outlets.map(mapOutletSummary),
      pagination: getPaginationMeta(page, limit, total),
      stats: {
        totalOutlets,
        activeOutlets,
        inactiveOutlets,
        locationCount: Number(locationCount?.count ?? 0),
        createdLast30Days: monthlyCount,
        lastCreatedAt: lastCreatedOutlet?.createdAt ?? null
      }
    };
  }

  async createOutlet(payload: CreateOutletPayload) {
    const outlet = await this.createOutletWithGeneratedCode(payload);
    return mapOutletSummary(outlet);
  }

  async updateOutlet(id: string, payload: UpdateOutletPayload) {
    const outlet = await this.getOutletOrFail(id);

    if (payload.outletName !== undefined) {
      outlet.outletName = normalizeText(payload.outletName);
    }
    if (payload.location !== undefined) {
      outlet.location = normalizeText(payload.location);
    }
    if (payload.managerName !== undefined) {
      outlet.managerName = normalizeText(payload.managerName);
    }
    if (payload.managerPhone !== undefined) {
      outlet.managerPhone = normalizeText(payload.managerPhone);
    }
    if (payload.isActive !== undefined) {
      outlet.isActive = payload.isActive;
    }

    const saved = await this.outletRepository.save(outlet);
    return mapOutletSummary(saved);
  }
}
