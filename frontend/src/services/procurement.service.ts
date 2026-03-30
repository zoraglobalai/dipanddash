import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type {
  CreatePurchaseOrderInput,
  ProcurementMetaResponse,
  ProcurementStatsResponse,
  ProcurementUnitsResponse,
  ProductListItem,
  ProductListResponse,
  PurchaseOrderDetail,
  PurchaseOrderListResponse,
  SupplierListItem,
  SupplierListResponse
} from "@/types/procurement";

export const procurementService = {
  getSuppliers: async (params?: {
    search?: string;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<SupplierListResponse>>("/procurement/suppliers", { params });
    return response.data;
  },

  createSupplier: async (payload: { name: string; storeName?: string; phone: string; address?: string; isActive?: boolean }) => {
    const response = await apiClient.post<ApiSuccess<{ supplier: SupplierListItem }>>(
      "/procurement/suppliers",
      payload
    );
    return response.data;
  },

  updateSupplier: async (
    id: string,
    payload: { name?: string; storeName?: string; phone?: string; address?: string; isActive?: boolean }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ supplier: SupplierListItem }>>(
      `/procurement/suppliers/${id}`,
      payload
    );
    return response.data;
  },

  deleteSupplier: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ supplier: SupplierListItem }>>(`/procurement/suppliers/${id}`);
    return response.data;
  },

  getProducts: async (params?: {
    search?: string;
    category?: string;
    supplierId?: string;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<ProductListResponse>>("/procurement/products", { params });
    return response.data;
  },

  createProduct: async (payload: {
    name: string;
    category: string;
    sku?: string;
    packSize?: string;
    unit: string;
    currentStock: number;
    minStock: number;
    purchaseUnitPrice: number;
    defaultSupplierId?: string | null;
    isActive?: boolean;
  }) => {
    const response = await apiClient.post<ApiSuccess<{ product: ProductListItem }>>("/procurement/products", payload);
    return response.data;
  },

  updateProduct: async (
    id: string,
    payload: {
      name?: string;
      category?: string;
      sku?: string;
      packSize?: string;
      unit?: string;
      currentStock?: number;
      minStock?: number;
      purchaseUnitPrice?: number;
      defaultSupplierId?: string | null;
      isActive?: boolean;
    }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ product: ProductListItem }>>(
      `/procurement/products/${id}`,
      payload
    );
    return response.data;
  },

  deleteProduct: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ product: ProductListItem }>>(`/procurement/products/${id}`);
    return response.data;
  },

  getPurchaseOrders: async (params?: {
    search?: string;
    supplierId?: string;
    purchaseType?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<PurchaseOrderListResponse>>("/procurement/purchase-orders", {
      params
    });
    return response.data;
  },

  getPurchaseOrderById: async (id: string) => {
    const response = await apiClient.get<ApiSuccess<{ purchaseOrder: PurchaseOrderDetail }>>(
      `/procurement/purchase-orders/${id}`
    );
    return response.data;
  },

  createPurchaseOrder: async (payload: CreatePurchaseOrderInput) => {
    const response = await apiClient.post<ApiSuccess<{ purchaseOrder: PurchaseOrderDetail }>>(
      "/procurement/purchase-orders",
      payload
    );
    return response.data;
  },

  updatePurchaseOrder: async (id: string, payload: CreatePurchaseOrderInput) => {
    const response = await apiClient.patch<ApiSuccess<{ purchaseOrder: PurchaseOrderDetail }>>(
      `/procurement/purchase-orders/${id}`,
      payload
    );
    return response.data;
  },

  uploadPurchaseInvoiceImage: async (file: File) => {
    const formData = new FormData();
    formData.append("image", file);

    const response = await apiClient.post<ApiSuccess<{ imageUrl: string; fileName: string }>>(
      "/procurement/purchase-orders/upload-invoice",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      }
    );
    return response.data;
  },

  getMeta: async (params?: {
    date?: string;
    ingredientCategoryId?: string;
    ingredientSearch?: string;
    productSearch?: string;
  }) => {
    const response = await apiClient.get<ApiSuccess<ProcurementMetaResponse>>("/procurement/meta", { params });
    return response.data;
  },

  getStats: async (params?: { dateFrom?: string; dateTo?: string }) => {
    const response = await apiClient.get<ApiSuccess<ProcurementStatsResponse>>("/procurement/stats", { params });
    return response.data;
  },

  getUnits: async () => {
    const response = await apiClient.get<ApiSuccess<ProcurementUnitsResponse>>("/procurement/units");
    return response.data;
  }
};
