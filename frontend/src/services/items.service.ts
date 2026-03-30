import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type {
  AddOnDetail,
  AddOnListItem,
  ComboDetail,
  ComboItemRow,
  ComboListItem,
  ItemCategory,
  ItemDetail,
  ItemListItem,
  ItemMetaIngredient,
  ItemPagination,
  ItemRecipeRow,
  ItemUnitMeta
} from "@/types/item";
import type { IngredientUnit } from "@/types/ingredient";

type CategoryListResponse = {
  categories: ItemCategory[];
  pagination: ItemPagination;
};

type ItemListResponse = {
  items: ItemListItem[];
  pagination: ItemPagination;
};

type AddOnListResponse = {
  addOns: AddOnListItem[];
  pagination: ItemPagination;
};

type ComboListResponse = {
  combos: ComboListItem[];
  pagination: ItemPagination;
};

export const itemsService = {
  uploadImage: async (file: File) => {
    const formData = new FormData();
    formData.append("image", file);

    const response = await apiClient.post<ApiSuccess<{ imageUrl: string; fileName: string }>>(
      "/items/upload-image",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      }
    );
    return response.data;
  },
  getMetaIngredients: async () => {
    const response = await apiClient.get<ApiSuccess<{ ingredients: ItemMetaIngredient[] }>>(
      "/items/meta/ingredients"
    );
    return response.data;
  },
  getMetaCategories: async () => {
    const response = await apiClient.get<ApiSuccess<{ categories: ItemCategory[] }>>("/items/meta/categories");
    return response.data;
  },
  getMetaUnits: async () => {
    const response = await apiClient.get<ApiSuccess<{ units: ItemUnitMeta[] }>>("/items/meta/units");
    return response.data;
  },
  getMetaItems: async () => {
    const response = await apiClient.get<ApiSuccess<{ items: ItemListItem[] }>>("/items/meta/items");
    return response.data;
  },
  getCategories: async (params?: { search?: string; includeInactive?: boolean; page?: number; limit?: number }) => {
    const response = await apiClient.get<ApiSuccess<CategoryListResponse>>("/items/categories", { params });
    return response.data;
  },
  createCategory: async (payload: { name: string; description?: string }) => {
    const response = await apiClient.post<ApiSuccess<{ category: ItemCategory }>>("/items/categories", payload);
    return response.data;
  },
  updateCategory: async (id: string, payload: { name?: string; description?: string; isActive?: boolean }) => {
    const response = await apiClient.patch<ApiSuccess<{ category: ItemCategory }>>(
      `/items/categories/${id}`,
      payload
    );
    return response.data;
  },
  deleteCategory: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ category: ItemCategory }>>(`/items/categories/${id}`);
    return response.data;
  },
  getItems: async (params?: {
    search?: string;
    categoryId?: string;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<ItemListResponse>>("/items", { params });
    return response.data;
  },
  getItem: async (id: string) => {
    const response = await apiClient.get<ApiSuccess<{ item: ItemDetail }>>(`/items/${id}`);
    return response.data;
  },
  createItem: async (payload: {
    name: string;
    categoryId: string;
    sellingPrice: number;
    gstPercentage: number;
    imageUrl?: string;
    note?: string;
    ingredients: ItemRecipeRow[];
  }) => {
    const response = await apiClient.post<ApiSuccess<{ item: ItemDetail }>>("/items", payload);
    return response.data;
  },
  updateItem: async (
    id: string,
    payload: {
      name?: string;
      categoryId?: string;
      sellingPrice?: number;
      gstPercentage?: number;
      imageUrl?: string;
      note?: string;
      isActive?: boolean;
      ingredients?: ItemRecipeRow[];
    }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ item: ItemDetail }>>(`/items/${id}`, payload);
    return response.data;
  },
  deleteItem: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ item: ItemDetail }>>(`/items/${id}`);
    return response.data;
  },
  getAddOns: async (params?: { search?: string; includeInactive?: boolean; page?: number; limit?: number }) => {
    const response = await apiClient.get<ApiSuccess<AddOnListResponse>>("/items/add-ons", { params });
    return response.data;
  },
  getAddOn: async (id: string) => {
    const response = await apiClient.get<ApiSuccess<{ addOn: AddOnDetail }>>(`/items/add-ons/${id}`);
    return response.data;
  },
  createAddOn: async (payload: {
    name: string;
    sellingPrice: number;
    gstPercentage: number;
    imageUrl?: string;
    note?: string;
    ingredients: ItemRecipeRow[];
  }) => {
    const response = await apiClient.post<ApiSuccess<{ addOn: AddOnDetail }>>("/items/add-ons", payload);
    return response.data;
  },
  updateAddOn: async (
    id: string,
    payload: {
      name?: string;
      sellingPrice?: number;
      gstPercentage?: number;
      imageUrl?: string;
      note?: string;
      isActive?: boolean;
      ingredients?: ItemRecipeRow[];
    }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ addOn: AddOnDetail }>>(`/items/add-ons/${id}`, payload);
    return response.data;
  },
  deleteAddOn: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ addOn: AddOnDetail }>>(`/items/add-ons/${id}`);
    return response.data;
  },
  getCombos: async (params?: { search?: string; includeInactive?: boolean; page?: number; limit?: number }) => {
    const response = await apiClient.get<ApiSuccess<ComboListResponse>>("/items/combos", { params });
    return response.data;
  },
  getCombo: async (id: string) => {
    const response = await apiClient.get<ApiSuccess<{ combo: ComboDetail }>>(`/items/combos/${id}`);
    return response.data;
  },
  createCombo: async (payload: {
    name: string;
    sellingPrice: number;
    gstPercentage: number;
    imageUrl?: string;
    note?: string;
    items: ComboItemRow[];
  }) => {
    const response = await apiClient.post<ApiSuccess<{ combo: ComboDetail }>>("/items/combos", payload);
    return response.data;
  },
  updateCombo: async (
    id: string,
    payload: {
      name?: string;
      sellingPrice?: number;
      gstPercentage?: number;
      imageUrl?: string;
      note?: string;
      isActive?: boolean;
      items?: ComboItemRow[];
    }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ combo: ComboDetail }>>(`/items/combos/${id}`, payload);
    return response.data;
  },
  deleteCombo: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ combo: ComboDetail }>>(`/items/combos/${id}`);
    return response.data;
  },
  convertQuantity: (
    quantity: number,
    fromUnit: IngredientUnit,
    toUnit: IngredientUnit,
    units: ItemUnitMeta[]
  ): number | null => {
    const from = units.find((unit) => unit.value === fromUnit);
    const to = units.find((unit) => unit.value === toUnit);
    if (!from || !to || from.group !== to.group) {
      return null;
    }

    const factor: Record<string, number> = {
      mcg: 0.000001,
      mg: 0.001,
      g: 1,
      kg: 1000,
      quintal: 100000,
      ton: 1000000,
      ml: 1,
      cl: 10,
      dl: 100,
      l: 1000,
      gallon: 3785.411784,
      teaspoon: 5,
      tablespoon: 15,
      cup: 240,
      pcs: 1,
      piece: 1,
      count: 1,
      unit: 1,
      units: 1,
      pair: 2,
      dozen: 12,
      tray: 1,
      plate: 1,
      pack: 1,
      packet: 1,
      box: 1,
      bottle: 1,
      can: 1,
      jar: 1,
      tub: 1,
      pouch: 1,
      roll: 1,
      bag: 1,
      sack: 1,
      bundle: 1,
      carton: 1,
      crate: 1,
      loaf: 1,
      block: 1,
      custom: 1
    };

    const fromFactor = factor[fromUnit];
    const toFactor = factor[toUnit];

    if (!fromFactor || !toFactor) {
      return null;
    }

    return Number(((quantity * fromFactor) / toFactor).toFixed(6));
  }
};
