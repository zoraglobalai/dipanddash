import {
  Box,
  Button,
  HStack,
  Text,
  VStack
} from "@chakra-ui/react";
import { FiPlay, FiPlus } from "react-icons/fi";

import { PosDataTable, type PosTableColumn } from "@/components/common/PosDataTable";
import { formatINR } from "@/utils/currency";
import type { PendingBillSummary } from "@/types/pos";

type RecentBillsTableCardProps = {
  bills: PendingBillSummary[];
  onNewOrder: () => void;
  onResume: (localOrderId: string) => void;
};

export const RecentBillsTableCard = ({
  bills,
  onNewOrder,
  onResume
}: RecentBillsTableCardProps) => {
  const toLabel = (value: string | null | undefined, fallback: string) => {
    if (!value || typeof value !== "string") {
      return fallback;
    }
    return value.replace(/_/g, " ");
  };

  const getKitchenBadgeStyles = (status: PendingBillSummary["kitchenStatus"]) => {
    if (status === "ready" || status === "served") {
      return { bg: "green.100", color: "green.700", label: status === "served" ? "Served" : "Ready" };
    }
    if (status === "preparing") {
      return { bg: "orange.100", color: "orange.700", label: "Preparing" };
    }
    if (status === "queued") {
      return { bg: "blue.100", color: "blue.700", label: "Queued" };
    }
    return { bg: "gray.100", color: "gray.700", label: "Not Sent" };
  };

  const columns: PosTableColumn<PendingBillSummary>[] = [
    {
      key: "invoiceNumber",
      header: "Invoice",
      render: (bill) => <Text fontWeight={700}>{bill.invoiceNumber}</Text>
    },
    {
      key: "customer",
      header: "Customer",
      render: (bill) => (
        <VStack align="start" spacing={0}>
          <Text>{bill.customerName}</Text>
          <Text fontSize="xs" color="#7A6258">
            {bill.customerPhone}
          </Text>
        </VStack>
      )
    },
    {
      key: "orderType",
      header: "Order Type",
      render: (bill) => <Text textTransform="capitalize">{toLabel(bill.orderType, "takeaway")}</Text>
    },
    {
      key: "kitchenStatus",
      header: "Kitchen",
      render: (bill) => {
        const badge = getKitchenBadgeStyles(bill.kitchenStatus);
        return (
          <Box
            px={2.5}
            py={1}
            borderRadius="full"
            fontSize="xs"
            fontWeight={700}
            bg={badge.bg}
            color={badge.color}
            w="fit-content"
            textTransform="capitalize"
          >
            {badge.label}
          </Box>
        );
      }
    },
    {
      key: "totalAmount",
      header: "Total",
      isNumeric: true,
      render: (bill) => <Text fontWeight={700}>{formatINR(bill.totalAmount)}</Text>
    },
    {
      key: "resume",
      header: "Resume",
      alwaysVisible: true,
      render: (bill) => (
        <Button
          size="xs"
          variant="outline"
          leftIcon={<FiPlay />}
          onClick={(event) => {
            event.stopPropagation();
            onResume(bill.localOrderId);
          }}
        >
          Resume
        </Button>
      )
    },
    {
      key: "tableLabel",
      header: "Table",
      render: (bill) => bill.tableLabel ?? "-"
    },
    {
      key: "lineCount",
      header: "Items",
      isNumeric: true,
      render: (bill) => <Text fontWeight={700}>{bill.lineCount}</Text>
    },
    {
      key: "updatedAt",
      header: "Updated",
      render: (bill) => (
        <Text fontSize="xs" color="#7A6258">
          {new Date(bill.updatedAt).toLocaleString()}
        </Text>
      )
    }
  ];

  return (
    <VStack
      align="stretch"
      spacing={3}
      p={4}
      borderRadius="14px"
      border="1px solid"
      borderColor="rgba(132, 79, 52, 0.2)"
      bg="white"
      boxShadow="sm"
      minH="540px"
    >
      <HStack justify="space-between">
        <VStack align="start" spacing={0}>
          <Text fontWeight={900} color="#2A1A14">
            Pending Orders
          </Text>
          <Text fontSize="sm" color="#7A6258">
            All pending orders from this POS. Click a row to resume billing.
          </Text>
        </VStack>
        <Button leftIcon={<FiPlus />} onClick={onNewOrder}>
          New Order
        </Button>
      </HStack>

      {bills.length ? (
        <PosDataTable
          rows={bills}
          columns={columns}
          getRowId={(bill) => bill.localOrderId}
          emptyMessage="No pending orders. Start with a new order."
          maxColumns={6}
          onRowClick={(bill) => onResume(bill.localOrderId)}
        />
      ) : (
        <Box
          p={5}
          borderRadius="12px"
          border="1px dashed"
          borderColor="rgba(132, 79, 52, 0.25)"
          textAlign="center"
          color="#7A6258"
        >
          No pending orders. Start with a new order.
        </Box>
      )}
    </VStack>
  );
};
