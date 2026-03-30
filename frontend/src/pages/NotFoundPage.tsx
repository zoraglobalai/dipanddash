import { Box } from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";

import { EmptyState } from "@/components/common/EmptyState";
import { AppButton } from "@/components/ui/AppButton";

export const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <Box minH="100vh" display="grid" placeItems="center" px={4}>
      <EmptyState
        title="Page Not Found"
        description="The page you requested does not exist or has been moved."
        action={<AppButton onClick={() => navigate("/dashboard")}>Go to Dashboard</AppButton>}
      />
    </Box>
  );
};

