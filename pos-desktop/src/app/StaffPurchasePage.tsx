import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Grid,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Text,
  Textarea,
  VStack,
  useDisclosure,
  useToast
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FiEdit2, FiEye, FiPlus, FiTrash2 } from "react-icons/fi";

import { ActionIconButton } from "@/components/common/ActionIconButton";
import { PosDataTable } from "@/components/common/PosDataTable";
import { procurementService } from "@/services/procurement.service";
import type {
  CreatePurchaseOrderInput,
  ProcurementMetaResponse,
  ProcurementStatsResponse,
  PurchaseLineType,
  PurchaseOrderDetail,
  PurchaseOrderSummary
} from "@/types/procurement";
import { extractApiErrorMessage } from "@/utils/api-error";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value ?? 0);
const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const today = () => new Date().toISOString().slice(0, 10);
const lineId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type DraftLine = {
  id: string;
  lineType: PurchaseLineType;
  categoryId: string;
  ingredientId: string;
  productId: string;
  qty: string;
  quantityUnit: string;
  unitPrice: string;
};

const emptyLine = (): DraftLine => ({
  id: lineId(),
  lineType: "ingredient",
  categoryId: "",
  ingredientId: "",
  productId: "",
  qty: "1",
  quantityUnit: "",
  unitPrice: "0"
});

const defaultStats: ProcurementStatsResponse = {
  summary: {
    totalSuppliers: 0,
    totalProducts: 0,
    totalPurchaseOrders: 0,
    totalPurchaseAmount: 0,
    totalProductPurchasedQuantity: 0,
    totalProductPurchasedAmount: 0
  },
  recentPurchases: []
};

export const StaffPurchasePage = () => {
  const toast = useToast();
  const formModal = useDisclosure();
  const detailModal = useDisclosure();
  const [stats, setStats] = useState(defaultStats);
  const [meta, setMeta] = useState<ProcurementMetaResponse | null>(null);
  const [orders, setOrders] = useState<PurchaseOrderSummary[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<PurchaseOrderDetail | null>(null);
  const [editing, setEditing] = useState<PurchaseOrderDetail | null>(null);

  const [search, setSearch] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [limit, setLimit] = useState(10);

  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(today());
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoiceImageUrl, setInvoiceImageUrl] = useState("");

  const latestBill = stats.recentPurchases[0];

  const refreshMeta = useCallback(async (date = today()) => {
    const response = await procurementService.getMeta({ date });
    setMeta(response.data);
    return response.data;
  }, []);

  const refreshStats = useCallback(async () => {
    const response = await procurementService.getStats({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined
    });
    setStats(response.data);
  }, [dateFrom, dateTo]);

  const refreshOrders = useCallback(
    async (page = 1) => {
      const response = await procurementService.getPurchaseOrders({
        search: search || undefined,
        supplierId: supplierFilter || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page,
        limit
      });
      setOrders(response.data.orders);
      setPagination(response.data.pagination);
    },
    [dateFrom, dateTo, limit, search, supplierFilter]
  );

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([refreshMeta(), refreshStats(), refreshOrders(1)]);
    } catch (error) {
      toast({ status: "error", title: extractApiErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [refreshMeta, refreshOrders, refreshStats, toast]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const resetForm = (metaData?: ProcurementMetaResponse) => {
    const source = metaData ?? meta;
    setSupplierId(source?.suppliers[0]?.id ?? "");
    setPurchaseDate(source?.date ?? today());
    setNote("");
    setLines([emptyLine()]);
    setInvoiceFile(null);
    setInvoiceImageUrl("");
    setEditing(null);
  };

  const openCreate = async () => {
    try {
      const fresh = await refreshMeta();
      resetForm(fresh);
      formModal.onOpen();
    } catch (error) {
      toast({ status: "error", title: extractApiErrorMessage(error) });
    }
  };

  const openEdit = async (row: PurchaseOrderSummary) => {
    try {
      const detail = await procurementService.getPurchaseOrderById(row.id);
      const fresh = await refreshMeta(detail.data.purchaseOrder.purchaseDate);
      setEditing(detail.data.purchaseOrder);
      setSupplierId(detail.data.purchaseOrder.supplierId);
      setPurchaseDate(detail.data.purchaseOrder.purchaseDate);
      setNote(detail.data.purchaseOrder.note ?? "");
      setInvoiceFile(null);
      setInvoiceImageUrl(detail.data.purchaseOrder.invoiceImageUrl ?? "");
      setLines(
        detail.data.purchaseOrder.lines.map((line) => ({
          id: lineId(),
          lineType: line.lineType,
          categoryId:
            line.ingredientId
              ? fresh.ingredients.find((x) => x.id === line.ingredientId)?.categoryId ?? ""
              : "",
          ingredientId: line.ingredientId ?? "",
          productId: line.productId ?? "",
          qty: String(line.enteredQuantity ?? line.stockAdded),
          quantityUnit: line.enteredUnit ?? line.unit,
          unitPrice: String(line.unitPrice)
        }))
      );
      formModal.onOpen();
    } catch (error) {
      toast({ status: "error", title: extractApiErrorMessage(error) });
    }
  };

  const openDetail = async (row: PurchaseOrderSummary) => {
    try {
      const detail = await procurementService.getPurchaseOrderById(row.id);
      setSelected(detail.data.purchaseOrder);
      detailModal.onOpen();
    } catch (error) {
      toast({ status: "error", title: extractApiErrorMessage(error) });
    }
  };

  const savePurchase = async () => {
    try {
      setSaving(true);
      const payloadLines = lines
        .map((line) => {
          const qty = Number(line.qty);
          const price = Number(line.unitPrice);
          if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price < 0) {
            return null;
          }
          if (line.lineType === "ingredient" && !line.ingredientId) {
            return null;
          }
          if (line.lineType === "product" && !line.productId) {
            return null;
          }
          if (!line.quantityUnit) {
            return null;
          }
          return {
            lineType: line.lineType,
            ingredientId: line.lineType === "ingredient" ? line.ingredientId : undefined,
            productId: line.lineType === "product" ? line.productId : undefined,
            quantity: qty,
            quantityUnit: line.quantityUnit,
            unitPrice: price
          };
        })
        .filter(Boolean) as CreatePurchaseOrderInput["lines"];

      if (!supplierId || payloadLines.length !== lines.length) {
        toast({ status: "warning", title: "Please complete supplier and line fields." });
        return;
      }

      const payload: CreatePurchaseOrderInput = {
        supplierId,
        purchaseDate,
        note: note || undefined,
        invoiceImageUrl: invoiceImageUrl || undefined,
        lines: payloadLines
      };

      if (invoiceFile) {
        const upload = await procurementService.uploadPurchaseInvoiceImage(invoiceFile);
        payload.invoiceImageUrl = upload.data.imageUrl;
      }

      if (editing) {
        await procurementService.updatePurchaseOrder(editing.id, payload);
      } else {
        await procurementService.createPurchaseOrder(payload);
      }

      toast({ status: "success", title: editing ? "Purchase updated." : "Purchase created." });
      formModal.onClose();
      await Promise.all([refreshOrders(1), refreshStats(), refreshMeta(purchaseDate)]);
    } catch (error) {
      toast({ status: "error", title: extractApiErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const totalDraft = useMemo(
    () => lines.reduce((sum, line) => sum + (Number(line.qty) || 0) * (Number(line.unitPrice) || 0), 0),
    [lines]
  );

  return (
    <VStack align="stretch" spacing={4}>
      <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={3}>
        <Box p={4} bg="white" borderRadius="12px" border="1px solid rgba(132,79,52,0.2)"><Text fontSize="sm" color="#705B52">Purchase Orders</Text><Text fontSize="2xl" fontWeight={900}>{stats.summary.totalPurchaseOrders}</Text></Box>
        <Box p={4} bg="white" borderRadius="12px" border="1px solid rgba(132,79,52,0.2)"><Text fontSize="sm" color="#705B52">Purchase Amount</Text><Text fontSize="2xl" fontWeight={900}>{formatCurrency(stats.summary.totalPurchaseAmount)}</Text></Box>
        <Box p={4} bg="white" borderRadius="12px" border="1px solid rgba(132,79,52,0.2)"><Text fontSize="sm" color="#705B52">Suppliers</Text><Text fontSize="2xl" fontWeight={900}>{stats.summary.totalSuppliers}</Text></Box>
        <Box p={4} bg="white" borderRadius="12px" border="1px solid rgba(132,79,52,0.2)"><Text fontSize="sm" color="#705B52">Products</Text><Text fontSize="2xl" fontWeight={900}>{stats.summary.totalProducts}</Text></Box>
        <Box p={4} bg="white" borderRadius="12px" border="1px solid rgba(132,79,52,0.2)"><Text fontSize="sm" color="#705B52">Last Bill Amount</Text><Text fontSize="2xl" fontWeight={900}>{latestBill ? formatCurrency(latestBill.totalAmount) : "-"}</Text><Text fontSize="xs" color="#705B52">{latestBill ? latestBill.purchaseNumber : "No bill yet"}</Text></Box>
      </SimpleGrid>

      <Box p={4} bg="white" borderRadius="12px" border="1px solid rgba(132,79,52,0.2)">
        <Grid templateColumns={{ base: "1fr", md: "repeat(2,1fr)", xl: "repeat(5,1fr)" }} gap={3}>
          <FormControl><FormLabel fontWeight={700}>Search</FormLabel><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search purchase / supplier" /></FormControl>
          <FormControl><FormLabel fontWeight={700}>Supplier</FormLabel><Select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}><option value="">All Suppliers</option>{(meta?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormControl>
          <FormControl><FormLabel fontWeight={700}>From Date</FormLabel><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></FormControl>
          <FormControl><FormLabel fontWeight={700}>To Date</FormLabel><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></FormControl>
          <FormControl><FormLabel fontWeight={700}>Rows per page</FormLabel><Select value={limit} onChange={(e) => setLimit(Number(e.target.value))}><option value={5}>5</option><option value={10}>10</option><option value={20}>20</option></Select></FormControl>
        </Grid>
        <HStack mt={4} justify="space-between" flexWrap="wrap" gap={3}>
          <Button variant="outline" isLoading={loading} onClick={() => void Promise.all([refreshOrders(1), refreshStats()])}>Refresh</Button>
          <Button leftIcon={<FiPlus />} onClick={() => void openCreate()}>New Purchase</Button>
        </HStack>
        <Box mt={4}>
          <PosDataTable
            rows={orders}
            getRowId={(row) => row.id}
            emptyMessage={loading ? "Loading purchase orders..." : "No purchase orders found"}
            loading={loading}
            columns={[
              { key: "purchase", header: "Purchase No", render: (row) => <Text fontWeight={800}>{row.purchaseNumber}</Text>, alwaysVisible: true },
              { key: "supplier", header: "Supplier", render: (row) => row.supplierName, alwaysVisible: true },
              { key: "date", header: "Date", render: (row) => formatDate(row.purchaseDate) },
              { key: "items", header: "Total Items", render: (row) => <Text fontSize="sm" color="#705B52">Ingredients: {row.ingredientLineCount} | Products: {row.productLineCount}</Text> },
              { key: "total", header: "Total", render: (row) => formatCurrency(row.totalAmount) },
              { key: "by", header: "Created By", render: (row) => row.createdByUserName ?? "-" },
              {
                key: "actions",
                header: "Actions",
                alwaysVisible: true,
                render: (row) => (
                  <HStack spacing={2}>
                    <ActionIconButton aria-label="View" tooltip="View" icon={<FiEye size={16} />} size="sm" variant="outline" onClick={() => void openDetail(row)} />
                    <ActionIconButton aria-label="Edit" tooltip="Edit" icon={<FiEdit2 size={16} />} size="sm" variant="outline" onClick={() => void openEdit(row)} />
                  </HStack>
                )
              }
            ]}
          />
        </Box>
        <HStack justify="space-between" mt={4}>
          <Button variant="outline" size="sm" isDisabled={pagination.page <= 1} onClick={() => void refreshOrders(pagination.page - 1)}>Previous</Button>
          <Text fontWeight={700}>Page {pagination.page} of {pagination.totalPages}</Text>
          <Button variant="outline" size="sm" isDisabled={pagination.page >= pagination.totalPages} onClick={() => void refreshOrders(pagination.page + 1)}>Next</Button>
        </HStack>
      </Box>

      <Modal isOpen={formModal.isOpen} onClose={formModal.onClose} size={{ base: "full", lg: "6xl" }} isCentered scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent borderRadius="16px">
          <ModalHeader>{editing ? "Edit Purchase Order" : "Create Purchase Order"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <VStack align="stretch" spacing={4}>
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                <FormControl><FormLabel fontWeight={700}>Supplier</FormLabel><Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Select</option>{(meta?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FormControl>
                <FormControl><FormLabel fontWeight={700}>Purchase Date</FormLabel><Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} /></FormControl>
                <Box border="1px solid rgba(132,79,52,0.2)" borderRadius="12px" px={4} py={3}><Text fontSize="sm" color="#705B52">Draft Total</Text><Text fontSize="2xl" fontWeight={900}>{formatCurrency(totalDraft)}</Text></Box>
              </SimpleGrid>

              {lines.map((line, index) => {
                const ingredients = (meta?.ingredients ?? []).filter((i) => !line.categoryId || i.categoryId === line.categoryId);
                const selectedIngredient = ingredients.find((i) => i.id === line.ingredientId);
                const selectedProduct = (meta?.products ?? []).find((x) => x.id === line.productId);
                const unitOptions =
                  line.lineType === "ingredient"
                    ? selectedIngredient?.unitOptions ?? []
                    : selectedProduct?.unitOptions ?? [];
                return (
                  <Box key={line.id} p={4} border="1px solid rgba(132,79,52,0.2)" borderRadius="12px" bg="white">
                    <Grid templateColumns={{ base: "1fr", lg: "repeat(7,1fr)" }} gap={3}>
                      <FormControl><FormLabel fontWeight={700}>Line {index + 1} Type</FormLabel><Select value={line.lineType} onChange={(e) => setLines((prev) => prev.map((x) => x.id === line.id ? { ...x, lineType: e.target.value as PurchaseLineType, ingredientId: "", productId: "", quantityUnit: "", unitPrice: "0" } : x))}><option value="ingredient">Ingredient</option><option value="product">Product</option></Select></FormControl>
                      {line.lineType === "ingredient" ? (
                        <>
                          <FormControl><FormLabel fontWeight={700}>Category</FormLabel><Select value={line.categoryId} onChange={(e) => setLines((prev) => prev.map((x) => x.id === line.id ? { ...x, categoryId: e.target.value, ingredientId: "" } : x))}><option value="">All</option>{(meta?.ingredientCategories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormControl>
                          <FormControl><FormLabel fontWeight={700}>Ingredient</FormLabel><Select value={line.ingredientId} onChange={(e) => { const id = e.target.value; const ingredient = ingredients.find((x) => x.id === id); setLines((prev) => prev.map((x) => x.id === line.id ? { ...x, ingredientId: id, quantityUnit: ingredient?.unit ?? x.quantityUnit, unitPrice: ingredient ? String(ingredient.perUnitPrice) : x.unitPrice } : x)); }}><option value="">Select</option>{ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></FormControl>
                        </>
                      ) : (
                        <FormControl><FormLabel fontWeight={700}>Product</FormLabel><Select value={line.productId} onChange={(e) => { const id = e.target.value; const product = (meta?.products ?? []).find((x) => x.id === id); setLines((prev) => prev.map((x) => x.id === line.id ? { ...x, productId: id, quantityUnit: product?.unit ?? x.quantityUnit, unitPrice: product ? String(product.purchaseUnitPrice) : x.unitPrice } : x)); }}><option value="">Select</option>{(meta?.products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></FormControl>
                      )}
                      <FormControl><FormLabel fontWeight={700}>Quantity</FormLabel><Input type="number" min={0} step="0.001" value={line.qty} onChange={(e) => setLines((prev) => prev.map((x) => x.id === line.id ? { ...x, qty: e.target.value } : x))} /></FormControl>
                      <FormControl><FormLabel fontWeight={700}>Unit</FormLabel><Select value={line.quantityUnit} onChange={(e) => setLines((prev) => prev.map((x) => x.id === line.id ? { ...x, quantityUnit: e.target.value } : x))}><option value="">Select unit</option>{unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</Select></FormControl>
                      <FormControl><FormLabel fontWeight={700}>Unit Price</FormLabel><Input type="number" min={0} step="0.01" value={line.unitPrice} onChange={(e) => setLines((prev) => prev.map((x) => x.id === line.id ? { ...x, unitPrice: e.target.value } : x))} /></FormControl>
                      <FormControl><FormLabel fontWeight={700}>Actions</FormLabel><ActionIconButton aria-label="Remove line" tooltip="Remove line" icon={<FiTrash2 size={16} />} variant="outline" size="sm" onClick={() => setLines((prev) => prev.length > 1 ? prev.filter((x) => x.id !== line.id) : prev)} /></FormControl>
                    </Grid>
                    {line.lineType === "ingredient" && selectedIngredient ? (
                      <Text mt={2} fontSize="sm" color="#705B52">
                        Stock: {selectedIngredient.currentStock} {selectedIngredient.unit} | Base Unit: {selectedIngredient.unit}
                      </Text>
                    ) : null}
                    {line.lineType === "product" && selectedProduct ? (
                      <Text mt={2} fontSize="sm" color="#705B52">
                        Stock: {selectedProduct.currentStock} {selectedProduct.unit} | Base Unit: {selectedProduct.unit}
                      </Text>
                    ) : null}
                  </Box>
                );
              })}

              <HStack justify="space-between" flexWrap="wrap">
                <Button variant="outline" leftIcon={<FiPlus />} onClick={() => setLines((prev) => [...prev, emptyLine()])}>Add Line</Button>
                <Text fontWeight={900}>Total: {formatCurrency(totalDraft)}</Text>
              </HStack>

              <FormControl>
                <FormLabel fontWeight={700}>Note (Optional)</FormLabel>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
              </FormControl>

              <FormControl>
                <FormLabel fontWeight={700}>Invoice Image (Optional)</FormLabel>
                <Input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  p={1}
                  onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                />
                {invoiceImageUrl ? (
                  <Text mt={2} fontSize="xs" color="#705B52">
                    Existing invoice image available. Upload new file to replace it.
                  </Text>
                ) : null}
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={3}>
            <Button variant="outline" onClick={formModal.onClose}>Cancel</Button>
            <Button isLoading={saving} onClick={() => void savePurchase()}>{editing ? "Save Purchase" : "Create Purchase"}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={detailModal.isOpen} onClose={detailModal.onClose} size="4xl" isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="16px">
          <ModalHeader>Purchase Details</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {selected ? (
              <VStack align="stretch" spacing={3}>
                <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3}>
                  <Box p={3} border="1px solid rgba(132,79,52,0.2)" borderRadius="10px"><Text fontSize="xs" color="#705B52">Purchase No</Text><Text fontWeight={900}>{selected.purchaseNumber}</Text></Box>
                  <Box p={3} border="1px solid rgba(132,79,52,0.2)" borderRadius="10px"><Text fontSize="xs" color="#705B52">Supplier</Text><Text fontWeight={900}>{selected.supplierName}</Text></Box>
                  <Box p={3} border="1px solid rgba(132,79,52,0.2)" borderRadius="10px"><Text fontSize="xs" color="#705B52">Date</Text><Text fontWeight={900}>{formatDate(selected.purchaseDate)}</Text></Box>
                  <Box p={3} border="1px solid rgba(132,79,52,0.2)" borderRadius="10px"><Text fontSize="xs" color="#705B52">Total</Text><Text fontWeight={900}>{formatCurrency(selected.totalAmount)}</Text></Box>
                </SimpleGrid>
                <Text fontSize="sm" color="#705B52">Created By: {selected.createdByUserName ?? "-"}</Text>
                {selected.lines.map((line) => (
                  <Box key={line.id} p={3} border="1px solid rgba(132,79,52,0.2)" borderRadius="10px">
                    <Text fontWeight={800}>{line.itemNameSnapshot}</Text>
                    <Text fontSize="sm" color="#705B52" textTransform="capitalize">
                      {line.lineType} | Entered: {line.enteredQuantity ?? line.stockAdded} {line.enteredUnit ?? line.unit}
                    </Text>
                    <Text fontSize="sm" color="#705B52">
                      Base Added: {line.stockAdded} {line.unit} | {formatCurrency(line.unitPrice)} | {formatCurrency(line.lineTotal)}
                    </Text>
                  </Box>
                ))}
              </VStack>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={detailModal.onClose}>Close</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
};
