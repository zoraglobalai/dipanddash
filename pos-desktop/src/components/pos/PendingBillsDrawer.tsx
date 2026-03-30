import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  HStack,
  Text,
  VStack
} from "@chakra-ui/react";

import { formatINR } from "@/utils/currency";
import type { PendingBillSummary } from "@/types/pos";

type PendingBillsDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  pendingBills: PendingBillSummary[];
  onResume: (localOrderId: string) => Promise<void>;
};

export const PendingBillsDrawer = ({ isOpen, onClose, pendingBills, onResume }: PendingBillsDrawerProps) => {
  return (
    <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="sm">
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader>Pending Bills</DrawerHeader>
        <DrawerBody>
          <VStack align="stretch" spacing={3}>
            {pendingBills.length ? (
              pendingBills.map((bill) => (
                <Box
                  key={bill.localOrderId}
                  p={3}
                  borderRadius="12px"
                  border="1px solid"
                  borderColor="rgba(132, 79, 52, 0.2)"
                >
                  <HStack justify="space-between" align="start">
                    <VStack align="start" spacing={0}>
                      <Text fontWeight={800}>{bill.invoiceNumber}</Text>
                      <Text fontSize="sm" color="#6D584E">
                        {bill.customerName} ({bill.customerPhone})
                      </Text>
                      <Text fontSize="sm" color="#6D584E">
                        {bill.lineCount} items
                      </Text>
                    </VStack>
                    <Text fontWeight={800}>{formatINR(bill.totalAmount)}</Text>
                  </HStack>
                  <Button mt={3} size="sm" onClick={() => void onResume(bill.localOrderId)} width="full">
                    Resume
                  </Button>
                </Box>
              ))
            ) : (
              <Text color="#6D584E">No pending bills.</Text>
            )}
          </VStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};

