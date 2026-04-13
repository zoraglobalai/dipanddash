import {
  Box,
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
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
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { AppPasswordInput } from "@/components/ui/AppPasswordInput";
import { AppSelect } from "@/components/ui/AppSelect";
import type { AppSelectOption } from "@/components/ui/select";
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import { UserRole } from "@/types/role";
import type { Staff } from "@/types/staff";

const createSchema = z.object({
  accountType: z.enum(["pos_desktop", "admin_frontend"]),
  username: z.string().min(3, "Username must be at least 3 characters"),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  role: z.nativeEnum(UserRole),
  password: z.string().min(8, "Password must be at least 8 characters"),
  assignedReports: z.array(z.string()).default([]),
  assignedModules: z.array(z.string()).default([])
});

const updateSchema = z.object({
  accountType: z.enum(["pos_desktop", "admin_frontend"]),
  fullName: z.string().min(2, "Full name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email").optional().or(z.literal("")),
  role: z.nativeEnum(UserRole),
  assignedReports: z.array(z.string()).default([]),
  assignedModules: z.array(z.string()).default([])
});

type StaffFormValues = {
  accountType: "pos_desktop" | "admin_frontend";
  username: string;
  fullName: string;
  email: string;
  role: UserRole;
  password: string;
  assignedReports: string[];
  assignedModules: string[];
};

type StaffFormModalProps = {
  isOpen: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  initialData?: Staff | null;
  onSubmit: (values: {
    username?: string;
    fullName: string;
    email?: string;
    role: UserRole;
    password?: string;
    assignedReports?: string[];
    assignedModules?: string[];
  }) => Promise<void>;
  loading?: boolean;
  reportOptions: AppSelectOption[];
  moduleOptions: AppSelectOption[];
};

const accountTypeOptions = [
  { label: "POS Desktop", value: "pos_desktop" },
  { label: "Admin Frontend", value: "admin_frontend" }
];

const posRoleOptions = [
  { label: "Staff", value: UserRole.STAFF },
  { label: "Snooker Staff", value: UserRole.SNOOKER_STAFF }
];

const AccessChecklist = ({
  label,
  helperText,
  values,
  options,
  onChange,
  emptyText,
  disabled
}: {
  label: string;
  helperText: string;
  values: string[];
  options: AppSelectOption[];
  onChange: (next: string[]) => void;
  emptyText: string;
  disabled?: boolean;
}) => (
  <FormControl>
    <FormLabel fontWeight={600}>{label}</FormLabel>
    <Box
      border="1px solid"
      borderColor="rgba(193, 14, 14, 0.18)"
      borderRadius="12px"
      bg="white"
      p={3}
      maxH="180px"
      overflowY="auto"
      opacity={disabled ? 0.72 : 1}
    >
      {options.length ? (
        <VStack align="stretch" spacing={2}>
          {options.map((option) => {
            const checked = values.includes(option.value);
            return (
              <Checkbox
                key={option.value}
                isChecked={checked}
                isDisabled={disabled}
                onChange={(event) => {
                  const current = new Set(values);
                  if (event.target.checked) {
                    current.add(option.value);
                  } else {
                    current.delete(option.value);
                  }
                  onChange(Array.from(current));
                }}
                colorScheme="brand"
              >
                <Text fontWeight={600} color="#2D1D17">
                  {option.label}
                </Text>
                {option.description ? (
                  <Text fontSize="xs" color="#705B52">
                    {option.description}
                  </Text>
                ) : null}
              </Checkbox>
            );
          })}
        </VStack>
      ) : (
        <Text fontSize="sm" color="#705B52">
          {emptyText}
        </Text>
      )}
    </Box>
    <FormHelperText>{helperText}</FormHelperText>
  </FormControl>
);

export const StaffFormModal = ({
  isOpen,
  onClose,
  mode,
  initialData,
  onSubmit,
  loading,
  reportOptions,
  moduleOptions
}: StaffFormModalProps) => {
  const isCreate = mode === "create";
  const schema = isCreate ? createSchema : updateSchema;
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);

  const {
    register,
    reset,
    setValue,
    watch,
    handleSubmit,
    control,
    formState: { errors }
  } = useForm<StaffFormValues>({
    resolver: zodResolver(schema as z.ZodTypeAny),
    defaultValues: {
      accountType: "pos_desktop",
      username: "",
      fullName: "",
      email: "",
      role: UserRole.STAFF,
      password: "",
      assignedReports: [],
      assignedModules: []
    }
  });

  const accountType = watch("accountType");
  const selectedRole = watch("role");
  const selectedModules = watch("assignedModules") ?? [];
  const selectedReports = watch("assignedReports") ?? [];
  const isAdminFrontendAccount = accountType === "admin_frontend";
  const hasReportsModule = selectedModules.includes("reports");

  const allModuleValues = useMemo(() => moduleOptions.map((option) => option.value), [moduleOptions]);
  const allReportValues = useMemo(() => reportOptions.map((option) => option.value), [reportOptions]);
  const hasFullModuleAccess =
    allModuleValues.length > 0 && allModuleValues.every((moduleKey) => selectedModules.includes(moduleKey));
  const hasFullReportAccess =
    allReportValues.length > 0 && allReportValues.every((reportKey) => selectedReports.includes(reportKey));

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (initialData) {
      const isAdminFrontend =
        initialData.role === UserRole.ADMIN ||
        initialData.role === UserRole.MANAGER ||
        initialData.role === UserRole.ACCOUNTANT;
      reset({
        accountType: isAdminFrontend ? "admin_frontend" : "pos_desktop",
        username: initialData.username,
        fullName: initialData.fullName,
        email: initialData.email ?? "",
        role: initialData.role,
        password: "",
        assignedReports: (initialData.assignedReports ?? []).filter((reportKey) =>
          allReportValues.includes(reportKey)
        ),
        assignedModules: (initialData.assignedModules ?? []).filter((moduleKey) =>
          allModuleValues.includes(moduleKey)
        )
      });
      return;
    }

    reset({
      accountType: "pos_desktop",
      username: "",
      fullName: "",
      email: "",
      role: UserRole.STAFF,
      password: "",
      assignedReports: [],
      assignedModules: []
    });
  }, [allModuleValues, allReportValues, initialData, isOpen, reset]);

  useEffect(() => {
    if (accountType === "admin_frontend") {
      if (selectedRole !== UserRole.ADMIN) {
        setValue("role", UserRole.ADMIN, { shouldValidate: true, shouldDirty: true });
      }
      return;
    }

    if (selectedRole === UserRole.ADMIN) {
      setValue("role", UserRole.STAFF, { shouldValidate: true, shouldDirty: true });
    }
    if (selectedModules.length) {
      setValue("assignedModules", [], { shouldValidate: true, shouldDirty: true });
    }
    if (selectedReports.length) {
      setValue("assignedReports", [], { shouldValidate: true, shouldDirty: true });
    }
  }, [accountType, selectedModules.length, selectedReports.length, selectedRole, setValue]);

  const submitForm = handleSubmit(async (values) => {
    const isAdminFrontend = values.accountType === "admin_frontend";
    const allowedModuleValues = new Set(allModuleValues);
    const allowedReportValues = new Set(allReportValues);
    const assignedModules = isAdminFrontend
      ? (values.assignedModules ?? []).filter((moduleKey) => allowedModuleValues.has(moduleKey))
      : [];
    const assignedReports =
      isAdminFrontend && assignedModules.includes("reports")
        ? (values.assignedReports ?? []).filter((reportKey) => allowedReportValues.has(reportKey))
        : [];

    await onSubmit({
      username: values.username,
      fullName: values.fullName,
      email: values.email,
      role: isAdminFrontend ? UserRole.ADMIN : values.role,
      password: values.password,
      assignedReports,
      assignedModules
    });
  });

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        isCentered
        size="4xl"
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
        <ModalOverlay />
        <ModalContent borderRadius="16px" maxH="calc(100vh - 64px)" my={8}>
          <ModalHeader pb={3}>{isCreate ? "Create Staff Member" : "Update Staff Member"}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pt={2} pb={2} overflowY="auto">
            <VStack as="form" id="staff-form" spacing={3} align="stretch" onSubmit={submitForm}>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <AppSelect
                  label="Access Platform"
                  options={accountTypeOptions}
                  error={errors.accountType?.message as string | undefined}
                  {...register("accountType")}
                />
              </SimpleGrid>

              {isCreate ? (
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <AppInput
                    label="Username"
                    placeholder="e.g. counter_01"
                    error={errors.username?.message as string | undefined}
                    {...register("username")}
                  />
                  <AppPasswordInput
                    label="Password"
                    placeholder="Create password"
                    error={errors.password?.message as string | undefined}
                    {...register("password")}
                  />
                </SimpleGrid>
              ) : null}

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <AppInput
                  label="Full Name"
                  placeholder="e.g. John Doe"
                  error={errors.fullName?.message as string | undefined}
                  {...register("fullName")}
                />
                <AppInput
                  label="Email (Optional)"
                  placeholder="name@dipanddash.com"
                  error={errors.email?.message as string | undefined}
                  {...register("email")}
                />
                {isAdminFrontendAccount ? (
                  <FormControl>
                    <FormLabel fontWeight={600}>Role</FormLabel>
                    <Box border="1px solid rgba(132, 79, 52, 0.2)" borderRadius="12px" px={3} py={3} bg="#FFF9EE">
                      <Text fontWeight={700} color="#2D1D17">
                        Admin (Auto-assigned)
                      </Text>
                    </Box>
                  </FormControl>
                ) : (
                  <AppSelect
                    label="Role"
                    options={posRoleOptions}
                    error={errors.role?.message as string | undefined}
                    {...register("role")}
                  />
                )}
              </SimpleGrid>

              {isAdminFrontendAccount ? (
                <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={3}>
                  <Controller
                    control={control}
                    name="assignedReports"
                    render={({ field }) => (
                      <VStack align="stretch" spacing={2}>
                        <HStack justify="space-between">
                          <Text fontWeight={600}>Reports Access Mode</Text>
                          <Checkbox
                            isChecked={hasFullReportAccess}
                            isDisabled={!hasReportsModule || allReportValues.length === 0}
                            onChange={(event) => {
                              field.onChange(event.target.checked ? allReportValues : []);
                            }}
                            colorScheme="brand"
                          >
                            Full Report Access
                          </Checkbox>
                        </HStack>
                        <AccessChecklist
                          label="Reports Access"
                          values={field.value ?? []}
                          options={hasReportsModule ? reportOptions : []}
                          onChange={field.onChange}
                          disabled={!hasReportsModule || hasFullReportAccess}
                          emptyText={
                            hasReportsModule
                              ? "No reports available to assign."
                              : "Enable Reports module in Modules Access to assign reports."
                          }
                          helperText="Choose full access or selected reports for admin frontend user."
                        />
                      </VStack>
                    )}
                  />
                  <Controller
                    control={control}
                    name="assignedModules"
                    render={({ field }) => (
                      <VStack align="stretch" spacing={2}>
                        <HStack justify="space-between">
                          <Text fontWeight={600}>Modules Access Mode</Text>
                          <Checkbox
                            isChecked={hasFullModuleAccess}
                            isDisabled={allModuleValues.length === 0}
                            onChange={(event) => {
                              const nextModules = event.target.checked ? allModuleValues : [];
                              field.onChange(nextModules);
                              if (!nextModules.includes("reports")) {
                                setValue("assignedReports", [], { shouldValidate: true, shouldDirty: true });
                              }
                            }}
                            colorScheme="brand"
                          >
                            Full Module Access
                          </Checkbox>
                        </HStack>
                        <AccessChecklist
                          label="Modules Access"
                          values={field.value ?? []}
                          options={moduleOptions}
                          onChange={(nextModules) => {
                            field.onChange(nextModules);
                            if (!nextModules.includes("reports")) {
                              setValue("assignedReports", [], { shouldValidate: true, shouldDirty: true });
                            }
                          }}
                          disabled={hasFullModuleAccess}
                          emptyText="No modules available to assign."
                          helperText="Only selected modules will be visible in admin frontend sidebar."
                        />
                      </VStack>
                    )}
                  />
                </SimpleGrid>
              ) : null}
            </VStack>
          </ModalBody>
          <ModalFooter gap={3} pt={3} pb={4}>
            <AppButton variant="outline" onClick={requestClose}>
              Cancel
            </AppButton>
            <AppButton type="submit" form="staff-form" isLoading={loading}>
              {isCreate ? "Create Staff" : "Save Changes"}
            </AppButton>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <ConfirmDialog
        isOpen={isCloseConfirmOpen}
        title="Close this popup?"
        description="Are you sure you want to close? Unsaved changes will be lost."
        onClose={cancelCloseRequest}
        onConfirm={confirmClose}
      />
    </>
  );
};
