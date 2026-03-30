import { Box } from "@chakra-ui/react";

import { Loader } from "./Loader";

export const SectionLoader = () => {
  return (
    <Box className="premium-card" p={4}>
      <Loader minHeight="140px" />
    </Box>
  );
};

