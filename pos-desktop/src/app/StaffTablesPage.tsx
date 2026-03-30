import { Button, HStack, Text, VStack } from "@chakra-ui/react";

import { usePos } from "@/app/PosContext";
import { PosDataTable, type PosTableColumn } from "@/components/common/PosDataTable";
import { formatINR } from "@/utils/currency";

type StaffTablesPageProps = {
  onResumeToBilling?: () => void;
};

export const StaffTablesPage = ({ onResumeToBilling }: StaffTablesPageProps) => {
  const { pendingBills, resumePending } = usePos();
  const dineInBills = pendingBills.filter((bill) => bill.orderType === "dine_in");

  const columns: PosTableColumn<(typeof dineInBills)[number]>[] = [
    {
      key: "invoiceNumber",
      header: "Invoice",
      render: (bill) => <Text fontWeight={700}>{bill.invoiceNumber}</Text>
    },
    {
      key: "customer",
      header: "Customer",
      render: (bill) => bill.customerName
    },
    {
      key: "tableLabel",
      header: "Table",
      render: (bill) => bill.tableLabel ?? "-"
    },
    {
      key: "totalAmount",
      header: "Total",
      isNumeric: true,
      render: (bill) => formatINR(bill.totalAmount)
    },
    {
      key: "action",
      header: "Action",
      alwaysVisible: true,
      render: (bill) => (
        <HStack>
          <Button
            size="xs"
            variant="outline"
            onClick={async () => {
              await resumePending(bill.localOrderId);
              onResumeToBilling?.();
            }}
          >
            Resume
          </Button>
        </HStack>
      )
    }
  ];

  return (
    <VStack align="stretch" spacing={4}>
      <VStack align="start" spacing={0}>
        <Text fontWeight={900} color="#2A1A14" fontSize="xl">
          Tables
        </Text>
      </VStack>

      <PosDataTable
        rows={dineInBills}
        columns={columns}
        getRowId={(bill) => bill.localOrderId}
        emptyMessage="No pending dine-in tables."
        maxColumns={6}
      />
    </VStack>
  );
};
