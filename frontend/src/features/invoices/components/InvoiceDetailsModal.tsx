import {
  Box,
  Divider,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Text,
  VStack
} from "@chakra-ui/react";
import { useMemo, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { EmptyState } from "@/components/common/EmptyState";
import { AppButton } from "@/components/ui/AppButton";
import { DataTable } from "@/components/ui/DataTable";
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import type {
  InvoiceActivityRow,
  InvoiceDetail,
  InvoiceLineRow,
  InvoicePaymentRow,
  InvoiceUsageEventRow
} from "@/types/invoice";
import { formatQuantityWithUnit } from "@/utils/quantity";

type InvoiceDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading?: boolean;
  invoice: InvoiceDetail | null;
  lines: InvoiceLineRow[];
  payments: InvoicePaymentRow[];
  activities: InvoiceActivityRow[];
  usageEvents: InvoiceUsageEventRow[];
};

type InvoiceLineAddOn = {
  addOnId: string | undefined;
  name: string;
  quantity: number;
  unitPrice: number;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("en-IN") : "-";

const parseLineAddOns = (line: InvoiceLineRow): InvoiceLineAddOn[] => {
  const addOns = (line.meta as { addOns?: unknown } | null)?.addOns;
  if (!Array.isArray(addOns)) {
    return [];
  }

  return addOns
    .map((entry) => {
      const record = entry as Partial<InvoiceLineAddOn>;
      const name = typeof record.name === "string" ? record.name : "";
      const quantity = Number(record.quantity);
      const unitPrice = Number(record.unitPrice);
      if (!name || !Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
        return null;
      }
      return {
        addOnId: typeof record.addOnId === "string" ? record.addOnId : undefined,
        name,
        quantity,
        unitPrice
      } satisfies InvoiceLineAddOn;
    })
    .filter((entry): entry is InvoiceLineAddOn => Boolean(entry));
};

export const InvoiceDetailsModal = ({
  isOpen,
  onClose,
  loading,
  invoice,
  lines,
  payments,
  activities,
  usageEvents
}: InvoiceDetailsModalProps) => {
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);

  const lineColumns = useMemo(
    () =>
      [
        {
          key: "nameSnapshot",
          header: "Item",
          render: (row: InvoiceLineRow) => {
            const addOns = parseLineAddOns(row);
            return (
              <VStack align="start" spacing={0}>
                <Text fontWeight={700}>{row.nameSnapshot}</Text>
                {addOns.map((addOn) => (
                  <Text key={`${row.id}-${addOn.addOnId ?? addOn.name}`} fontSize="xs" color="#6A534A">
                    + {addOn.name} x{addOn.quantity * row.quantity}
                  </Text>
                ))}
              </VStack>
            );
          }
        },
        { key: "lineType", header: "Type" },
        {
          key: "quantity",
          header: "Qty",
          render: (row: InvoiceLineRow) => row.quantity
        },
        {
          key: "unitPrice",
          header: "Unit Price",
          render: (row: InvoiceLineRow) => formatCurrency(row.unitPrice)
        },
        {
          key: "lineTotal",
          header: "Line Total",
          render: (row: InvoiceLineRow) => {
            const addOns = parseLineAddOns(row);
            const addOnAmount = addOns.reduce(
              (sum, addOn) => sum + addOn.unitPrice * addOn.quantity * row.quantity,
              0
            );
            const baseAmount = Math.max(row.lineTotal - addOnAmount, 0);
            return (
              <VStack align="end" spacing={0}>
                <Text fontWeight={700}>{formatCurrency(row.lineTotal)}</Text>
                {addOns.length ? (
                  <Text fontSize="xs" color="#6A534A">
                    Base {formatCurrency(baseAmount)} + Add-ons {formatCurrency(addOnAmount)}
                  </Text>
                ) : null}
              </VStack>
            );
          }
        }
      ] as Array<{ key: string; header: string; render?: (row: InvoiceLineRow) => ReactNode }>,
    []
  );

  const paymentColumns = useMemo(
    () =>
      [
        { key: "mode", header: "Mode" },
        { key: "status", header: "Status" },
        {
          key: "amount",
          header: "Amount",
          render: (row: InvoicePaymentRow) => formatCurrency(row.amount)
        },
        {
          key: "receivedAmount",
          header: "Received",
          render: (row: InvoicePaymentRow) =>
            row.receivedAmount === null ? "-" : formatCurrency(row.receivedAmount)
        },
        {
          key: "changeAmount",
          header: "Change",
          render: (row: InvoicePaymentRow) =>
            row.changeAmount === null ? "-" : formatCurrency(row.changeAmount)
        },
        {
          key: "paidAt",
          header: "Paid At",
          render: (row: InvoicePaymentRow) => formatDateTime(row.paidAt)
        }
      ] as Array<{ key: string; header: string; render?: (row: InvoicePaymentRow) => ReactNode }>,
    []
  );

  const usageColumns = useMemo(
    () =>
      [
        { key: "ingredientNameSnapshot", header: "Ingredient" },
        {
          key: "consumedQuantity",
          header: "Consumed",
          render: (row: InvoiceUsageEventRow) => formatQuantityWithUnit(row.consumedQuantity, row.baseUnit)
        },
        {
          key: "allocatedQuantity",
          header: "Allocated",
          render: (row: InvoiceUsageEventRow) => formatQuantityWithUnit(row.allocatedQuantity, row.baseUnit)
        },
        {
          key: "overusedQuantity",
          header: "Overused",
          render: (row: InvoiceUsageEventRow) => formatQuantityWithUnit(row.overusedQuantity, row.baseUnit)
        },
        { key: "usageDate", header: "Date" }
      ] as Array<{ key: string; header: string; render?: (row: InvoiceUsageEventRow) => ReactNode }>,
    []
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        size="full"
        isCentered
        scrollBehavior="inside"
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
        <ModalOverlay />
        <ModalContent
          borderRadius={{ base: "0", md: "16px" }}
          my={{ base: 0, md: 4 }}
          mx={{ base: 0, md: 4 }}
          w={{ base: "100vw", md: "min(96vw, 1240px)" }}
          maxW={{ base: "100vw", md: "1240px" }}
          maxH={{ base: "100vh", md: "92vh" }}
        >
          <ModalHeader borderBottom="1px solid rgba(133, 78, 48, 0.16)" pr={16}>
            Invoice Details
          </ModalHeader>
          <ModalCloseButton top={4} right={4} />
          <ModalBody px={{ base: 4, md: 6 }} py={4}>
            {loading || !invoice ? (
              <Text color="#7D655B">Loading invoice details...</Text>
            ) : (
              <VStack spacing={4} align="stretch">
                <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
                  <Box p={3} borderRadius="12px" border="1px solid" borderColor="rgba(133, 78, 48, 0.2)">
                    <Text fontSize="xs" color="#7D655B">
                      Invoice Number
                    </Text>
                    <Text fontWeight={800}>{invoice.invoiceNumber}</Text>
                    <Text fontSize="sm" color="#7D655B">
                      {formatDateTime(invoice.createdAt)}
                    </Text>
                  </Box>
                  <Box p={3} borderRadius="12px" border="1px solid" borderColor="rgba(133, 78, 48, 0.2)">
                    <Text fontSize="xs" color="#7D655B">
                      Customer
                    </Text>
                    <Text fontWeight={700}>{invoice.customer?.name ?? "Walk-in customer"}</Text>
                    <Text fontSize="sm" color="#7D655B">
                      {invoice.customer?.phone ?? "-"}
                    </Text>
                  </Box>
                  <Box p={3} borderRadius="12px" border="1px solid" borderColor="rgba(133, 78, 48, 0.2)">
                    <Text fontSize="xs" color="#7D655B">
                      Staff
                    </Text>
                    <Text fontWeight={700}>{invoice.staff.fullName}</Text>
                    <Text fontSize="sm" color="#7D655B">
                      {invoice.staff.username}
                    </Text>
                  </Box>
                </SimpleGrid>

                <SimpleGrid columns={{ base: 2, md: 3, xl: 5 }} spacing={3}>
                  <Box p={3} borderRadius="12px" border="1px solid" borderColor="rgba(133, 78, 48, 0.16)" bg="#FFFDFA">
                    <Text fontSize="xs" color="#7D655B">
                      Subtotal
                    </Text>
                    <Text fontWeight={700}>{formatCurrency(invoice.subtotal)}</Text>
                  </Box>
                  <Box p={3} borderRadius="12px" border="1px solid" borderColor="rgba(133, 78, 48, 0.16)" bg="#FFFDFA">
                    <Text fontSize="xs" color="#7D655B">
                      Discount
                    </Text>
                    <Text fontWeight={700}>
                      {formatCurrency(
                        invoice.itemDiscountAmount +
                          invoice.couponDiscountAmount +
                          invoice.manualDiscountAmount
                        )}
                    </Text>
                  </Box>
                  <Box p={3} borderRadius="12px" border="1px solid" borderColor="rgba(133, 78, 48, 0.16)" bg="#FFFDFA">
                    <Text fontSize="xs" color="#7D655B">
                      Tax
                    </Text>
                    <Text fontWeight={700}>{formatCurrency(invoice.taxAmount)}</Text>
                  </Box>
                  <Box p={3} borderRadius="12px" border="1px solid" borderColor="rgba(133, 78, 48, 0.16)" bg="#FFFDFA">
                    <Text fontSize="xs" color="#7D655B">
                      Total
                    </Text>
                    <Text fontWeight={800}>{formatCurrency(invoice.totalAmount)}</Text>
                  </Box>
                  <Box p={3} borderRadius="12px" border="1px solid" borderColor="rgba(133, 78, 48, 0.16)" bg="#FFFDFA">
                    <Text fontSize="xs" color="#7D655B">
                      Status
                    </Text>
                    <Text fontWeight={700} textTransform="capitalize">
                      {invoice.status}
                    </Text>
                  </Box>
                </SimpleGrid>

                <Divider borderColor="rgba(133, 78, 48, 0.2)" />

                <Box>
                  <Text fontWeight={800} mb={2}>
                    Line Items
                  </Text>
                  <Box overflowX="auto">
                    <DataTable
                      columns={lineColumns}
                      rows={lines}
                      emptyState={
                        <EmptyState title="No line items" description="No line item rows found for this invoice." />
                      }
                    />
                  </Box>
                </Box>

                <Box>
                  <Text fontWeight={800} mb={2}>
                    Payments
                  </Text>
                  <Box overflowX="auto">
                    <DataTable
                      columns={paymentColumns}
                      rows={payments}
                      emptyState={
                        <EmptyState title="No payment rows" description="No payment records were captured." />
                      }
                    />
                  </Box>
                </Box>

                <Box>
                  <Text fontWeight={800} mb={2}>
                    Ingredient Usage
                  </Text>
                  <Box overflowX="auto">
                    <DataTable
                      columns={usageColumns}
                      rows={usageEvents}
                      emptyState={
                        <EmptyState
                          title="No usage events"
                          description="This invoice does not contain synced usage events."
                        />
                      }
                    />
                  </Box>
                </Box>

                <Box>
                  <Text fontWeight={800} mb={2}>
                    Activity Timeline
                  </Text>
                  {activities.length ? (
                    <VStack align="stretch" spacing={2}>
                      {activities.map((activity) => (
                        <Box
                          key={activity.id}
                          p={3}
                          borderRadius="12px"
                          border="1px solid"
                          borderColor="rgba(133, 78, 48, 0.2)"
                          bg="rgba(255,255,255,0.8)"
                        >
                          <HStack justify="space-between">
                            <Text fontWeight={700} textTransform="capitalize">
                              {activity.actionType}
                            </Text>
                            <Text fontSize="sm" color="#7D655B">
                              {formatDateTime(activity.createdAt)}
                            </Text>
                          </HStack>
                          <Text fontSize="sm" color="#705B52" mt={1}>
                            {activity.reason || "No reason provided"}
                          </Text>
                        </Box>
                      ))}
                    </VStack>
                  ) : (
                    <EmptyState title="No activity log" description="No activity records available for this invoice." />
                  )}
                </Box>
              </VStack>
            )}
          </ModalBody>
          <ModalFooter borderTop="1px solid rgba(133, 78, 48, 0.16)" bg="white">
            <AppButton variant="outline" onClick={requestClose}>
              Close
            </AppButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={isCloseConfirmOpen}
        title="Close this popup?"
        description="Are you sure you want to close this invoice details window?"
        onClose={cancelCloseRequest}
        onConfirm={confirmClose}
      />
    </>
  );
};
