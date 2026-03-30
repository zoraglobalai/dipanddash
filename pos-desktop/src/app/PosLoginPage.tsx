import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Image,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  VStack,
  useToast
} from "@chakra-ui/react";
import { useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";

import logo from "@/assets/logo.png";
import { usePosAuth } from "@/app/PosAuthContext";

export const PosLoginPage = () => {
  const toast = useToast();
  const { login } = usePosAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) {
      toast({
        status: "warning",
        title: "Enter username and password"
      });
      return;
    }

    setIsLoading(true);
    try {
      await login({
        username: username.trim(),
        password
      });
      toast({
        status: "success",
        title: "Login successful"
      });
    } catch (error) {
      toast({
        status: "error",
        title: "Unable to sign in",
        description: error instanceof Error ? error.message : "Please check credentials and try again."
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="linear-gradient(165deg, #FFF4DF 0%, #FFF8F0 36%, #FFFDFA 78%, #FFFFFF 100%)"
      px={4}
    >
      <Box
        w="full"
        maxW="470px"
        bg="white"
        borderRadius="22px"
        border="1px solid"
        borderColor="rgba(167, 101, 47, 0.18)"
        boxShadow="0 24px 48px rgba(42, 26, 20, 0.12)"
        px={8}
        py={7}
      >
        <VStack spacing={5} align="stretch">
          <HStack spacing={3}>
            <Box
              borderRadius="14px"
              bg="white"
              border="1px solid rgba(167, 101, 47, 0.24)"
              boxShadow="0 10px 22px rgba(78, 17, 17, 0.12)"
              p={2}
            >
              <Image src={logo} alt="Dip & Dash" boxSize="44px" objectFit="contain" />
            </Box>
            <Box>
              <Text fontSize="2xl" fontWeight={900} color="#2A1A14">
                Dip & Dash POS
              </Text>
              <Text color="#7A6258">Staff desktop login</Text>
            </Box>
          </HStack>

          <FormControl>
            <FormLabel fontWeight={700}>Username</FormLabel>
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Enter username"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void submit();
                }
              }}
            />
          </FormControl>

          <FormControl>
            <FormLabel fontWeight={700}>Password</FormLabel>
            <InputGroup>
              <Input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                type={showPassword ? "text" : "password"}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void submit();
                  }
                }}
              />
              <InputRightElement>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPassword((previous) => !previous)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </Button>
              </InputRightElement>
            </InputGroup>
          </FormControl>

          <Button
            h="46px"
            bgGradient="linear(95deg, #8E0909 0%, #BE3329 44%, #D3A23D 100%)"
            color="white"
            _hover={{
              bgGradient: "linear(95deg, #7A0707 0%, #A12822 44%, #B98B34 100%)"
            }}
            isLoading={isLoading}
            loadingText="Signing in..."
            onClick={() => void submit()}
          >
            Sign In
          </Button>
          <Text textAlign="center" color="#6D584E" fontSize="sm">
            Use staff credentials created by admin.
          </Text>
        </VStack>
      </Box>
    </Box>
  );
};

