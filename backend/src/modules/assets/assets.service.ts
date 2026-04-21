import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { Asset } from "./asset.entity";

type AssetListFilters = {
  search?: string;
  includeInactive?: boolean;
  page: number;
  limit: number;
};

type CreateAssetPayload = {
  name: string;
  quantity: number;
  unit: string;
  isActive?: boolean;
};

type UpdateAssetPayload = Partial<CreateAssetPayload>;

const toQty = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Number(parsed.toFixed(3));
};

const getPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

const normalizeText = (value: string) => value.trim();

const mapAssetSummary = (asset: Asset) => ({
  id: asset.id,
  name: asset.name,
  quantity: toQty(asset.quantity),
  unit: asset.unit,
  isActive: asset.isActive,
  createdAt: asset.createdAt,
  updatedAt: asset.updatedAt
});

export class AssetsService {
  private readonly assetRepository = AppDataSource.getRepository(Asset);

  private async getAssetOrFail(id: string) {
    const asset = await this.assetRepository.findOne({ where: { id } });
    if (!asset) {
      throw new AppError(404, "Asset not found");
    }
    return asset;
  }

  async listAssets(filters: AssetListFilters) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 10));
    const offset = (page - 1) * limit;

    const query = this.assetRepository.createQueryBuilder("asset").orderBy("asset.updatedAt", "DESC");

    if (!filters.includeInactive) {
      query.andWhere("asset.isActive = true");
    }

    if (filters.search) {
      query.andWhere(
        `(
          LOWER(asset.name) LIKE LOWER(:search)
          OR LOWER(asset.unit) LIKE LOWER(:search)
        )`,
        { search: `%${filters.search}%` }
      );
    }

    const [assets, total, totalAssets, activeAssets, inactiveAssets, quantityRow] = await Promise.all([
      query.clone().offset(offset).limit(limit).getMany(),
      query.getCount(),
      this.assetRepository.count(),
      this.assetRepository.count({ where: { isActive: true } }),
      this.assetRepository.count({ where: { isActive: false } }),
      this.assetRepository
        .createQueryBuilder("asset")
        .select("COALESCE(SUM(asset.quantity), 0)", "totalQuantity")
        .where(filters.includeInactive ? "1 = 1" : "asset.isActive = true")
        .getRawOne<{ totalQuantity: string }>()
    ]);

    return {
      assets: assets.map(mapAssetSummary),
      pagination: getPaginationMeta(page, limit, total),
      stats: {
        totalAssets,
        activeAssets,
        inactiveAssets,
        totalQuantity: toQty(quantityRow?.totalQuantity ?? 0)
      }
    };
  }

  async createAsset(payload: CreateAssetPayload) {
    const normalizedName = normalizeText(payload.name);
    const normalizedUnit = normalizeText(payload.unit).toLowerCase();

    const existing = await this.assetRepository
      .createQueryBuilder("asset")
      .where("LOWER(asset.name) = LOWER(:name)", { name: normalizedName })
      .getOne();

    if (existing) {
      if (existing.isActive) {
        throw new AppError(409, "Asset with this name already exists");
      }

      existing.name = normalizedName;
      existing.quantity = toQty(payload.quantity);
      existing.unit = normalizedUnit;
      existing.isActive = payload.isActive ?? true;
      const savedExisting = await this.assetRepository.save(existing);
      return mapAssetSummary(savedExisting);
    }

    const asset = this.assetRepository.create({
      name: normalizedName,
      quantity: toQty(payload.quantity),
      unit: normalizedUnit,
      isActive: payload.isActive ?? true
    });

    const saved = await this.assetRepository.save(asset);
    return mapAssetSummary(saved);
  }

  async updateAsset(id: string, payload: UpdateAssetPayload) {
    const asset = await this.getAssetOrFail(id);

    if (payload.name !== undefined) {
      const normalizedName = normalizeText(payload.name);
      const duplicate = await this.assetRepository
        .createQueryBuilder("asset")
        .where("LOWER(asset.name) = LOWER(:name)", { name: normalizedName })
        .andWhere("asset.id != :id", { id })
        .getOne();

      if (duplicate) {
        throw new AppError(409, "Asset with this name already exists");
      }
      asset.name = normalizedName;
    }

    if (payload.quantity !== undefined) {
      asset.quantity = toQty(payload.quantity);
    }

    if (payload.unit !== undefined) {
      asset.unit = normalizeText(payload.unit).toLowerCase();
    }

    if (payload.isActive !== undefined) {
      asset.isActive = payload.isActive;
    }

    const saved = await this.assetRepository.save(asset);
    return mapAssetSummary(saved);
  }

  async deleteAsset(id: string) {
    const asset = await this.getAssetOrFail(id);
    await this.assetRepository.remove(asset);
    return mapAssetSummary(asset);
  }
}
