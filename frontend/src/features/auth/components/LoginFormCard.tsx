import { Box, HStack, Image, Text, VStack } from "@chakra-ui/react";
import { useCallback } from "react";

import logo from "@/assets/logo.png";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { AppPasswordInput } from "@/components/ui/AppPasswordInput";
import { useAuth } from "@/context/AuthContext";
import { useLoginForm } from "../hooks/useLoginForm";
import { extractErrorMessage } from "@/utils/api-error";
import { useAppToast } from "@/hooks/useAppToast";

export const LoginFormCard = () => {
  const { login } = useAuth();
  const toast = useAppToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useLoginForm();

  const onSubmit = useCallback(
    async (values: { username: string; password: string }) => {
      try {
        await login(values);
      } catch (error) {
        toast.error(extractErrorMessage(error, "Invalid credentials or this account is desktop-only."));
      }
    },
    [login, toast]
  );

  return (
    <Box
      className="premium-card"
      w="full"
      maxW="420px"
      p={{ base: 5, md: 6 }}
      borderColor="rgba(142, 9, 9, 0.16)"
      background="linear-gradient(180deg, #FFFFFF 0%, #FFFBF2 100%)"
    >
      <VStack spacing={4} align="stretch">
        <HStack spacing={3} justify="center">
          <Box
            p={1.5}
            borderRadius="12px"
            bg="linear-gradient(145deg, #871010 0%, #B92E2E 60%, #D3A445 100%)"
            boxShadow="0 6px 16px rgba(113, 24, 10, 0.2)"
          >
            <Image src={logo} alt="Dip & Dash" w="34px" h="34px" objectFit="contain" />
          </Box>
          <Box textAlign="left">
            <Text fontFamily="heading" fontWeight={800} fontSize={{ base: "lg", md: "xl" }} color="#231510">
              Dip & Dash
            </Text>
            <Text fontSize="sm" color="#6A5750">
              Administration Portal
            </Text>
          </Box>
        </HStack>
        <Box textAlign="center">
          <Text fontFamily="heading" fontWeight={800} fontSize={{ base: "2xl", md: "2.6xl" }} color="#1F1512">
            Welcome Back
          </Text>
          <Text color="#63544D">Sign in to manage your business operations.</Text>
        </Box>
        <VStack
          as="form"
          align="stretch"
          spacing={4}
          onSubmit={handleSubmit(onSubmit)}
        >
          <AppInput
            label="Username"
            placeholder="Enter username"
            error={errors.username?.message}
            size="lg"
            {...register("username")}
          />
          <AppPasswordInput
            label="Password"
            placeholder="Enter password"
            error={errors.password?.message}
            size="lg"
            {...register("password")}
          />
          <AppButton
            type="submit"
            isLoading={isSubmitting}
            loadingText="Signing in..."
            size="lg"
            mt={1}
            bgGradient="linear(92deg, accentRed.700 0%, accentRed.500 42%, brand.400 100%)"
            color="white"
            _hover={{
              bgGradient: "linear(92deg, accentRed.800 0%, accentRed.600 44%, brand.500 100%)",
              transform: "translateY(-1px)"
            }}
            _active={{ transform: "translateY(0)" }}
          >
            Sign In
          </AppButton>
        </VStack>
      </VStack>
    </Box>
  );
};
