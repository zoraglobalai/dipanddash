import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  SimpleGrid,
  Text,
  Textarea,
  VStack,
  useToast
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cashAuditService } from "@/services/cash-audit.service";
import { CASH_AUDIT_DENOMINATIONS, type CashAuditExpectedBreakdown } from "@/types/pos";
import { extractApiErrorMessage } from "@/utils/api-error";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(value);

type CountsState = Record<string, string>;

const createInitialCounts = (): CountsState =>
  Object.fromEntries(CASH_AUDIT_DENOMINATIONS.map((denomination) => [String(denomination), ""]));

const getTodayDate = () => new Date().toISOString().slice(0, 10);

const toMoneyAmount = (value: string | number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Number(parsed.toFixed(2));
};

const toNonNegativeAmount = (value: string | number) => Math.max(0, toMoneyAmount(value));

export const StaffCashAuditPage = () => {
  const toast = useToast();

  const [counts, setCounts] = useState<CountsState>(createInitialCounts);
  const [auditDate, setAuditDate] = useState(getTodayDate());
  const [staffCashTakenAmount, setStaffCashTakenAmount] = useState("");
  const [note, setNote] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [lastAuditAt, setLastAuditAt] = useState<string | null>(null);
  const [expectedBreakdown, setExpectedBreakdown] = useState<CashAuditExpectedBreakdown | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingExpected, setLoadingExpected] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const response = await cashAuditService.getLastAuditInfo();
      setLastAuditAt(response.lastAuditAt);
    } catch (error) {
      toast({
        status: "error",
        title: "Unable to fetch last cash audit",
        description: extractApiErrorMessage(error, "Please try again.")
      });
    } finally {
      setLoadingStatus(false);
    }
  }, [toast]);

  const refreshExpectedBreakdown = useCallback(async () => {
    setLoadingExpected(true);
    try {
      const response = await cashAuditService.getExpectedBreakdown({ auditDate: auditDate || undefined });
      setExpectedBreakdown(response);
    } catch (error) {
      toast({
        status: "error",
        title: "Unable to fetch expected payment totals",
        description: extractApiErrorMessage(error, "Please try again.")
      });
    } finally {
      setLoadingExpected(false);
    }
  }, [auditDate, toast]);

  const totalCountedAmount = useMemo(() => {
    const total = CASH_AUDIT_DENOMINATIONS.reduce((sum, denomination) => {
      const count = Number(counts[String(denomination)] || 0);
      const safeCount = Number.isFinite(count) && count > 0 ? count : 0;
      return sum + safeCount * denomination;
    }, 0);
    return Number(total.toFixed(2));
  }, [counts]);

  const expectedCashAmount = toMoneyAmount(expectedBreakdown?.expectedCashAmount ?? 0);
  const expectedCardAmount = toMoneyAmount(expectedBreakdown?.expectedCardAmount ?? 0);
  const expectedUpiAmount = toMoneyAmount(expectedBreakdown?.expectedUpiAmount ?? 0);
  const expectedTotalAmount = toMoneyAmount(expectedCashAmount + expectedCardAmount + expectedUpiAmount);

  const enteredCashTakenAmount = toNonNegativeAmount(staffCashTakenAmount);
  const enteredCardSafeAmount = expectedCardAmount;
  const enteredUpiSafeAmount = expectedUpiAmount;
  const enteredCashAmount = toMoneyAmount(totalCountedAmount + enteredCashTakenAmount);
  const enteredTotalAmount = toMoneyAmount(enteredCashAmount + enteredCardSafeAmount + enteredUpiSafeAmount);
  const differenceCashAmount = toMoneyAmount(enteredCashAmount - expectedCashAmount);
  const differenceCardAmount = toMoneyAmount(enteredCardSafeAmount - expectedCardAmount);
  const differenceUpiAmount = toMoneyAmount(enteredUpiSafeAmount - expectedUpiAmount);
  const differenceTotalAmount = toMoneyAmount(enteredTotalAmount - expectedTotalAmount);
  const excessAmount = Math.max(differenceTotalAmount, 0);
  const hasDifference = differenceTotalAmount !== 0;
  const hasExcess = excessAmount > 0;

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    void refreshExpectedBreakdown();
  }, [refreshExpectedBreakdown]);

  const handleSubmit = async () => {
    if (!adminPassword.trim()) {
      toast({
        status: "warning",
        title: "Admin password is required"
      });
      return;
    }

    const rawStaffCashTaken = Number(staffCashTakenAmount);
    if (!Number.isFinite(rawStaffCashTaken) || rawStaffCashTaken < 0) {
      toast({
        status: "warning",
        title: "Cash taken cannot be negative"
      });
      return;
    }

    if (hasDifference && !note.trim()) {
      toast({
        status: "warning",
        title: hasExcess ? "Reason note is required for excess amount" : "Reason note is required for difference"
      });
      return;
    }

    setSubmitting(true);
    try {
      const normalizedCounts = Object.fromEntries(
        CASH_AUDIT_DENOMINATIONS.map((denomination) => {
          const raw = Number(counts[String(denomination)] || 0);
          const safe = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
          return [String(denomination), safe];
        })
      );

      const response = await cashAuditService.submitEntry({
        auditDate: auditDate || undefined,
        denominationCounts: normalizedCounts,
        staffCashTakenAmount: enteredCashTakenAmount,
        note: note.trim() || undefined,
        adminPassword: adminPassword.trim()
      });

      toast({
        status: "success",
        title: response.message
      });

      setAdminPassword("");
      setNote("");
      setCounts(createInitialCounts());
      setStaffCashTakenAmount("");
      await Promise.all([refreshStatus(), refreshExpectedBreakdown()]);
    } catch (error) {
      toast({
        status: "error",
        title: "Unable to submit cash audit",
        description: extractApiErrorMessage(error, "Please try again.")
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <VStack align="stretch" spacing={4}>
      <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
          <Box>
            <Text fontWeight={800}>Last Cash Audit</Text>
            <Text mt={1} color="#6D584E">
              {lastAuditAt
                ? new Date(lastAuditAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })
                : "No audit submitted yet."}
            </Text>
          </Box>
          <FormControl>
            <FormLabel fontWeight={700}>Audit Date</FormLabel>
            <Input type="date" value={auditDate} onChange={(event) => setAuditDate(event.target.value)} />
          </FormControl>
          <VStack align="stretch" justify="end">
            <Text opacity={0}>Actions</Text>
            <Button
              variant="outline"
              size="sm"
              isLoading={loadingStatus || loadingExpected}
              onClick={() => {
                void Promise.all([refreshStatus(), refreshExpectedBreakdown()]);
              }}
            >
              Refresh Status
            </Button>
          </VStack>
        </SimpleGrid>
      </Box>

      <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
        <Text fontWeight={900} mb={1}>
          Cash Audit Entry
        </Text>
        <Text color="#6D584E" fontSize="sm" mb={4}>
          Denominations are entered manually; card and UPI are auto-filled from system totals.
        </Text>

        <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3} mb={4}>
          <Box p={3} borderRadius="10px" border="1px solid rgba(132, 79, 52, 0.2)" bg="#FFF9EE">
            <Text fontSize="xs" color="#705B52" fontWeight={700}>
              Expected Cash
            </Text>
            <Text fontSize="lg" fontWeight={900} color="#2A1A14">
              {loadingExpected ? "..." : formatCurrency(expectedCashAmount)}
            </Text>
          </Box>
          <Box p={3} borderRadius="10px" border="1px solid rgba(132, 79, 52, 0.2)" bg="#FFF9EE">
            <Text fontSize="xs" color="#705B52" fontWeight={700}>
              Expected Card
            </Text>
            <Text fontSize="lg" fontWeight={900} color="#2A1A14">
              {loadingExpected ? "..." : formatCurrency(expectedCardAmount)}
            </Text>
          </Box>
          <Box p={3} borderRadius="10px" border="1px solid rgba(132, 79, 52, 0.2)" bg="#FFF9EE">
            <Text fontSize="xs" color="#705B52" fontWeight={700}>
              Expected UPI
            </Text>
            <Text fontSize="lg" fontWeight={900} color="#2A1A14">
              {loadingExpected ? "..." : formatCurrency(expectedUpiAmount)}
            </Text>
          </Box>
          <Box p={3} borderRadius="10px" border="1px solid rgba(132, 79, 52, 0.2)" bg="#FFF9EE">
            <Text fontSize="xs" color="#705B52" fontWeight={700}>
              Expected Total
            </Text>
            <Text fontSize="lg" fontWeight={900} color="#2A1A14">
              {loadingExpected ? "..." : formatCurrency(expectedTotalAmount)}
            </Text>
          </Box>
        </SimpleGrid>

        <SimpleGrid columns={{ base: 2, md: 3, xl: 5 }} spacing={3}>
          {CASH_AUDIT_DENOMINATIONS.map((denomination) => (
            <FormControl key={denomination}>
              <FormLabel fontSize="sm" fontWeight={700}>
                Rs.{denomination} count
              </FormLabel>
              <Input
                type="number"
                min={0}
                value={counts[String(denomination)] ?? ""}
                onChange={(event) =>
                  setCounts((previous) => ({
                    ...previous,
                    [String(denomination)]: event.target.value
                  }))
                }
              />
            </FormControl>
          ))}
        </SimpleGrid>

        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} mt={4}>
          <FormControl>
            <FormLabel fontWeight={700}>Staff Cash Taken</FormLabel>
            <Input
              type="number"
              min={0}
              value={staffCashTakenAmount}
              onChange={(event) => setStaffCashTakenAmount(event.target.value)}
            />
          </FormControl>
          <FormControl>
            <FormLabel fontWeight={700}>Entered Card Amount</FormLabel>
            <Input
              value={enteredCardSafeAmount > 0 ? String(enteredCardSafeAmount) : ""}
              isReadOnly
              placeholder="Auto-filled from system"
            />
          </FormControl>
          <FormControl>
            <FormLabel fontWeight={700}>Entered UPI Amount</FormLabel>
            <Input
              value={enteredUpiSafeAmount > 0 ? String(enteredUpiSafeAmount) : ""}
              isReadOnly
              placeholder="Auto-filled from system"
            />
          </FormControl>
          <FormControl>
            <FormLabel fontWeight={700}>Admin Password</FormLabel>
            <Input
              type="password"
              placeholder="Enter admin password for confirmation"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
            />
          </FormControl>
        </SimpleGrid>

        <FormControl mt={4}>
          <FormLabel fontWeight={700}>{hasDifference ? "Reason Note (Required)" : "Note (Optional)"}</FormLabel>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              hasExcess
                ? "Reason for excess amount (e.g., previous shift carry / extra collection)"
                : hasDifference
                  ? "Reason for difference"
                  : "Shift cash note"
            }
            rows={3}
          />
        </FormControl>

        <SimpleGrid mt={4} columns={{ base: 1, xl: 2 }} spacing={3}>
          <Box p={3} borderRadius="10px" border="1px solid rgba(132, 79, 52, 0.2)" bg="rgba(255, 249, 238, 0.75)">
            <Text color="#705B52" fontSize="sm" fontWeight={700}>
              Entered Amounts
            </Text>
            <Text mt={1} fontSize="lg" fontWeight={800} color="#2A1A14">
              Cash: {formatCurrency(enteredCashAmount)}
            </Text>
            <Text fontSize="lg" fontWeight={800} color="#2A1A14">
              Card: {formatCurrency(enteredCardSafeAmount)}
            </Text>
            <Text fontSize="lg" fontWeight={800} color="#2A1A14">
              UPI: {formatCurrency(enteredUpiSafeAmount)}
            </Text>
            <Text mt={2} fontSize="2xl" fontWeight={900} color="#2A1A14">
              Total: {formatCurrency(enteredTotalAmount)}
            </Text>
          </Box>
          <Box p={3} borderRadius="10px" border="1px solid rgba(132, 79, 52, 0.2)" bg="rgba(255, 249, 238, 0.75)">
            <Text color="#705B52" fontSize="sm" fontWeight={700}>
              Difference (Entered - Expected)
            </Text>
            <Text mt={1} fontSize="lg" fontWeight={800} color="#2A1A14">
              Cash: {formatCurrency(differenceCashAmount)}
            </Text>
            <Text fontSize="lg" fontWeight={800} color="#2A1A14">
              Card: {formatCurrency(differenceCardAmount)}
            </Text>
            <Text fontSize="lg" fontWeight={800} color="#2A1A14">
              UPI: {formatCurrency(differenceUpiAmount)}
            </Text>
            <Text mt={2} fontSize="2xl" fontWeight={900} color={differenceTotalAmount >= 0 ? "#177245" : "#A32626"}>
              Total: {formatCurrency(differenceTotalAmount)}
            </Text>
            {hasExcess ? (
              <Text mt={1} fontSize="sm" fontWeight={700} color="#177245">
                Excess Amount: {formatCurrency(excessAmount)}
              </Text>
            ) : null}
          </Box>
        </SimpleGrid>

        <Button
          mt={4}
          color="white"
          bgGradient="linear(95deg, #8E0909 0%, #BE3329 46%, #D3A23D 100%)"
          _hover={{ bgGradient: "linear(95deg, #7A0707 0%, #A12822 46%, #BA8A34 100%)" }}
          isLoading={submitting}
          onClick={() => void handleSubmit()}
        >
          Submit Cash Audit
        </Button>
      </Box>
    </VStack>
  );
};
