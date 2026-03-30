import {
  Box,
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

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { AppButton } from "@/components/ui/AppButton";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import type { IngredientStockDetails, IngredientStockLog } from "@/types/ingredient";
import { formatQuantityWithUnit } from "@/utils/quantity";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short"
});

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

type StockDetailsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading?: boolean;
  stock: IngredientStockDetails | null;
  logs: IngredientStockLog[];
};

export const StockDetailsModal = ({ isOpen, onClose, loading, stock, logs }: StockDetailsModalProps) => {
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        isCentered
        size="3xl"
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
      <ModalOverlay />
      <ModalContent borderRadius="16px">
        <ModalHeader>Stock Details</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {loading ? (
            <Text color="#6F5A50">Loading stock details...</Text>
          ) : stock ? (
            <VStack spacing={4} align="stretch">
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
                <Box
                  p={3}
                  borderRadius="12px"
                  border="1px solid"
                  borderColor="rgba(142, 9, 9, 0.15)"
                  bg="rgba(255, 248, 237, 0.7)"
                >
                  <Text fontSize="sm" color="#6F5A50">
                    Ingredient
                  </Text>
                  <Text fontWeight={800}>
                    {stock.ingredientName}
                  </Text>
                </Box>
                <Box
                  p={3}
                  borderRadius="12px"
                  border="1px solid"
                  borderColor="rgba(142, 9, 9, 0.15)"
                  bg="rgba(255, 248, 237, 0.7)"
                >
                  <Text fontSize="sm" color="#6F5A50">
                    Per Unit Price
                  </Text>
                  <Text fontWeight={800}>{currencyFormatter.format(stock.perUnitPrice)}</Text>
                </Box>
                <Box
                  p={3}
                  borderRadius="12px"
                  border="1px solid"
                  borderColor="rgba(142, 9, 9, 0.15)"
                  bg="rgba(255, 248, 237, 0.7)"
                >
                  <Text fontSize="sm" color="#6F5A50">
                    Current Stock
                  </Text>
                  <Text fontWeight={800}>{formatQuantityWithUnit(stock.totalStock, stock.unit)}</Text>
                </Box>
                <Box
                  p={3}
                  borderRadius="12px"
                  border="1px solid"
                  borderColor="rgba(142, 9, 9, 0.15)"
                  bg="rgba(255, 248, 237, 0.7)"
                >
                  <Text fontSize="sm" color="#6F5A50">
                    Min Stock
                  </Text>
                  <Text fontWeight={800}>{formatQuantityWithUnit(stock.minStock, stock.unit)}</Text>
                </Box>
                <Box
                  p={3}
                  borderRadius="12px"
                  border="1px solid"
                  borderColor="rgba(142, 9, 9, 0.15)"
                  bg="rgba(255, 248, 237, 0.7)"
                >
                  <Text fontSize="sm" color="#6F5A50">
                    Total Valuation
                  </Text>
                  <Text fontWeight={800}>{currencyFormatter.format(stock.totalValuation)}</Text>
                </Box>
              </SimpleGrid>

                <DataTable
                  columns={[
                    { key: "type", header: "Type" },
                    {
                      key: "quantity",
                      header: "Quantity",
                      render: (row: IngredientStockLog) => formatQuantityWithUnit(row.quantity, stock.unit)
                    },
                    { key: "note", header: "Note", render: (row: IngredientStockLog) => row.note || "-" },
                  {
                    key: "createdAt",
                    header: "Date",
                    render: (row: IngredientStockLog) => dateFormatter.format(new Date(row.createdAt))
                  }
                ]}
                rows={logs}
                emptyState={<EmptyState title="No stock logs yet" description="Stock log entries will appear here." />}
              />
            </VStack>
          ) : (
            <EmptyState title="No stock data found" description="Select an ingredient to load stock details." />
          )}
        </ModalBody>
        <ModalFooter>
          <AppButton variant="outline" onClick={requestClose}>
            Close
          </AppButton>
        </ModalFooter>
      </ModalContent>
      </Modal>
      <ConfirmDialog
        isOpen={isCloseConfirmOpen}
        title="Close this popup?"
        description="Are you sure you want to close this details window?"
        onClose={cancelCloseRequest}
        onConfirm={confirmClose}
      />
    </>
  );
};
