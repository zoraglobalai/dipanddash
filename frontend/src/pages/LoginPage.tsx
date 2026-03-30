import { Badge, Box, Container, Flex, HStack, Image, Text, VStack } from "@chakra-ui/react";
import { Navigate } from "react-router-dom";

import { LoginFormCard } from "@/features/auth/components/LoginFormCard";
import { useAuth } from "@/context/AuthContext";
import { APP_ROUTES } from "@/constants/routes";
import { UserRole } from "@/types/role";
import logo from "@/assets/logo.png";

export const LoginPage = () => {
  const { isAuthenticated, user } = useAuth();

  if (isAuthenticated && user) {
    return <Navigate to={user.role === UserRole.ADMIN ? APP_ROUTES.ADMIN_DASHBOARD : APP_ROUTES.LOGIN} replace />;
  }

  return (
    <Box minH="100dvh" className="soft-grid-bg" py={{ base: 3, md: 4 }} display="flex" alignItems="center">
      <Container maxW="1120px">
        <Flex
          minH={{ base: "auto", lg: "560px" }}
          borderRadius={{ base: "22px", md: "26px" }}
          overflow="hidden"
          border="1px solid"
          borderColor="rgba(193, 14, 14, 0.2)"
          boxShadow="0 24px 62px rgba(24, 11, 6, 0.12)"
          bg="white"
          direction={{ base: "column", lg: "row" }}
        >
          <Box
            flex={{ base: "0 0 auto", lg: "1.15" }}
            px={{ base: 6, md: 8, xl: 10 }}
            py={{ base: 7, md: 8, xl: 9 }}
            bg="linear-gradient(152deg, #5B0707 0%, #861111 38%, #A31F1F 72%, #C49130 100%)"
            color="white"
            position="relative"
            display="flex"
            alignItems="center"
          >
            <VStack align="stretch" spacing={{ base: 4, md: 5 }} maxW="520px" position="relative" zIndex={1}>
              <HStack spacing={4}>
                <Image
                  src={logo}
                  alt="Dip & Dash"
                  w={{ base: "44px", md: "50px" }}
                  h={{ base: "44px", md: "50px" }}
                  objectFit="contain"
                  mixBlendMode="multiply"
                  filter="contrast(1.06) saturate(1.05)"
                />
                <Box>
                  <Text fontFamily="heading" fontWeight={800} fontSize={{ base: "2xl", md: "3xl" }} lineHeight={1.02}>
                    Dip & Dash
                  </Text>
                  <Text opacity={0.9}>Secure business management suite</Text>
                </Box>
              </HStack>
              <Badge
                alignSelf="flex-start"
                px={3}
                py={1}
                borderRadius="full"
                colorScheme="yellow"
                bg="rgba(255, 220, 124, 0.15)"
                color="#FFE8B0"
                border="1px solid rgba(255, 231, 166, 0.32)"
              >
                Premium Admin Experience
              </Badge>
              <Text
                fontFamily="heading"
                fontWeight={800}
                fontSize={{ base: "2xl", md: "3xl", xl: "3.4xl" }}
                lineHeight={{ base: 1.24, md: 1.2 }}
                color="rgba(255, 255, 255, 0.98)"
              >
                Control your operations with speed, clarity, and confidence.
              </Text>
              <VStack align="stretch" spacing={2.5} color="rgba(255, 255, 255, 0.93)">
                <HStack align="start" spacing={3}>
                  <Box mt="8px" w="8px" h="8px" borderRadius="full" bg="rgba(255, 214, 84, 0.95)" />
                  <Text>Track daily performance and staff activity in one place.</Text>
                </HStack>
                <HStack align="start" spacing={3}>
                  <Box mt="8px" w="8px" h="8px" borderRadius="full" bg="rgba(255, 214, 84, 0.95)" />
                  <Text>Stay secured with role-based access and protected workflows.</Text>
                </HStack>
              </VStack>
            </VStack>
            <Box
              position="absolute"
              w={{ base: "150px", md: "210px" }}
              h={{ base: "150px", md: "210px" }}
              borderRadius="full"
              bg="radial-gradient(circle, rgba(255, 214, 84, 0.26) 0%, rgba(255, 214, 84, 0) 72%)"
              top={{ base: "-64px", md: "-88px" }}
              right={{ base: "-38px", md: "-54px" }}
            />
            <Box
              position="absolute"
              w={{ base: "150px", md: "190px" }}
              h={{ base: "150px", md: "190px" }}
              borderRadius="full"
              bg="radial-gradient(circle, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0) 74%)"
              bottom={{ base: "-74px", md: "-95px" }}
              left={{ base: "-52px", md: "-74px" }}
            />
          </Box>

          <Box
            flex={{ base: "0 0 auto", lg: "0.95" }}
            p={{ base: 5, sm: 6, md: 7 }}
            bg="linear-gradient(180deg, #FFFCF5 0%, #FFFFFF 50%, #FFF9EE 100%)"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <VStack w="full" maxW="470px" spacing={5}>
              <LoginFormCard />
              <Text fontSize="sm" color="gray.600" textAlign="center">
                Dip & Dash secure administration portal
              </Text>
            </VStack>
          </Box>
        </Flex>
      </Container>
    </Box>
  );
};
