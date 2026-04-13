import { zodResolver } from "@hookform/resolvers/zod";
import { HStack, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { PageHeader } from "@/components/common/PageHeader";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppPasswordInput } from "@/components/ui/AppPasswordInput";
import { useAuth } from "@/context/AuthContext";
import { ProfileSummary } from "@/features/profile/components/ProfileSummary";
import { useAppToast } from "@/hooks/useAppToast";
import { authService } from "@/services/auth.service";
import { extractErrorMessage } from "@/utils/api-error";

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .regex(/^(?=.*[A-Za-z])(?=.*\d).+$/, "New password must contain letters and numbers"),
    confirmPassword: z.string().min(8, "Please confirm your new password")
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"]
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "New password and confirm password must match",
    path: ["confirmPassword"]
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

export const ProfilePage = () => {
  const { user } = useAuth();
  const toast = useAppToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: ""
    }
  });

  const submitPasswordChange = useCallback(
    async (values: PasswordFormValues) => {
      try {
        await authService.changePassword({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword
        });
        toast.success("Password updated successfully.");
        reset();
      } catch (error) {
        toast.error(extractErrorMessage(error, "Unable to change password right now."));
      }
    },
    [reset, toast]
  );

  if (!user) {
    return null;
  }

  return (
    <VStack spacing={6} align="stretch">
      <PageHeader title="Profile" subtitle="Account identity, role access and password settings." />

      <AppCard>
        <ProfileSummary user={user} />
      </AppCard>

      <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={6}>
        <AppCard title="Account Summary">
          <VStack align="stretch" spacing={3}>
            <HStack justify="space-between">
              <Text color="#725D53">Username</Text>
              <Text fontWeight={700} color="#281A15">
                @{user.username}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="#725D53">Email</Text>
              <Text fontWeight={700} color="#281A15">
                {user.email ?? "Not provided"}
              </Text>
            </HStack>
            <HStack justify="space-between">
              <Text color="#725D53">Role</Text>
              <Text fontWeight={700} textTransform="capitalize" color="#281A15">
                {user.role.replace("_", " ")}
              </Text>
            </HStack>
          </VStack>
        </AppCard>

        <AppCard
          title="Change Password"
          subtitle="Update your login password securely. This works for all admin accounts."
        >
          <VStack
            as="form"
            id="profile-password-form"
            align="stretch"
            spacing={4}
            onSubmit={handleSubmit(submitPasswordChange)}
          >
            <AppPasswordInput
              label="Current Password"
              placeholder="Enter current password"
              error={errors.currentPassword?.message}
              {...register("currentPassword")}
            />
            <AppPasswordInput
              label="New Password"
              placeholder="Enter new password"
              error={errors.newPassword?.message}
              {...register("newPassword")}
            />
            <AppPasswordInput
              label="Confirm New Password"
              placeholder="Re-enter new password"
              error={errors.confirmPassword?.message}
              {...register("confirmPassword")}
            />
            <HStack justify="end">
              <AppButton
                type="submit"
                isLoading={isSubmitting}
                loadingText="Updating..."
              >
                Update Password
              </AppButton>
            </HStack>
          </VStack>
        </AppCard>
      </SimpleGrid>
    </VStack>
  );
};
