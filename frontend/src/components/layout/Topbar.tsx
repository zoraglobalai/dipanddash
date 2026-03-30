import {
  Avatar,
  Box,
  Button,
  HStack,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text
} from "@chakra-ui/react";
import { FiMenu } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import { ActionIconButton } from "@/components/ui/ActionIconButton";
import { APP_ROUTES } from "@/constants/routes";
import type { AuthUser } from "@/types/auth";

type TopbarProps = {
  user: AuthUser;
  roleLabel: string;
  onOpenMobileNav: () => void;
  onLogout: () => void;
};

export const Topbar = ({ user, roleLabel, onOpenMobileNav, onLogout }: TopbarProps) => {
  const navigate = useNavigate();

  return (
    <HStack
      justify="space-between"
      py={3.5}
      px={{ base: 4, md: 6, xl: 8 }}
      borderBottom="1px solid"
      borderColor="rgba(120, 73, 53, 0.16)"
      bg="linear-gradient(180deg, #FFFDF8 0%, #FFF9EF 100%)"
      position="sticky"
      top={0}
      zIndex={20}
      backdropFilter="blur(6px)"
    >
      <HStack spacing={3}>
        <ActionIconButton
          aria-label="Open navigation"
          icon={<FiMenu size={18} />}
          onClick={onOpenMobileNav}
          display={{ base: "inline-flex", lg: "none" }}
          variant="outline"
          borderColor="rgba(142, 9, 9, 0.2)"
          color="#7A2620"
        />
        <Box>
          <Text fontWeight={800} color="#2A1813">
            Dip & Dash {roleLabel}
          </Text>
          <Text fontSize="sm" color="#735C52">
            Business command center
          </Text>
        </Box>
      </HStack>

      <Menu>
        <MenuButton as={Button} variant="ghost" px={2} _hover={{ bg: "rgba(193, 14, 14, 0.06)" }}>
          <HStack spacing={3}>
            <Avatar
              name={user.fullName}
              size="sm"
              bg="linear-gradient(130deg, #8E0909 0%, #D1A13D 100%)"
              color="white"
            />
            <Box textAlign="right" display={{ base: "none", md: "block" }}>
              <Text fontWeight={700} lineHeight={1.1} color="#2B1914">
                {user.fullName}
              </Text>
              <Text fontSize="xs" color="#735C52" textTransform="capitalize">
                {user.role.replace("_", " ")}
              </Text>
            </Box>
          </HStack>
        </MenuButton>
        <MenuList borderRadius="14px" borderColor="rgba(120, 73, 53, 0.2)" bg="#FFFDF8">
          <MenuItem onClick={() => navigate(APP_ROUTES.PROFILE)}>Profile</MenuItem>
          <MenuItem color="accentRed.600" onClick={onLogout}>
            Logout
          </MenuItem>
        </MenuList>
      </Menu>
    </HStack>
  );
};
