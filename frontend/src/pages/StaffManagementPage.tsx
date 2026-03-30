import {
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Switch,
  Text,
  useDisclosure,
  VStack,
  useBoolean
} from "@chakra-ui/react";
import { Edit2, KeyRound, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PageHeader } from "@/components/common/PageHeader";
import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppPasswordInput } from "@/components/ui/AppPasswordInput";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SearchInput } from "@/components/common/SearchInput";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorFallback } from "@/components/feedback/ErrorFallback";
import { SkeletonTable } from "@/components/feedback/SkeletonTable";
import { StaffFormModal } from "@/features/staff/components/StaffFormModal";
import { useStaffManagement } from "@/features/staff/hooks/useStaffManagement";
import { reportsService } from "@/services/reports.service";
import type { Staff } from "@/types/staff";
import type { UserRole } from "@/types/role";
import { STAFF_ASSIGNABLE_MODULE_OPTIONS } from "@/constants/modules";
import { useAppToast } from "@/hooks/useAppToast";
import { extractErrorMessage } from "@/utils/api-error";
import type { AppSelectOption } from "@/components/ui/select";

export const StaffManagementPage = () => {
  const toast = useAppToast();
  const {
    staff,
    loading,
    mutationLoading,
    error,
    fetchStaff,
    createStaff,
    updateStaff,
    updateStatus,
    resetPassword
  } = useStaffManagement();

  const [activeSearch, setActiveSearch] = useState("");
  const activeSearchRef = useRef("");
  const [selected, setSelected] = useState<Staff | null>(null);
  const [reportOptions, setReportOptions] = useState<AppSelectOption[]>([]);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [isStatusChanging, setIsStatusChanging] = useBoolean(false);
  const [isResettingPassword, setIsResettingPassword] = useBoolean(false);
  const [pendingStatus, setPendingStatus] = useState<boolean>(false);

  const modalState = useDisclosure();
  const confirmState = useDisclosure();
  const resetPasswordModal = useDisclosure();

  const refreshData = useCallback(
    async (search?: string) => {
      try {
        await fetchStaff(search);
      } catch (err) {
        toast.error(extractErrorMessage(err, "Unable to fetch staff data right now"));
      }
    },
    [fetchStaff, toast.error]
  );

  const refreshReportCatalog = useCallback(async () => {
    try {
      const response = await reportsService.getCatalog();
      const options = response.data.reports.map((report) => ({
        label: report.title,
        value: report.key,
        description: report.description,
        searchText: `${report.title} ${report.key} ${report.category}`
      }));
      setReportOptions(options);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Unable to fetch reports catalog"));
    }
  }, [toast]);

  useEffect(() => {
    void refreshData();
    void refreshReportCatalog();
  }, [refreshData, refreshReportCatalog]);

  const openCreate = useCallback(() => {
    setSelected(null);
    modalState.onOpen();
  }, [modalState, setSelected]);

  const handleSearch = useCallback(
    (value: string) => {
      const normalizedValue = value.trim();
      if (activeSearchRef.current === normalizedValue) {
        return;
      }

      activeSearchRef.current = normalizedValue;
      setActiveSearch(normalizedValue);
      void refreshData(normalizedValue);
    },
    [refreshData]
  );

  const openEdit = useCallback(
    (staffMember: Staff) => {
      setSelected(staffMember);
      modalState.onOpen();
    },
    [modalState]
  );

  const submitStaff = useCallback(
    async (values: {
      username?: string;
      fullName: string;
      email?: string;
      role: UserRole;
      password?: string;
      assignedReports?: string[];
      assignedModules?: string[];
    }) => {
      try {
        if (selected) {
          const message = await updateStaff(selected.id, {
            fullName: values.fullName,
            email: values.email,
            role: values.role,
            assignedReports: values.assignedReports,
            assignedModules: values.assignedModules
          });
          toast.success(message ?? "Staff member updated successfully");
        } else {
          const message = await createStaff({
            username: values.username ?? "",
            fullName: values.fullName,
            email: values.email,
            password: values.password ?? "",
            role: values.role,
            assignedReports: values.assignedReports,
            assignedModules: values.assignedModules
          });
          toast.success(message ?? "Staff member created successfully");
        }
        modalState.onClose();
      } catch (err) {
        toast.error(extractErrorMessage(err, "Unable to save staff member"));
      }
    },
    [createStaff, modalState, selected, toast, updateStaff]
  );

  const triggerStatusChange = useCallback((staffMember: Staff, isActive: boolean) => {
    setSelected(staffMember);
    setPendingStatus(isActive);
    confirmState.onOpen();
  }, [confirmState]);

  const confirmStatusChange = useCallback(async () => {
    if (!selected) {
      return;
    }
    setIsStatusChanging.on();
    try {
      const message = await updateStatus(selected.id, pendingStatus);
      toast.success(message ?? "Staff status updated successfully");
      confirmState.onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Unable to update staff status"));
    } finally {
      setIsStatusChanging.off();
    }
  }, [confirmState, pendingStatus, selected, setIsStatusChanging, toast, updateStatus]);

  const openResetPassword = useCallback((staffMember: Staff) => {
    setSelected(staffMember);
    setResetPasswordValue("");
    resetPasswordModal.onOpen();
  }, [resetPasswordModal]);

  const submitResetPassword = useCallback(async () => {
    if (!selected) {
      return;
    }

    const nextPassword = resetPasswordValue.trim();
    if (nextPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (!/[A-Za-z]/.test(nextPassword) || !/\d/.test(nextPassword)) {
      toast.error("Password must contain letters and numbers.");
      return;
    }

    setIsResettingPassword.on();
    try {
      const message = await resetPassword(selected.id, nextPassword);
      toast.success(message ?? "Staff password reset successfully");
      resetPasswordModal.onClose();
      setResetPasswordValue("");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Unable to reset password"));
    } finally {
      setIsResettingPassword.off();
    }
  }, [
    resetPassword,
    resetPasswordModal,
    resetPasswordValue,
    selected,
    setIsResettingPassword,
    toast
  ]);

  const columns = useMemo(
    () => [
      {
        key: "fullName",
        header: "Name",
        render: (row: Staff) => (
          <VStack align="start" spacing={0}>
            <Text fontWeight={700}>{row.fullName}</Text>
            <Text fontSize="sm" color="gray.500">
              @{row.username}
            </Text>
          </VStack>
        )
      },
      { key: "email", header: "Email" },
      {
        key: "role",
        header: "Role",
        render: (row: Staff) => (
          <Text textTransform="capitalize" fontWeight={600}>
            {row.role.replace("_", " ")}
          </Text>
        )
      },
      {
        key: "reports",
        header: "Reports Access",
        render: (row: Staff) => (
          <Text fontWeight={600} color={row.assignedReports.length ? "#2D1D17" : "#705B52"}>
            {row.assignedReports.length ? `${row.assignedReports.length} assigned` : "No report access"}
          </Text>
        )
      },
      {
        key: "modules",
        header: "Modules Access",
        render: (row: Staff) => (
          <Text fontWeight={600} color={row.assignedModules.length ? "#2D1D17" : "#705B52"}>
            {row.assignedModules.length ? `${row.assignedModules.length} assigned` : "No module access"}
          </Text>
        )
      },
      {
        key: "status",
        header: "Status",
        render: (row: Staff) => <StatusBadge active={row.isActive} />
      },
      {
        key: "toggle",
        header: "Active Toggle",
        render: (row: Staff) => (
          <Switch
            colorScheme="brand"
            isChecked={row.isActive}
            onChange={(event) => triggerStatusChange(row, event.target.checked)}
          />
        )
      },
      {
        key: "actions",
        header: "Actions",
        render: (row: Staff) => (
          <HStack>
            <ActionIconButton
              aria-label={`Edit ${row.fullName}`}
              tooltip="Edit staff"
              icon={<Edit2 size={16} />}
              size="sm"
              variant="outline"
              onClick={() => openEdit(row)}
            />
            <ActionIconButton
              aria-label={`Reset password for ${row.fullName}`}
              tooltip="Change password"
              icon={<KeyRound size={16} />}
              size="sm"
              variant="outline"
              onClick={() => openResetPassword(row)}
            />
          </HStack>
        )
      }
    ],
    [openEdit, openResetPassword, triggerStatusChange]
  );

  if (error && !staff.length && !loading) {
    return <ErrorFallback title="Unable to Load Staff Data" message={error} onRetry={() => void refreshData()} />;
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader
        title="Staff Management"
        subtitle="Create, edit and manage staff access with role-based control."
        action={
          <AppButton leftIcon={<UserPlus size={16} />} onClick={openCreate}>
            Add Staff
          </AppButton>
        }
      />

      <AppCard>
        <VStack spacing={4} align="stretch">
          <SearchInput
            placeholder="Search by name or username..."
            onDebouncedChange={handleSearch}
          />
          {loading ? (
            <SkeletonTable />
          ) : (
            <DataTable
              columns={columns}
              rows={staff}
              emptyState={
                <EmptyState
                  title="No staff members found"
                  description={
                    activeSearch
                      ? "Try adjusting your search to find staff results."
                      : "Create your first staff member to begin role-based operations."
                  }
                />
              }
            />
          )}
        </VStack>
      </AppCard>

      <StaffFormModal
        isOpen={modalState.isOpen}
        onClose={() => {
          modalState.onClose();
          setSelected(null);
        }}
        mode={selected ? "edit" : "create"}
        initialData={selected}
        onSubmit={submitStaff}
        loading={mutationLoading}
        reportOptions={reportOptions}
        moduleOptions={STAFF_ASSIGNABLE_MODULE_OPTIONS}
      />

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={confirmState.onClose}
        title="Confirm Status Change"
        description={`Are you sure you want to ${pendingStatus ? "activate" : "deactivate"} ${
          selected?.fullName ?? "this staff member"
        }?`}
        onConfirm={() => void confirmStatusChange()}
        isLoading={isStatusChanging}
      />

      <Modal
        isOpen={resetPasswordModal.isOpen}
        onClose={resetPasswordModal.onClose}
        isCentered
        size="md"
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
        <ModalOverlay />
        <ModalContent borderRadius="16px">
          <ModalHeader>Reset Staff Password</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={4}>
              <Text color="#705B52" fontSize="sm">
                Set a new password for{" "}
                <Text as="span" fontWeight={700} color="#2A1A14">
                  {selected?.fullName ?? "staff"}
                </Text>
                .
              </Text>
              <AppPasswordInput
                label="New Password"
                placeholder="Enter new password"
                value={resetPasswordValue}
                onChange={(event) => setResetPasswordValue(event.target.value)}
              />
            </VStack>
          </ModalBody>
          <ModalFooter gap={3}>
            <AppButton variant="outline" onClick={resetPasswordModal.onClose}>
              Cancel
            </AppButton>
            <AppButton isLoading={isResettingPassword} onClick={() => void submitResetPassword()}>
              Reset Password
            </AppButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
};
