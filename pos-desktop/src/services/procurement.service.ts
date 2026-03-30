import { apiClient } from "@/lib/api-client";
import type {
  CreatePurchaseOrderInput,
  ProcurementMetaResponse,
  ProcurementStatsResponse,
  PurchaseOrderDetail,
  PurchaseOrderListResponse,
  SupplierListItem
} from "@/types/procurement";

type ApiSuccess<T> = {
  success: true;
  message: string;
  data: T;
};

export const procurementService = {
  async getSuppliers(params?: { search?: string; includeInactive?: boolean; page?: number; limit?: number }) {
    const response = await apiClient.get<ApiSuccess<{ suppliers: SupplierListItem[] }>>(
      "/procurement/suppliers",
      { params }
    );
    return response.data;
  },

  async getPurchaseOrders(params?: {
    search?: string;
    supplierId?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    const response = await apiClient.get<ApiSuccess<PurchaseOrderListResponse>>(
      "/procurement/purchase-orders",
      { params }
    );
    return response.data;
  },

  async getPurchaseOrderById(id: string) {
    const response = await apiClient.get<ApiSuccess<{ purchaseOrder: PurchaseOrderDetail }>>(
      `/procurement/purchase-orders/${id}`
    );
    return response.data;
  },

  async createPurchaseOrder(payload: CreatePurchaseOrderInput) {
    const response = await apiClient.post<ApiSuccess<{ purchaseOrder: PurchaseOrderDetail }>>(
      "/procurement/purchase-orders",
      payload
    );
    return response.data;
  },

  async updatePurchaseOrder(id: string, payload: CreatePurchaseOrderInput) {
    const response = await apiClient.patch<ApiSuccess<{ purchaseOrder: PurchaseOrderDetail }>>(
      `/procurement/purchase-orders/${id}`,
      payload
    );
    return response.data;
  },

  async uploadPurchaseInvoiceImage(file: File) {
    const formData = new FormData();
    formData.append("image", file);
    const response = await apiClient.post<ApiSuccess<{ imageUrl: string }>>(
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

  async getMeta(params?: {
    date?: string;
    ingredientCategoryId?: string;
    ingredientSearch?: string;
    productSearch?: string;
  }) {
    const response = await apiClient.get<ApiSuccess<ProcurementMetaResponse>>("/procurement/meta", { params });
    return response.data;
  },

  async getStats(params?: { dateFrom?: string; dateTo?: string }) {
    const response = await apiClient.get<ApiSuccess<ProcurementStatsResponse>>("/procurement/stats", { params });
    return response.data;
  }
};
