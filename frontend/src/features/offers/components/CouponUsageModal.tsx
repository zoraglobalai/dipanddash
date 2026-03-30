import {
  Box,
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
  CouponUsageRow,
  CouponUsageSummary
} from "@/types/offer";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const formatDateTime = (value: string) => new Date(value).toLocaleString("en-IN");

type CouponUsageModalProps = {
  isOpen: boolean;
  onClose: () => void;
  loading?: boolean;
  summary?: CouponUsageSummary | null;
  usages: CouponUsageRow[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
};

export const CouponUsageModal = ({
  isOpen,
  onClose,
  loading,
  summary,
  usages,
  page,
  totalPages,
  total,
  onPageChange
}: CouponUsageModalProps) => {
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);
  const columns = useMemo(
    () =>
      [
        {
          key: "userName",
          header: "User",
          render: (row: CouponUsageRow) => (
            <VStack align="start" spacing={0}>
              <Text fontWeight={700}>{row.userName}</Text>
              <Text fontSize="xs" color="#7D655B">
                {row.username} {row.email ? `| ${row.email}` : ""}
              </Text>
            </VStack>
          )
        },
        { key: "couponCode", header: "Coupon Code" },
        { key: "orderReference", header: "Order Ref" },
        { key: "benefitText", header: "Benefit" },
        {
          key: "usedAt",
          header: "Used At",
          render: (row: CouponUsageRow) => formatDateTime(row.usedAt)
        }
      ] as Array<{ key: string; header: string; render?: (row: CouponUsageRow) => ReactNode }>,
    []
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        size="6xl"
        isCentered
        scrollBehavior="inside"
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
      <ModalOverlay />
      <ModalContent borderRadius="16px">
        <ModalHeader>Coupon Usage Details</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4}>
              <Box p={3} borderRadius="12px" border="1px solid" borderColor="rgba(133, 78, 48, 0.22)" bg="white">
                <Text fontSize="sm" color="#7D655B">
                  Coupon Code
                </Text>
                <Text fontWeight={800}>{summary?.couponCode ?? "-"}</Text>
              </Box>
              <Box p={3} borderRadius="12px" border="1px solid" borderColor="rgba(133, 78, 48, 0.22)" bg="white">
                <Text fontSize="sm" color="#7D655B">
                  Total Usages
                </Text>
                <Text fontWeight={800}>{summary?.currentUsageCount ?? 0}</Text>
              </Box>
              <Box p={3} borderRadius="12px" border="1px solid" borderColor="rgba(133, 78, 48, 0.22)" bg="white">
                <Text fontSize="sm" color="#7D655B">
                  Remaining Uses
                </Text>
                <Text fontWeight={800}>
                  {summary?.remainingUses === null || summary?.remainingUses === undefined
                    ? "Unlimited"
                    : summary.remainingUses}
                </Text>
              </Box>
              <Box p={3} borderRadius="12px" border="1px solid" borderColor="rgba(133, 78, 48, 0.22)" bg="white">
                <Text fontSize="sm" color="#7D655B">
                  Usage Progress
                </Text>
                <Text fontWeight={800}>
                  {summary?.usagePercentage === null || summary?.usagePercentage === undefined
                    ? "Not capped"
                    : `${summary.usagePercentage}%`}
                </Text>
              </Box>
            </SimpleGrid>

            {loading ? (
              <Text color="#7D655B">Loading usage data...</Text>
            ) : (
              <DataTable
                columns={columns}
                rows={usages}
                emptyState={
                  <EmptyState
                    title="No usage records"
                    description="Coupon usage rows will appear here when customers start using it."
                  />
                }
              />
            )}

            <HStack justify="space-between">
              <Text color="#705B52" fontSize="sm">
                Showing {usages.length} of {total} records
              </Text>
              <HStack>
                <AppButton variant="outline" isDisabled={page <= 1} onClick={() => onPageChange(page - 1)}>
                  Previous
                </AppButton>
                <Text fontWeight={700}>
                  Page {page} of {totalPages}
                </Text>
                <AppButton
                  variant="outline"
                  isDisabled={page >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                >
                  Next
                </AppButton>
              </HStack>
            </HStack>
          </VStack>
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
