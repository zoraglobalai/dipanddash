import { apiClient } from "@/lib/api-client";
import type { ApiSuccess } from "@/types/api";
import type {
  CreatePurchaseOrderInput,
  ProductBulkImportResult,
  ProductDayLedgerResponse,
  PurchaseBulkImportResult,
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
    targetSection?: "dip_and_dash" | "gaming" | "both";
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<ProductListResponse>>("/procurement/products", { params });
    return response.data;
  },

  getProductById: async (id: string) => {
    const response = await apiClient.get<ApiSuccess<{ product: ProductListItem }>>(`/procurement/products/${id}`);
    return response.data;
  },

  createProduct: async (payload: {
    name: string;
    category: string;
    sku?: string;
    packSize?: string;
    unit: string;
    minStock: number;
    sellingPrice?: number;
    targetSection?: "dip_and_dash" | "gaming" | "both";
    dipAndDashAssignedStock?: number;
    gamingAssignedStock?: number;
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
      minStock?: number;
      sellingPrice?: number;
      targetSection?: "dip_and_dash" | "gaming" | "both";
      dipAndDashAssignedStock?: number;
      gamingAssignedStock?: number;
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

  deletePurchaseOrder: async (id: string) => {
    const response = await apiClient.delete<ApiSuccess<{ purchaseOrder: { id: string; purchaseNumber: string } }>>(
      `/procurement/purchase-orders/${id}`
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
  downloadPurchaseBulkTemplate: async () => {
    return apiClient.get<Blob>("/procurement/purchase-orders/bulk/template", {
      responseType: "blob"
    });
  },
  importPurchaseBulkCsv: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.post<ApiSuccess<PurchaseBulkImportResult>>(
      "/procurement/purchase-orders/bulk/import",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      }
    );
    return response.data;
  },
  downloadProductBulkTemplate: async () => {
    return apiClient.get<Blob>("/procurement/products/bulk/template", {
      responseType: "blob"
    });
  },
  importProductBulkCsv: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await apiClient.post<ApiSuccess<ProductBulkImportResult>>(
      "/procurement/products/bulk/import",
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

  getProductLedger: async (params?: {
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    productId?: string;
    search?: string;
    targetSection?: "dip_and_dash" | "gaming" | "both";
    page?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get<ApiSuccess<ProductDayLedgerResponse>>("/procurement/products/ledger", {
      params
    });
    return response.data;
  },

  updateProductLedgerRecord: async (
    productId: string,
    date: string,
    payload: {
      productId?: string;
      date?: string;
      targetSection?: "dip_and_dash" | "gaming" | "both";
      stockHealth?: "LOW_STOCK" | "HEALTHY";
      openingStock: number;
      purchased: number;
      consumption: number;
      dipAndDashConsumption: number;
      snookerConsumption: number;
      note?: string;
    }
  ) => {
    const response = await apiClient.patch<ApiSuccess<{ row: ProductDayLedgerResponse["rows"][number] }>>(
      `/procurement/products/ledger/${productId}/${date}`,
      payload
    );
    return response.data;
  },

  deleteProductLedgerRecord: async (productId: string, date: string) => {
    const response = await apiClient.delete<ApiSuccess<{ productId: string; date: string; deleted: boolean }>>(
      `/procurement/products/ledger/${productId}/${date}`
    );
    return response.data;
  },

  getUnits: async () => {
    const response = await apiClient.get<ApiSuccess<ProcurementUnitsResponse>>("/procurement/units");
    return response.data;
  }
};
