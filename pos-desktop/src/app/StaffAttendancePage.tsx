import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Select,
  SimpleGrid,
  Text,
  VStack,
  useToast
} from "@chakra-ui/react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { useCallback, useEffect, useMemo, useState } from "react";

import { attendanceService } from "@/services/attendance.service";
import { usePos } from "@/app/PosContext";
import { usePosAuth } from "@/app/PosAuthContext";
import { PosDataTable, type PosTableColumn } from "@/components/common/PosDataTable";
import type { AttendanceRecord, AttendanceSummary } from "@/types/attendance";
import { extractApiErrorMessage } from "@/utils/api-error";

const defaultSummary: AttendanceSummary = {
  totalRecords: 0,
  presentStaff: 0,
  currentlyPunchedIn: 0,
  activeHours: 0,
  breakHours: 0,
  totalHours: 0
};

const getTodayString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatMinutesAsHours = (minutes: number) => `${(minutes / 60).toFixed(2)}h`;

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short"
});

export const StaffAttendancePage = () => {
  const toast = useToast();
  const { session } = usePosAuth();
  const { isPunchedIn, refreshShiftStatus } = usePos();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary>(defaultSummary);
  const [dateFilter, setDateFilter] = useState(getTodayString());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [username, setUsername] = useState(session?.username ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [isCacheData, setIsCacheData] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setUsername(session?.username ?? "");
  }, [session?.username]);

  const hasOpenSession = isPunchedIn === true;
  const isShiftStateKnown = typeof isPunchedIn === "boolean";

  const attendanceColumns = useMemo<PosTableColumn<AttendanceRecord>[]>(
    () => [
      {
        key: "punchInAt",
        header: "Punch In",
        render: (row) => dateTimeFormatter.format(new Date(row.punchInAt))
      },
      {
        key: "punchOutAt",
        header: "Punch Out",
        render: (row) => (row.punchOutAt ? dateTimeFormatter.format(new Date(row.punchOutAt)) : "Open Session")
      },
      {
        key: "activeMinutes",
        header: "Active",
        render: (row) => formatMinutesAsHours(row.activeMinutes)
      },
      {
        key: "breakMinutes",
        header: "Break",
        render: (row) => formatMinutesAsHours(row.breakMinutes)
      },
      {
        key: "totalMinutes",
        header: "Total",
        render: (row) => formatMinutesAsHours(row.totalMinutes)
      },
      {
        key: "status",
        header: "Status",
        render: (row) => (
          <Box
            px={3}
            py={1}
            borderRadius="full"
            display="inline-flex"
            bg={row.status === "punched_in" ? "green.100" : "orange.100"}
            color={row.status === "punched_in" ? "green.700" : "#8A5400"}
            fontWeight={700}
            fontSize="sm"
          >
            {row.status === "punched_in" ? "Punched In" : "Punched Out"}
          </Box>
        )
      }
    ],
    []
  );

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const response = await attendanceService.getMyRecords({
        date: dateFilter || undefined,
        page,
        limit
      });
      setRecords(response.data.records);
      setSummary(response.data.summary);
      setTotal(response.data.pagination.total);
      setTotalPages(response.data.pagination.totalPages);
      setIsCacheData(response.fromCache);
    } catch (error) {
      setIsCacheData(false);
      toast({
        status: "error",
        title: "Unable to load attendance",
        description: extractApiErrorMessage(error, "Please try again.")
      });
    } finally {
      setLoading(false);
    }
  }, [dateFilter, limit, page, toast]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    void refreshShiftStatus();
  }, [refreshShiftStatus]);

  useEffect(() => {
    setPage(1);
  }, [dateFilter, limit]);

  const submitPunch = async () => {
    if (!isShiftStateKnown) {
      toast({
        status: "warning",
        title: "Unable to verify shift state",
        description: "Refresh once and try again."
      });
      return;
    }

    if (!username.trim() || !password) {
      toast({
        status: "warning",
        title: "Enter username and password"
      });
      return;
    }

    setActionLoading(true);
    try {
      const response = hasOpenSession
        ? await attendanceService.punchOut({ username: username.trim(), password })
        : await attendanceService.punchIn({ username: username.trim(), password });

      toast({
        status: "success",
        title: response.message
      });
      setPassword("");
      await Promise.all([fetchRecords(), refreshShiftStatus()]);
    } catch (error) {
      toast({
        status: "error",
        title: "Attendance update failed",
        description: extractApiErrorMessage(error, "Please try again when online.")
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <VStack spacing={4} align="stretch">
      <SimpleGrid columns={{ base: 2, xl: 4 }} spacing={3}>
        <Box p={3} bg="white" borderRadius="12px" border="1px solid rgba(132, 79, 52, 0.2)">
          <Text color="#725D53" fontSize="sm" fontWeight={700}>
            Total Records
          </Text>
          <Text fontWeight={900} fontSize="2xl">
            {summary.totalRecords}
          </Text>
        </Box>
        <Box p={3} bg="white" borderRadius="12px" border="1px solid rgba(132, 79, 52, 0.2)">
          <Text color="#725D53" fontSize="sm" fontWeight={700}>
            Active Hours
          </Text>
          <Text fontWeight={900} fontSize="2xl">
            {summary.activeHours}h
          </Text>
        </Box>
        <Box p={3} bg="white" borderRadius="12px" border="1px solid rgba(132, 79, 52, 0.2)">
          <Text color="#725D53" fontSize="sm" fontWeight={700}>
            Break Hours
          </Text>
          <Text fontWeight={900} fontSize="2xl">
            {summary.breakHours}h
          </Text>
        </Box>
        <Box p={3} bg="white" borderRadius="12px" border="1px solid rgba(132, 79, 52, 0.2)">
          <Text color="#725D53" fontSize="sm" fontWeight={700}>
            Total Hours
          </Text>
          <Text fontWeight={900} fontSize="2xl">
            {summary.totalHours}h
          </Text>
        </Box>
      </SimpleGrid>

      <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
        <Text fontWeight={800} mb={3}>
          Punch In / Punch Out
        </Text>
        <SimpleGrid columns={{ base: 1, lg: 4 }} spacing={3}>
          <FormControl>
            <FormLabel fontWeight={700}>Username</FormLabel>
            <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username" />
          </FormControl>
          <FormControl>
            <FormLabel fontWeight={700}>Password</FormLabel>
            <InputGroup>
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                type={showPassword ? "text" : "password"}
              />
              <InputRightElement>
                <IconButton
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  variant="ghost"
                  size="sm"
                  icon={showPassword ? <FiEyeOff /> : <FiEye />}
                  onClick={() => setShowPassword((previous) => !previous)}
                />
              </InputRightElement>
            </InputGroup>
          </FormControl>
          <Box>
            <Text fontWeight={700} mb={2}>
              Shift State
            </Text>
            <Box
              px={3}
              py={1.5}
              borderRadius="full"
              display="inline-flex"
              bg={isShiftStateKnown ? (hasOpenSession ? "green.100" : "orange.100") : "gray.100"}
              color={isShiftStateKnown ? (hasOpenSession ? "green.700" : "#8A5400") : "gray.700"}
              fontWeight={700}
              fontSize="sm"
            >
              {isShiftStateKnown ? (hasOpenSession ? "Punched In" : "Punched Out") : "Checking"}
            </Box>
          </Box>
          <Box alignSelf="end">
            <Button
              w="full"
              color="white"
              bgGradient={
                hasOpenSession
                  ? "linear(95deg, #8E0909 0%, #BE3329 44%, #D3A23D 100%)"
                  : "linear(95deg, #136f39 0%, #1f9d58 48%, #6cbc4c 100%)"
              }
              _hover={{
                bgGradient: hasOpenSession
                  ? "linear(95deg, #7A0707 0%, #A12822 44%, #B98B34 100%)"
                  : "linear(95deg, #0f5d30 0%, #19844a 48%, #5cae42 100%)"
              }}
              isLoading={actionLoading}
              loadingText={hasOpenSession ? "Punching out..." : "Punching in..."}
              isDisabled={!isShiftStateKnown}
              onClick={() => void submitPunch()}
            >
              {hasOpenSession ? "Punch Out" : "Punch In"}
            </Button>
          </Box>
        </SimpleGrid>
      </Box>

      <Box p={4} bg="white" borderRadius="14px" border="1px solid rgba(132, 79, 52, 0.2)">
        <HStack justify="space-between" mb={4} flexWrap="wrap" gap={3}>
          <HStack spacing={3}>
            <FormControl w={{ base: "full", sm: "190px" }}>
              <FormLabel fontWeight={700}>Date</FormLabel>
              <Input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
            </FormControl>
            <FormControl w={{ base: "full", sm: "180px" }}>
              <FormLabel fontWeight={700}>Records per page</FormLabel>
              <Select
                value={String(limit)}
                onChange={(event) => {
                  setLimit(Number(event.target.value) || 5);
                }}
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="20">20</option>
              </Select>
            </FormControl>
          </HStack>
          <Button variant="outline" onClick={() => void fetchRecords()}>
            Refresh
          </Button>
        </HStack>

        {isCacheData ? (
          <Box
            mb={3}
            px={3}
            py={2}
            borderRadius="10px"
            bg="orange.50"
            border="1px solid"
            borderColor="orange.200"
          >
            <Text color="orange.700" fontWeight={600} fontSize="sm">
              Offline mode: showing last synced attendance records.
            </Text>
          </Box>
        ) : null}

        <PosDataTable
          rows={records}
          columns={attendanceColumns}
          getRowId={(row) => row.id}
          loading={loading}
          loadingMessage="Loading attendance records..."
          emptyMessage="No attendance records for the selected date."
          maxColumns={6}
        />

        <HStack justify="space-between" mt={4}>
          <Text color="#6D584E" fontSize="sm">
            Showing {records.length} of {total} records
          </Text>
          <HStack>
            <Button size="sm" variant="outline" isDisabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Previous
            </Button>
            <Text fontWeight={700}>
              Page {page} of {totalPages}
            </Text>
            <Button
              size="sm"
              variant="outline"
              isDisabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </Button>
          </HStack>
        </HStack>
      </Box>
    </VStack>
  );
};
