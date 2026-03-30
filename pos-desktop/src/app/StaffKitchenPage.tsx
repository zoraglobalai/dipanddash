import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Box,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Select,
  Text,
  VStack,
  useDisclosure
} from "@chakra-ui/react";
import { useMemo, useRef, useState } from "react";

import { usePos } from "@/app/PosContext";
import { PosDataTable, type PosTableColumn } from "@/components/common/PosDataTable";
import type { KitchenStatus, PosOrder } from "@/types/pos";

const statusOptions: Array<{ label: string; value: KitchenStatus }> = [
  { label: "Queued", value: "queued" },
  { label: "Preparing", value: "preparing" },
  { label: "Ready", value: "ready" },
  { label: "Served", value: "served" }
];

const KITCHEN_STATUS_STYLES: Record<KitchenStatus, { label: string; bg: string; color: string }> = {
  not_sent: { label: "Not Sent", bg: "gray.100", color: "gray.700" },
  queued: { label: "Queued", bg: "blue.100", color: "blue.700" },
  preparing: { label: "Preparing", bg: "orange.100", color: "orange.700" },
  ready: { label: "Ready", bg: "green.100", color: "green.700" },
  served: { label: "Served", bg: "purple.100", color: "purple.700" }
};

const toLabel = (value: string | null | undefined, fallback: string) => {
  if (!value || typeof value !== "string") {
    return fallback;
  }
  return value.replace(/_/g, " ");
};

const resolveKitchenStatus = (value: string | null | undefined): KitchenStatus => {
  if (value === "queued" || value === "preparing" || value === "ready" || value === "served") {
    return value;
  }
  return "queued";
};

const formatLineText = (line: PosOrder["lines"][number]) => {
  const addOns = line.addOns ?? [];
  const addOnText = addOns.length
    ? ` | Add-ons: ${addOns.map((addOn) => `${addOn.name} x${addOn.quantity * line.quantity}`).join(", ")}`
    : "";
  return `${line.name} x${line.quantity}${addOnText}`;
};

export const StaffKitchenPage = () => {
  const { kitchenOrders, refreshKitchenOrders, updateKitchenStatus } = usePos();
  const [statusDrafts, setStatusDrafts] = useState<Record<string, KitchenStatus>>({});
  const [confirmTarget, setConfirmTarget] = useState<{
    localOrderId: string;
    invoiceNumber: string;
    nextStatus: KitchenStatus;
  } | null>(null);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [viewOrder, setViewOrder] = useState<PosOrder | null>(null);
  const viewModal = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const rows = useMemo(() => kitchenOrders, [kitchenOrders]);

  const columns = useMemo<PosTableColumn<PosOrder>[]>(
    () => [
      {
        key: "invoiceNumber",
        header: "Invoice",
        render: (order) => <Text fontWeight={700}>{order.invoiceNumber}</Text>
      },
      {
        key: "customer",
        header: "Customer",
        render: (order) => (
          <VStack align="start" spacing={0}>
            <Text>{order.customer?.name ?? "Walk-in"}</Text>
            <Text fontSize="xs" color="#7A6258">
              {order.customer?.phone ?? "-"}
            </Text>
          </VStack>
        )
      },
      {
        key: "orderType",
        header: "Type",
        render: (order) => <Text textTransform="capitalize">{toLabel(order.orderType, "takeaway")}</Text>
      },
      {
        key: "lineCount",
        header: "Items",
        render: (order) => (
          <Text color="#5E4A41" fontSize="sm">
            {order.lines.length} line{order.lines.length === 1 ? "" : "s"}
          </Text>
        )
      },
      {
        key: "status",
        header: "Status",
        render: (order) => {
          const kitchenStatus = resolveKitchenStatus(order.kitchenStatus);
          const styles = KITCHEN_STATUS_STYLES[kitchenStatus];
          return (
            <Box
              px={2.5}
              py={1}
              borderRadius="full"
              fontSize="xs"
              fontWeight={700}
              bg={styles.bg}
              color={styles.color}
              w="fit-content"
            >
              {styles.label}
            </Box>
          );
        }
      },
      {
        key: "update",
        header: "Update",
        alwaysVisible: true,
        render: (order) => {
          const kitchenStatus = resolveKitchenStatus(order.kitchenStatus);
          const selectedStatus = statusDrafts[order.localOrderId] ?? kitchenStatus;
          const isStatusChanged = selectedStatus !== kitchenStatus;

          return (
            <HStack>
              <Select
                size="sm"
                value={selectedStatus}
                onChange={(event) =>
                  setStatusDrafts((previous) => ({
                    ...previous,
                    [order.localOrderId]: event.target.value as KitchenStatus
                  }))
                }
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="outline"
                isDisabled={!isStatusChanged}
                onClick={() =>
                  setConfirmTarget({
                    localOrderId: order.localOrderId,
                    invoiceNumber: order.invoiceNumber,
                    nextStatus: selectedStatus
                  })
                }
              >
                Save
              </Button>
            </HStack>
          );
        }
      },
      {
        key: "view",
        header: "View",
        render: (order) => (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setViewOrder(order);
              viewModal.onOpen();
            }}
          >
            View
          </Button>
        )
      },
      {
        key: "tableLabel",
        header: "Table",
        render: (order) => order.tableLabel ?? "-"
      }
    ],
    [statusDrafts, viewModal]
  );

  return (
    <VStack align="stretch" spacing={4}>
      <HStack justify="space-between" flexWrap="wrap" gap={3}>
        <VStack align="start" spacing={0}>
          <Text fontWeight={900} color="#2A1A14" fontSize="xl">
            Kitchen Queue
          </Text>
          <Text fontSize="sm" color="#705B52">
            Orders sent from billing with item, combo, free item and add-on details.
          </Text>
        </VStack>
        <Button variant="outline" onClick={() => void refreshKitchenOrders()}>
          Refresh
        </Button>
      </HStack>

      <PosDataTable
        rows={rows}
        columns={columns}
        getRowId={(order) => order.localOrderId}
        emptyMessage='No kitchen orders yet. Use "Send To Kitchen" from billing.'
        maxColumns={7}
      />

      <Modal isOpen={viewModal.isOpen} onClose={viewModal.onClose} size="2xl" isCentered scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Kitchen Order View</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={4}>
            {viewOrder ? (
              <VStack align="stretch" spacing={3}>
                <HStack justify="space-between">
                  <VStack align="start" spacing={0}>
                    <Text fontWeight={800}>{viewOrder.invoiceNumber}</Text>
                    <Text fontSize="sm" color="#705B52">
                      {viewOrder.customer?.name ?? "Walk-in"} ({viewOrder.customer?.phone ?? "-"})
                    </Text>
                  </VStack>
                  <Box
                    px={2.5}
                    py={1}
                    borderRadius="full"
                    fontSize="xs"
                    fontWeight={700}
                    bg={KITCHEN_STATUS_STYLES[resolveKitchenStatus(viewOrder.kitchenStatus)].bg}
                    color={KITCHEN_STATUS_STYLES[resolveKitchenStatus(viewOrder.kitchenStatus)].color}
                  >
                    {KITCHEN_STATUS_STYLES[resolveKitchenStatus(viewOrder.kitchenStatus)].label}
                  </Box>
                </HStack>

                <Text fontSize="sm" color="#705B52">
                  Type: {toLabel(viewOrder.orderType, "takeaway")} | Table: {viewOrder.tableLabel ?? "-"}
                </Text>

                <VStack align="stretch" spacing={2}>
                  {viewOrder.lines.map((line) => (
                    <Box
                      key={line.lineId}
                      border="1px solid"
                      borderColor="rgba(132, 79, 52, 0.15)"
                      borderRadius="10px"
                      px={3}
                      py={2}
                    >
                      <Text fontWeight={700} fontSize="sm">
                        {formatLineText(line)}
                      </Text>
                    </Box>
                  ))}
                </VStack>
              </VStack>
            ) : null}
          </ModalBody>
        </ModalContent>
      </Modal>

      <AlertDialog
        isOpen={Boolean(confirmTarget)}
        leastDestructiveRef={cancelRef}
        onClose={() => {
          if (isSavingStatus) {
            return;
          }
          setConfirmTarget(null);
        }}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Confirm Status Update
            </AlertDialogHeader>

            <AlertDialogBody>
              Update <strong>{confirmTarget?.invoiceNumber ?? "-"}</strong> to{" "}
              <strong>
                {confirmTarget ? KITCHEN_STATUS_STYLES[confirmTarget.nextStatus].label : "-"}
              </strong>
              ?
            </AlertDialogBody>

            <AlertDialogFooter>
              <Button ref={cancelRef} variant="outline" onClick={() => setConfirmTarget(null)} isDisabled={isSavingStatus}>
                Cancel
              </Button>
              <Button
                ml={3}
                isLoading={isSavingStatus}
                onClick={async () => {
                  if (!confirmTarget) {
                    return;
                  }
                  setIsSavingStatus(true);
                  try {
                    await updateKitchenStatus(confirmTarget.localOrderId, confirmTarget.nextStatus);
                    setStatusDrafts((previous) => {
                      const next = { ...previous };
                      delete next[confirmTarget.localOrderId];
                      return next;
                    });
                    setConfirmTarget(null);
                  } finally {
                    setIsSavingStatus(false);
                  }
                }}
              >
                Confirm
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </VStack>
  );
};
