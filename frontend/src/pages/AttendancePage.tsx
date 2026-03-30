import {
  Box,
  FormControl,
  FormLabel,
  HStack,
  Select,
  SimpleGrid,
  Text,
  VStack
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { AppPasswordInput } from "@/components/ui/AppPasswordInput";
import { AppButton } from "@/components/ui/AppButton";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/common/EmptyState";
import { useAppToast } from "@/hooks/useAppToast";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAuth } from "@/context/AuthContext";
import { UserRole } from "@/types/role";
import { attendanceService } from "@/services/attendance.service";
import type { AttendanceRecord, AttendanceSummary } from "@/types/attendance";
import { extractErrorMessage } from "@/utils/api-error";

const getTodayString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const defaultSummary: AttendanceSummary = {
  totalRecords: 0,
  presentStaff: 0,
  currentlyPunchedIn: 0,
  activeHours: 0,
  breakHours: 0,
  totalHours: 0
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short"
});

const formatMinutesAsHours = (minutes: number) => `${(minutes / 60).toFixed(2)}h`;

export const AttendancePage = () => {
  const { user } = useAuth();
  const toast = useAppToast();

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummary>(defaultSummary);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [dateFilter, setDateFilter] = useState(getTodayString());
  const [nameFilterInput, setNameFilterInput] = useState("");
  const debouncedNameFilter = useDebouncedValue(nameFilterInput, 450);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [hasOpenSession, setHasOpenSession] = useState(false);

  const isAdmin = user?.role === UserRole.ADMIN;

  useEffect(() => {
    if (user?.username) {
      setUsername(user.username);
    }
  }, [user?.username]);

  const fetchPunchState = useCallback(async () => {
    if (isAdmin) {
      setHasOpenSession(false);
      return;
    }

    try {
      const response = await attendanceService.getMyRecords({
        page: 1,
        limit: 5
      });
      const openSession = response.data.records.some((record) => record.status === "punched_in");
      setHasOpenSession(openSession);
    } catch {
      setHasOpenSession(false);
    }
  }, [isAdmin]);

  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    try {
      const response = isAdmin
        ? await attendanceService.getAdminRecords({
            name: debouncedNameFilter || undefined,
            date: dateFilter || undefined,
            page,
            limit
          })
        : await attendanceService.getMyRecords({
            date: dateFilter || undefined,
            page,
            limit
          });

      setRecords(response.data.records);
      setSummary(response.data.summary);
      setTotal(response.data.pagination.total);
      setTotalPages(response.data.pagination.totalPages);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to fetch attendance records right now."));
    } finally {
      setLoading(false);
    }
  }, [dateFilter, debouncedNameFilter, isAdmin, limit, page, toast]);

  useEffect(() => {
    void fetchAttendance();
  }, [fetchAttendance]);

  useEffect(() => {
    if (!isAdmin) {
      void fetchPunchState();
    }
  }, [fetchPunchState, isAdmin]);

  useEffect(() => {
    setPage(1);
  }, [debouncedNameFilter, dateFilter]);

  const handlePunchAction = useCallback(async () => {
    if (!username || !password) {
      toast.warning("Enter your username and password to continue.");
      return;
    }

    setActionLoading(true);
    try {
      const response = hasOpenSession
        ? await attendanceService.punchOut({ username, password })
        : await attendanceService.punchIn({ username, password });

      toast.success(response.message);
      setPassword("");
      await Promise.all([fetchAttendance(), fetchPunchState()]);
    } catch (error) {
      toast.error(extractErrorMessage(error, "Unable to update attendance."));
    } finally {
      setActionLoading(false);
    }
  }, [fetchAttendance, fetchPunchState, hasOpenSession, password, toast, username]);

  const columns = useMemo(
    () =>
      [
        ...(isAdmin
          ? [
              {
                key: "employee",
                header: "Employee",
                render: (row: AttendanceRecord) => (
                  <VStack align="start" spacing={0}>
                    <Text fontWeight={700}>{row.fullName}</Text>
                    <Text fontSize="sm" color="#6F5A50">
                      @{row.username} | {row.role.replace("_", " ")}
                    </Text>
                  </VStack>
                )
              }
            ]
          : []),
        {
          key: "punchInAt",
          header: "Punch In",
          render: (row: AttendanceRecord) => <Text>{dateTimeFormatter.format(new Date(row.punchInAt))}</Text>
        },
        {
          key: "punchOutAt",
          header: "Punch Out",
          render: (row: AttendanceRecord) => (
            <Text>{row.punchOutAt ? dateTimeFormatter.format(new Date(row.punchOutAt)) : "Open Session"}</Text>
          )
        },
        {
          key: "activeMinutes",
          header: "Active Hours",
          render: (row: AttendanceRecord) => <Text>{formatMinutesAsHours(row.activeMinutes)}</Text>
        },
        {
          key: "breakMinutes",
          header: "Break Hours",
          render: (row: AttendanceRecord) => <Text>{formatMinutesAsHours(row.breakMinutes)}</Text>
        },
        {
          key: "totalMinutes",
          header: "Total Hours",
          render: (row: AttendanceRecord) => <Text>{formatMinutesAsHours(row.totalMinutes)}</Text>
        },
        {
          key: "status",
          header: "Status",
          render: (row: AttendanceRecord) => (
            <Box
              px={3}
              py={1}
              borderRadius="full"
              fontSize="xs"
              fontWeight={700}
              bg={row.status === "punched_in" ? "green.100" : "orange.100"}
              color={row.status === "punched_in" ? "green.700" : "#8A5400"}
              w="fit-content"
            >
              {row.status === "punched_in" ? "Punched In" : "Punched Out"}
            </Box>
          )
        }
      ] as Array<{
        key: string;
        header: string;
        render: (row: AttendanceRecord) => ReactNode;
      }>,
    [isAdmin]
  );

  if (!user) {
    return null;
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title={isAdmin ? "Attendance Control Center" : "Attendance"}
        subtitle={
          isAdmin
            ? undefined
            : "Punch in/out for your shift and view your day-wise attendance summary."
        }
      />

      <SimpleGrid columns={{ base: 1, md: isAdmin ? 5 : 3 }} spacing={4}>
        <AppCard>
          <Text fontSize="sm" color="#725D53" fontWeight={700}>
            Total Records
          </Text>
          <Text mt={2} fontWeight={800} fontSize="2xl">
            {summary.totalRecords}
          </Text>
        </AppCard>
        <AppCard>
          <Text fontSize="sm" color="#725D53" fontWeight={700}>
            Active Hours
          </Text>
          <Text mt={2} fontWeight={800} fontSize="2xl">
            {summary.activeHours}h
          </Text>
        </AppCard>
        <AppCard>
          <Text fontSize="sm" color="#725D53" fontWeight={700}>
            Break Hours
          </Text>
          <Text mt={2} fontWeight={800} fontSize="2xl">
            {summary.breakHours}h
          </Text>
        </AppCard>
        <AppCard>
          <Text fontSize="sm" color="#725D53" fontWeight={700}>
            Total Hours
          </Text>
          <Text mt={2} fontWeight={800} fontSize="2xl">
            {summary.totalHours}h
          </Text>
        </AppCard>
        {isAdmin ? (
          <AppCard>
            <Text fontSize="sm" color="#725D53" fontWeight={700}>
              Staff Present
            </Text>
            <Text mt={2} fontWeight={800} fontSize="2xl">
              {summary.presentStaff}
            </Text>
            <Text fontSize="sm" color="#725D53">
              Live punched in: {summary.currentlyPunchedIn}
            </Text>
          </AppCard>
        ) : null}
      </SimpleGrid>

      {!isAdmin ? (
        <AppCard title="Punch In / Punch Out" subtitle="Use your own username and password to confirm attendance actions.">
          <SimpleGrid columns={{ base: 1, md: 3, xl: 4 }} spacing={4}>
            <AppInput
              label="Username"
              value={username}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setUsername(event.currentTarget.value)}
              placeholder="Enter username"
            />
            <AppPasswordInput
              label="Password"
              value={password}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setPassword(event.currentTarget.value)}
              placeholder="Enter password"
            />
            <Box>
              <Text fontWeight={700} mb={2}>
                Current Shift State
              </Text>
              <Box
                px={3}
                py={1}
                borderRadius="full"
                fontSize="xs"
                fontWeight={700}
                bg={hasOpenSession ? "green.100" : "orange.100"}
                color={hasOpenSession ? "green.700" : "#8A5400"}
                w="fit-content"
              >
                {hasOpenSession ? "Punched In" : "Punched Out"}
              </Box>
            </Box>
            <Box alignSelf="end">
              <AppButton
                w="full"
                bgGradient={
                  hasOpenSession
                    ? "linear(92deg, accentRed.700 0%, accentRed.500 44%, brand.500 100%)"
                    : "linear(92deg, #136f39 0%, #1f9d58 52%, #6cbc4c 100%)"
                }
                color="white"
                isLoading={actionLoading}
                loadingText={hasOpenSession ? "Punching out..." : "Punching in..."}
                onClick={() => void handlePunchAction()}
              >
                {hasOpenSession ? "Punch Out" : "Punch In"}
              </AppButton>
            </Box>
          </SimpleGrid>
        </AppCard>
      ) : null}

      <AppCard title={isAdmin ? "Attendance Records" : "My Records"}>
        <SimpleGrid columns={{ base: 1, md: isAdmin ? 3 : 2, xl: isAdmin ? 4 : 3 }} spacing={4} mb={4}>
          {isAdmin ? (
            <AppInput
              label="Search Employee"
              placeholder="Name or username"
              value={nameFilterInput}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setNameFilterInput(event.currentTarget.value)
              }
            />
          ) : null}
          <AppInput
            label="Date"
            type="date"
            value={dateFilter}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setDateFilter(event.currentTarget.value)}
          />
          <FormControl>
            <FormLabel fontWeight={600}>Records per page</FormLabel>
            <Select
              value={String(limit)}
              onChange={(event) => {
                const nextLimit = Number(event.target.value) || 5;
                setLimit(nextLimit);
                setPage(1);
              }}
            >
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
            </Select>
          </FormControl>
          <Box alignSelf="end">
            <AppButton variant="outline" onClick={() => void fetchAttendance()}>
              Refresh
            </AppButton>
          </Box>
        </SimpleGrid>

        {loading ? (
          <Text color="#725D53">Loading attendance records...</Text>
        ) : (
          <DataTable
            columns={columns}
            rows={records}
            emptyState={
              <EmptyState
                title="No attendance records"
                description={
                  dateFilter
                    ? "No records found for the selected date. Try another date or punch in first."
                    : "No records found yet. Punch in to create your first attendance entry."
                }
              />
            }
          />
        )}

        <HStack justify="space-between" mt={4} flexWrap="wrap" gap={3}>
          <Text color="#705B52" fontSize="sm">
            Showing {records.length} of {total} records
          </Text>
          <HStack>
            <AppButton variant="outline" isDisabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Previous
            </AppButton>
            <Text fontWeight={700}>
              Page {page} of {totalPages}
            </Text>
            <AppButton
              variant="outline"
              isDisabled={page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </AppButton>
          </HStack>
        </HStack>
      </AppCard>
    </VStack>
  );
};
